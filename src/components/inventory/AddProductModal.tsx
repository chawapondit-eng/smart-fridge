'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';
import toast from 'react-hot-toast';
import { X, Plus, Sparkles, Receipt, Refrigerator, Calendar, Bell, Camera, AlertCircle, Lock } from 'lucide-react';
import { getAutoEmoji } from './EditProductModal';
import {
  addDaysFromBangkokToday,
  getDaysUntilExpiry,
  formatThaiDate,
  formatExpiryLabel,
  getReminderBeforeDays,
  setReminderBeforeDays,
  normalizeDateString,
} from '@/lib/date';

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
  const router = useRouter();
  const supabase = createClient();
  const { currentHousehold, fridges, authUser, user, canAddItems } = useHousehold();

  const [name, setName] = useState('');
  const [fridgeId, setFridgeId] = useState(defaultFridgeId || fridges[0]?.id || '');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('ชิ้น');
  const [expiryDate, setExpiryDate] = useState('');
  const [daysUntilInput, setDaysUntilInput] = useState('');
  const [reminderBeforeDays, setReminderBeforeDaysState] = useState<number>(3);
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ซิงค์ตู้เย็นปลายทางและค่าแจ้งเตือนล่วงหน้าทุกครั้งที่เปิด Modal
  useEffect(() => {
    if (isOpen) {
      if (defaultFridgeId && fridges.some((f) => f.id === defaultFridgeId)) {
        setFridgeId(defaultFridgeId);
      } else if (!fridgeId || !fridges.some((f) => f.id === fridgeId)) {
        setFridgeId(fridges[0]?.id || '');
      }
      setReminderBeforeDaysState(getReminderBeforeDays(currentHousehold?.id));
    }
  }, [isOpen, defaultFridgeId, fridges, fridgeId, currentHousehold?.id]);

  // เมื่อผู้ใช้กรอก "หมดอายุในอีก X วัน" -> คำนวณ expiry_date = todayBangkok + X วัน
  function handleDaysUntilChange(val: string) {
    setDaysUntilInput(val);
    if (val.trim() === '') {
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 0 && num <= 3650) {
      setExpiryDate(addDaysFromBangkokToday(num));
    }
  }

  // เมื่อผู้ใช้เลือกวันที่จาก Date Picker -> บันทึกตรงตามที่เลือก ห้ามเลื่อนวันเอง
  function handleDatePickerChange(val: string) {
    const clean = normalizeDateString(val) || '';
    setExpiryDate(clean);
    if (clean) {
      const diff = getDaysUntilExpiry(clean);
      setDaysUntilInput(diff !== null && diff >= 0 ? String(diff) : '');
    } else {
      setDaysUntilInput('');
    }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('ขนาดรูปภาพต้องไม่เกิน 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) {
        setImageUrl(result);
        toast.success('เลือกรูปวัตถุดิบเรียบร้อย');
      }
    };
    reader.readAsDataURL(file);
  }

  const calculatedDaysLeft = getDaysUntilExpiry(expiryDate);

  const targetFridge = fridges.find((f) => f.id === (fridgeId || defaultFridgeId || fridges[0]?.id));

  if (!isOpen) return null;

  function applyPreset(preset: typeof COMMON_PRESETS[0]) {
    setName(preset.name);
    setUnit(preset.unit);
    setQuantity(String(preset.defaultQty));
    setImageUrl(getAutoEmoji(preset.name));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!canAddItems) {
      toast.error('คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }

    if (!name.trim()) {
      toast.error('กรุณากรอกชื่อสินค้า');
      return;
    }

    if (!currentHousehold?.id || !authUser?.id) {
      toast.error('ไม่พบข้อมูลครัวเรือนหรือบัญชีผู้ใช้');
      return;
    }

    const targetFridgeId = fridgeId || fridges[0]?.id;
    if (!targetFridgeId || !fridges.some((f) => f.id === targetFridgeId)) {
      toast.error('กรุณาเลือกหรือสร้างตู้เย็นก่อนเพิ่มสินค้า');
      return;
    }

    const numQty = parseFloat(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      toast.error('กรุณากรอกจำนวนสินค้าที่มากกว่า 0');
      return;
    }
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

      // 1. เพิ่มสินค้าลงใน items พร้อม added_by, fridge_id และ household_id ที่ถูกต้อง
      const itemPayload: Record<string, unknown> = {
        id: itemId,
        fridge_id: targetFridgeId,
        household_id: currentHousehold.id,
        name: name.trim(),
        quantity: numQty,
        unit: unit.trim() || 'ชิ้น',
        image_url: finalEmoji,
        notes: notes.trim() || null,
        status: numQty <= 0 ? 'out_of_stock' : numQty <= 1 ? 'low_stock' : 'in_stock',
        added_by: authUser.id,
      };

      let { data: itemData, error: itemError } = await supabase
        .from('items')
        .insert(itemPayload)
        .select()
        .single();

      // Fallback ถ้าคอลัมน์เสริมบางตัวไม่มีในตาราง
      if (
        itemError &&
        (itemError.message?.includes('status') ||
          itemError.message?.includes('image_url') ||
          itemError.message?.includes('notes') ||
          itemError.message?.includes('added_by'))
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

      // บันทึกการตั้งค่าแจ้งเตือนล่วงหน้า (แยกออกจาก expiry_date ไม่เปลี่ยนแปลงวันหมดอายุจริง)
      setReminderBeforeDays(reminderBeforeDays, currentHousehold.id);
      const cleanExpiryDate = normalizeDateString(expiryDate);

      // 2. ถ้ามีวันหมดอายุ สร้าง Batch ลง item_batches (ใช้ YYYY-MM-DD ตรงตามปฏิทิน)
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
            expiry_date: cleanExpiryDate,
            added_by: authUser.id,
            notes: notes.trim() || null,
          });

          // ถ้าไม่มี added_by ในตาราง ให้ลอง insert โดยไม่มี added_by
          if (bRes.error && bRes.error.message?.includes('added_by')) {
            await supabase.from('item_batches').insert({
              id: batchId,
              item_id: finalItemId,
              quantity: numQty,
              expiry_date: cleanExpiryDate,
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
              expiry_date: cleanExpiryDate,
              reminder_before_days: reminderBeforeDays,
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
      setDaysUntilInput('');
      setImageUrl('');
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

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 flex items-center justify-center shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">
              เพิ่มวัตถุดิบลง: {targetFridge ? `${targetFridge.icon || '❄️'} ${targetFridge.name}` : 'ตู้เย็น'}
            </h3>
            <p className="text-xs text-muted">
              บ้าน: {currentHousehold?.name || 'ครัวเรือนของคุณ'} • กรอกข้อมูลของสดเพื่อติดตามวันหมดอายุ
            </p>
          </div>
        </div>

        {/* Permission Notice if cannot add */}
        {!canAddItems && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">สิทธิ์การใช้งานจำกัด (ดูข้อมูลได้อย่างเดียว)</p>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                เจ้าของบ้านกำหนดให้บัญชีของคุณดูข้อมูลได้อย่างเดียว ไม่สามารถเพิ่มวัตถุดิบใหม่ได้
              </p>
            </div>
          </div>
        )}

        {/* Quick Receipt Scan Action */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/receipts${targetFridge ? `?fridgeId=${targetFridge.id}` : ''}`);
            }}
            className="w-full py-2.5 px-4 rounded-xl border border-primary-200 dark:border-primary-900 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-98 shadow-xs"
          >
            <Receipt className="w-4 h-4 text-primary-600" />
            <span>🧾 สแกนใบเสร็จนำเข้าตู้เย็นอัตโนมัติ</span>
          </button>
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

          {/* Photo Upload (Optional) */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-container-low/60">
            <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center overflow-hidden shrink-0 text-2xl">
              {imageUrl?.startsWith('data:image') || imageUrl?.startsWith('http') ? (
                <img src={imageUrl} alt={name || 'วัตถุดิบ'} className="w-full h-full object-cover" />
              ) : (
                <span>{imageUrl || getAutoEmoji(name || 'สินค้า')}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card hover:bg-surface-container border border-border text-xs font-semibold text-foreground cursor-pointer transition">
                <Camera className="w-3.5 h-3.5 text-primary-600" />
                <span>ถ่ายรูป / เลือกรูปวัตถุดิบ</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-muted mt-1">ไม่บังคับ • ระบบเลือกไอคอนให้อัตโนมัติหากไม่อัปโหลด</p>
            </div>
          </div>

          {/* Expiry Date & Days Until Expiry (Asia/Bangkok Calendar Date) */}
          <div className="p-3.5 rounded-2xl border border-border bg-surface-container-low/50 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary-600" />
                <span>วันหมดอายุ (เวลาไทย)</span>
              </label>
              {expiryDate && (
                <button
                  type="button"
                  onClick={() => handleDatePickerChange('')}
                  className="text-[11px] text-muted hover:text-rose-500 font-medium"
                >
                  ล้างวันที่
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <span className="block text-[11px] text-muted mb-1">เลือกวันที่หมดอายุจริง</span>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => handleDatePickerChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
                />
              </div>
              <div>
                <span className="block text-[11px] text-muted mb-1">หรือกรอก &quot;หมดอายุในอีก (วัน)&quot;</span>
                <input
                  type="number"
                  min="0"
                  max="3650"
                  value={daysUntilInput}
                  onChange={(e) => handleDaysUntilChange(e.target.value)}
                  placeholder="เช่น 3, 7, 14"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
                />
              </div>
            </div>

            {/* Quick Days Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'วันนี้', days: 0 },
                { label: '+1 วัน', days: 1 },
                { label: '+3 วัน', days: 3 },
                { label: '+7 วัน', days: 7 },
                { label: '+14 วัน', days: 14 },
              ].map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => handleDaysUntilChange(String(preset.days))}
                  className="px-2.5 py-1 rounded-lg border border-border bg-card hover:border-primary-500 hover:text-primary-600 text-[11px] font-semibold text-muted transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Live Calendar Confirmation */}
            {expiryDate && (
              <div className="text-xs px-3 py-2 rounded-xl bg-card border border-border/80 flex items-center justify-between gap-2">
                <span className="text-muted">วันหมดอายุที่บันทึก:</span>
                <span className="font-bold text-foreground">
                  {formatThaiDate(expiryDate)} ({formatExpiryLabel(calculatedDaysLeft)})
                </span>
              </div>
            )}

            {/* Separate Reminder Setting (never alters expiry_date) */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
              <label className="text-[11px] text-muted flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>แจ้งเตือนล่วงหน้าก่อนหมดอายุ</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={reminderBeforeDays}
                  onChange={(e) =>
                    setReminderBeforeDaysState(Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)))
                  }
                  className="w-14 px-2 py-1 rounded-lg border border-border bg-background text-xs font-bold text-center text-foreground outline-none focus:border-primary-500"
                />
                <span className="text-[11px] text-muted">วัน</span>
              </div>
            </div>
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

          {/* Target Fridge Confirmation Banner */}
          {targetFridge && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-primary-500/10 border border-primary-500/25 text-xs">
              <Refrigerator className="w-4 h-4 text-primary-600 shrink-0" />
              <span className="text-foreground">
                จะบันทึกลงในตู้เย็น:{' '}
                <strong className="text-primary-600 dark:text-primary-400">
                  {targetFridge.icon || '❄️'} {targetFridge.name}
                </strong>
              </span>
            </div>
          )}

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
              disabled={submitting || !canAddItems}
              className="px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] disabled:opacity-50 shadow-sm shadow-primary-600/20 transition flex items-center gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : !canAddItems ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{!canAddItems ? 'ไม่มีสิทธิ์เพิ่มสินค้า' : 'บันทึกสินค้า'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

