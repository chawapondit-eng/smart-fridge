'use client';

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, Wallet, Check } from 'lucide-react';
import { saveWeeklyBudgetToDb } from '@/lib/budget';
import { createClient } from '@/lib/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';

interface EditBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  householdId: string;
  currentBudget: number;
  onSuccess: (newBudget: number) => void;
}

export function EditBudgetModal({
  isOpen,
  onClose,
  householdId,
  currentBudget,
  onSuccess,
}: EditBudgetModalProps) {
  const supabase = createClient();
  const { authUser } = useHousehold();
  const [amount, setAmount] = useState(String(currentBudget));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount(String(currentBudget));
    }
  }, [currentBudget, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('กรุณากรอกจำนวนเงินงบประมาณที่ถูกต้อง');
      return;
    }

    setSaving(true);
    try {
      await saveWeeklyBudgetToDb(supabase, householdId, authUser?.id, parsed);
      toast.success(`ตั้งค่างบประมาณสัปดาห์นี้เป็น ฿${parsed.toLocaleString()} เรียบร้อยแล้ว! 🎯`);
      onSuccess(parsed);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-muted hover:text-foreground hover:bg-muted/10 transition"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-base text-foreground">
              ตั้งค่างบประมาณสัปดาห์นี้
            </h3>
            <p className="text-xs text-muted">
              กำหนดเป้าหมายค่าอาหารประจำสัปดาห์
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              งบประมาณ (บาท / สัปดาห์)
            </label>
            <div className="relative flex items-center rounded-2xl bg-surface-container-low border border-border px-3.5 py-2.5 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20">
              <span className="text-base font-bold text-primary-600 mr-2">฿</span>
              <input
                type="number"
                min="100"
                step="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="เช่น 3000"
                className="w-full bg-transparent font-sans font-bold text-lg text-foreground outline-none"
                autoFocus
                required
              />
            </div>
          </div>

          {/* Quick preset amounts */}
          <div className="flex items-center gap-2">
            {[1500, 2500, 3000, 5000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className="flex-1 py-1.5 rounded-xl border border-border bg-surface-container-lowest hover:border-primary-500 hover:text-primary-600 text-xs font-semibold transition"
              >
                ฿{preset.toLocaleString()}
              </button>
            ))}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white font-bold text-sm shadow-md shadow-primary-500/25 flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{saving ? 'กำลังบันทึก...' : 'บันทึกงบประมาณ'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

