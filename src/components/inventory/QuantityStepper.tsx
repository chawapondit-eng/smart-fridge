'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';
import toast from 'react-hot-toast';
import { Plus, Minus } from 'lucide-react';

interface QuantityStepperProps {
  itemId: string;
  initialQuantity: number;
  unit?: string;
  itemName?: string;
  fridgeId?: string;
  onQuantityChange?: (newQty: number) => void;
}

export function QuantityStepper({
  itemId,
  initialQuantity,
  unit = 'ชิ้น',
  itemName = 'สินค้า',
  fridgeId,
  onQuantityChange,
}: QuantityStepperProps) {
  const supabase = createClient();
  const { authUser, user, currentHousehold, canEditItems } = useHousehold();

  const [quantity, setQuantity] = useState(initialQuantity);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setQuantity(initialQuantity);
  }, [initialQuantity]);

  async function adjustQuantity(change: number) {
    if (!authUser?.id) {
      toast.error('กรุณาเข้าสู่ระบบ');
      return;
    }
    if (!canEditItems) {
      toast.error('คุณไม่มีสิทธิ์แก้ไขจำนวนวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว)');
      return;
    }

    const targetQty = quantity + change;
    if (targetQty < 0) {
      toast('สินค้าหมดแล้ว ไม่สามารถลดได้อีก');
      return;
    }

    const prevQty = quantity;
    setQuantity(targetQty);
    if (onQuantityChange) onQuantityChange(targetQty);
    setUpdating(true);

    try {
      const { data, error } = await supabase.rpc('update_item_quantity', {
        p_item_id: itemId,
        p_change: change,
        p_user_id: authUser.id,
      });

      if (error) {
        const { error: directError } = await supabase
          .from('items')
          .update({
            quantity: targetQty,
            status: targetQty === 0 ? 'out_of_stock' : targetQty <= 1 ? 'low_stock' : 'in_stock',
            updated_at: new Date().toISOString(),
          })
          .eq('id', itemId);

        if (directError) throw directError;
      } else if (data && data.length > 0) {
        setQuantity(Number(data[0].new_quantity));
      }

      const currentUserName = user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก';
      const actionType = change > 0 ? 'quantity_increased' : 'quantity_decreased';
      const absAmount = Math.abs(change);

      try {
        await supabase.from('activity_logs').insert({
          household_id: currentHousehold?.id || null,
          fridge_id: fridgeId || null,
          item_id: itemId,
          user_id: authUser.id,
          action: actionType,
          details: {
            user_name: currentUserName,
            item_name: itemName,
            amount: absAmount,
            change: change,
            previous_quantity: prevQty,
            new_quantity: targetQty,
            unit: unit || 'ชิ้น',
          },
        });
      } catch (logErr) {
        console.warn('Logging activity warning:', logErr);
      }

      if (change < 0) {
        toast.success(`หยิบ "${itemName}" ออก ${absAmount} ${unit} (เหลือ ${targetQty} ${unit})`, {
          icon: '👋',
          duration: 2000,
        });
      } else {
        toast.success(`เติม "${itemName}" เพิ่ม ${absAmount} ${unit} (รวมเป็น ${targetQty} ${unit})`, {
          icon: '📥',
          duration: 2000,
        });
      }
    } catch (err: unknown) {
      setQuantity(prevQty);
      if (onQuantityChange) onQuantityChange(prevQty);
      const msg = err instanceof Error ? err.message : 'อัปเดตจำนวนไม่สำเร็จ';
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="inline-flex items-center rounded-full border border-border bg-surface-container-low p-1 gap-1 shadow-[var(--shadow-xs)] shrink-0">
      <button
        type="button"
        onClick={() => adjustQuantity(-1)}
        disabled={updating || quantity <= 0}
        className="w-7 h-7 rounded-full bg-card border border-border/80 flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-container active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
        title="ลดจำนวน 1"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      <div className="min-w-[38px] px-1.5 text-center tabular-nums">
        <span className="text-xs font-bold text-foreground">
          {quantity}
        </span>
        <span className="text-[10px] text-muted ml-0.5 hidden sm:inline">
          {unit}
        </span>
      </div>

      <button
        type="button"
        onClick={() => adjustQuantity(1)}
        disabled={updating}
        className="w-7 h-7 rounded-full bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shadow-[0_2px_6px_-1px_rgba(234,88,12,0.4)] active:scale-95 disabled:opacity-35 transition cursor-pointer"
        title="เพิ่มจำนวน 1"
      >
        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
      </button>
    </div>
  );
}
