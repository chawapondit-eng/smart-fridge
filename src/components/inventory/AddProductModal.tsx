'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';
import toast from 'react-hot-toast';
import { X, Plus, Sparkles, Upload } from 'lucide-react';
import { getAutoEmoji } from './EditProductModal';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFridgeId?: string;
  onSuccess?: () => void;
}

const COMMON_PRESETS = [
  { name: 'ไข่ไก่', category: 'อาหาร', unit: 'ฟอง', defaultQty: 10 },
  { name: 'นมสด', category: 'นม-ผลิตภัณฑ์นม', unit: 'กล่อง', defaultQty: 2 },
  { name: 'น้ำดื่ม', category: 'เครื่องดื่ม', unit: 'ขวด', defaultQty: 6 },
  { name: 'ขนมปัง', category: 'อาหาร', unit: 'แถว', defaultQty: 1 },
  { name: 'เนยสด', category: 'นม-ผลิตภัณฑ์นม', unit: 'ก้อน', defaultQty: 1 },
];

export function AddProductModal({
  isOpen,
  onClose,
  defaultFridgeId,
  onSuccess,
}: AddProductModalProps) {
  const supabase = createClient();
  const { currentHousehold, fridges, authUser, user } = useHousehold();

  const [name, setName] = useState('');
  const [fridgeId, setFridgeId] = useState(defaultFridgeId || fridges[0]?.id || '');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('ชิ้น');
  const [expiryDate, setExpiryDate] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  function applyPreset(preset: typeof COMMON_PRESETS[0]) {
    setName(preset.name);
    setUnit(preset.unit);
    setQuantity(String(preset.defaultQty));
    setImageUrl(getAutoEmoji(preset.name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('กรุณากรอกชื่อสินค้า');
      return;
    }

    if (!currentHousehold?.id || !authUser?.id) {
      toast.error('ไม่พบข้อมูลครัวเรือนหรือบัญชีผู้ใช้');
      return;
    }

    const targetFridgeId = fridgeId || fridges[0]?.id;
    if (!targetFridgeId) {
      toast.error('กรุณาสร้างตู้เย็นก่อนเพิ่มสินค้า');
      return;
    }

    const numQty = parseFloat(quantity) || 1;
    setSubmitting(true);

    try {
      const itemId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      const finalEmoji = imageUrl || getAutoEmoji(name.trim());

      // 1. เพิ่มสินค้าลงใน items
      let itemPayload: Record<string, unknown> = {
        id: itemId,
        fridge_id: targetFridgeId,
        household_id: currentHousehold.id,
        name: name.trim(),
        quantity: numQty,
        unit: unit.trim() || 'ชิ้น',
        image_url: finalEmoji,
        notes: notes.trim() || null,
        status: numQty <= 0 ? 'out_of_stock' : numQty <= 1 ? 'low_stock' : 'in_stock',
      };

      let { data: itemData, error: itemError } = await supabase
        .from('items')
        .insert(itemPayload)
        .select()
        .single();

      // Fallback ถ้าคอลัมน์ status หรือ image_url ไม่มีในตาราง
      if (
        itemError &&
        (itemError.message?.includes('status') ||
          itemError.message?.includes('image_url') ||
          itemError.message?.includes('notes'))
      ) {
        const retryPayload: Record<string, unknown> = {
          id: itemId,
          fridge_id: targetFridgeId,
          household_id: currentHousehold.id,
          name: name.trim(),
          quantity: numQty,
          unit: unit.trim() || 'ชิ้น',
        };
        const retry = await supabase.from('items').insert(retryPayload).select().single();
        itemData = retry.data;
        itemError = retry.error;
      }

      if (itemError) throw itemError;

      const finalItemId = itemData?.id || itemId;

      // 2. ถ้ามีวันหมดอายุ สร้าง Batch ลง item_batches
      if (finalItemId) {
        try {
          const batchId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                  const r = (Math.random() * 16) | 0;
                  const v = c === 'x' ? r : (r & 0x3) | 0x8;
                  return v.toString(16);
                });

          const bRes = await supabase.from('item_batches').insert({
            id: batchId,
            item_id: finalItemId,
            quantity: numQty,
            expiry_date: expiryDate ? expiryDate : null,
            added_by: authUser.id,
            notes: notes.trim() || null,
          });

          // ถ้าไม่มี added_by ในตาราง ให้ลอง insert โดยไม่มี added_by
          if (bRes.error && bRes.error.message?.includes('added_by')) {
            await supabase.from('item_batches').insert({
              id: batchId,
              item_id: finalItemId,
              quantity: numQty,
              expiry_date: expiryDate ? expiryDate : null,
              notes: notes.trim() || null,
            });
          }
        } catch {
          // ignore batch insert issue
        }

        // 3. บันทึก Activity Log
        try {
          await supabase.from('activity_logs').insert({
            household_id: currentHousehold.id,
            fridge_id: targetFridgeId,
            item_id: finalItemId,
            user_id: authUser.id,
            action: 'item_added',
            details: {
              user_name: user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก',
              item_name: name.trim(),
              quantity: numQty,
              amount: numQty,
              unit: unit.trim() || 'ชิ้น',
              expiry_date: expiryDate || null,
            },
          });
        } catch {
          // ignore activity log issue
        }
      }

      toast.success(`เพิ่ม "${name}" ลงในตู้เย็นแล้ว`);
      // Reset form
      setName('');
      setQuantity('1');
      setExpiryDate('');
      setNotes('');
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error('Add product error:', err);
      let msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
          ? err.message
          : 'เพิ่มสินค้าไม่สำเร็จ';

      if (msg.includes('public.items') || msg.includes('schema cache')) {
        msg = 'ยังไม่มีตาราง items บน Supabase กรุณารัน SQL Script ใน Supabase SQL Editor ก่อนครับ';
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted/10 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              เพิ่มสินค้าลงตู้เย็น
            </h3>
            <p className="text-xs text-muted">
              กรอกข้อมูลของสดหรืออาหารที่ต้องการจัดเก็บ
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>เลือกของยอดนิยม:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 rounded-lg border border-border bg-background hover:border-primary-500 hover:text-primary-600 text-xs text-muted transition"
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              ชื่อสินค้า <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น นมสด Meiji, ไข่ไก่เบอร์ 2"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            />
          </div>

          {/* Fridge Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              เลือกตู้เย็นที่จัดเก็บ
            </label>
            <select
              value={fridgeId || (fridges[0]?.id ?? '')}
              onChange={(e) => setFridgeId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            >
              {fridges.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon} {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                จำนวน
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                หน่วยนับ
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
              >
                <option value="ชิ้น">ชิ้น</option>
                <option value="ขวด">ขวด</option>
                <option value="กล่อง">กล่อง</option>
                <option value="แพ็ก">แพ็ก</option>
                <option value="ฟอง">ฟอง</option>
                <option value="กิโลกรัม">กิโลกรัม (กก.)</option>
                <option value="กรัม">กรัม</option>
                <option value="ถุง">ถุง</option>
                <option value="กระป๋อง">กระป๋อง</option>
              </select>
            </div>
          </div>

          {/* Expiry Date */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              วันหมดอายุ (ไม่บังคับ)
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              บันทึกเพิ่มเติม (ไม่บังคับ)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น เปิดขวดแล้ว, ซื้อจากตลาดนัด"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/10 transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60 shadow-sm shadow-primary-600/20 transition flex items-center gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>บันทึกสินค้า</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

