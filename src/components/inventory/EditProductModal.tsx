'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';
import { X, Edit2, Upload, Calendar, AlertCircle, Lock } from 'lucide-react';
import type { Item, ItemBatch } from '@/types/database';
import toast from 'react-hot-toast';
import { compressImage } from '@/lib/imageCompression';
import {
  normalizeDateString,
  addDaysFromBangkokToday,
  getDaysUntilExpiry,
  formatThaiDate,
  formatExpiryLabel,
} from '@/lib/date';

interface ItemWithBatches extends Item {
  item_batches?: ItemBatch[];
}

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ItemWithBatches | null;
  onSuccess: () => void;
}

export const FOOD_EMOJIS = [
  '🥚', '🥛', '🥩', '🍗', '🐟', '🦐', '🥬', '🥦', '🥕', '🍅',
  '🍎', '🍌', '🍓', '🥑', '🌽', '🍄', '🍞', '🧀', '🧈', '🍚',
  '🥤', '🧃', '☕', '🍺', '🍰', '🧁', '🍦', '🍫', '🍱', '🍕',
  '🍜', '🍣', '🌭', '🥪', '🥟', '🧂', '🍯', '📦', '❄️', '⭐'
];

export function getAutoEmoji(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower.includes('ไข่')) return '🥚';
  if (lower.includes('นม') || lower.includes('milk')) return '🥛';
  if (lower.includes('หมู') || lower.includes('เนื้อ') || lower.includes('pork') || lower.includes('beef')) return '🥩';
  if (lower.includes('ไก่') || lower.includes('chicken')) return '🍗';
  if (lower.includes('ปลา') || lower.includes('fish')) return '🐟';
  if (lower.includes('กุ้ง') || lower.includes('shrimp')) return '🦐';
  if (lower.includes('ผัก') || lower.includes('กะหล่ำ') || lower.includes('คะน้า') || lower.includes('สลัด')) return '🥬';
  if (lower.includes('บรอกโคลี') || lower.includes('broccoli')) return '🥦';
  if (lower.includes('แครอท') || lower.includes('carrot')) return '🥕';
  if (lower.includes('มะเขือ') || lower.includes('tomato')) return '🍅';
  if (lower.includes('แอปเปิ้ล') || lower.includes('apple')) return '🍎';
  if (lower.includes('กล้วย') || lower.includes('banana')) return '🍌';
  if (lower.includes('สตรอว์เบอร์รี') || lower.includes('berry')) return '🍓';
  if (lower.includes('อะโวคาโด') || lower.includes('avocado')) return '🥑';
  if (lower.includes('ขนมปัง') || lower.includes('bread')) return '🍞';
  if (lower.includes('เนย') || lower.includes('butter')) return '🧈';
  if (lower.includes('ชีส') || lower.includes('cheese')) return '🧀';
  if (lower.includes('น้ำ') || lower.includes('โค้ก') || lower.includes('เป๊ปซี่') || lower.includes('ชา')) return '🥤';
  if (lower.includes('น้ำผลไม้') || lower.includes('juice')) return '🧃';
  if (lower.includes('เบียร์') || lower.includes('beer') || lower.includes('ไวน์')) return '🍺';
  if (lower.includes('เค้ก') || lower.includes('cake') || lower.includes('ขนม')) return '🍰';
  if (lower.includes('ไอศกรีม') || lower.includes('ไอติม') || lower.includes('ice cream')) return '🍦';
  if (lower.includes('ข้าว') || lower.includes('rice')) return '🍚';
  if (lower.includes('ซอส') || lower.includes('น้ำปลา') || lower.includes('เกลือ')) return '🧂';
  return '📦';
}

export function EditProductModal({
  isOpen,
  onClose,
  item,
  onSuccess,
}: EditProductModalProps) {
  const supabase = createClient();
  const { currentHousehold, authUser, user, canEditItems } = useHousehold();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('ชิ้น');
  const [expiryDate, setExpiryDate] = useState('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setQuantity(String(item.quantity ?? 1));
      setUnit(item.unit || 'ชิ้น');
      setImageUrl(item.image_url || getAutoEmoji(item.name || ''));
      setNotes(item.notes || '');

      const earliestBatch = item.item_batches?.find((b) => b.expiry_date);
      setExpiryDate(normalizeDateString(earliestBatch?.expiry_date) || '');
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  // จัดการอัปโหลดรูปภาพจากอุปกรณ์ (พร้อมบีบอัดอัตโนมัติ รองรับภาพจากกล้องมือถือ)
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.82,
      });
      setImageUrl(compressed.dataUrl);
      toast.success('เลือกรูปภาพเรียบร้อย');
    } catch {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (result) {
          setImageUrl(result);
          toast.success('เลือกรูปภาพเรียบร้อย');
        }
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('กรุณากรอกชื่อสินค้า');
      return;
    }

    const numQty = parseFloat(quantity);
    if (isNaN(numQty) || numQty < 0) {
      toast.error('จำนวนสินค้าไม่ถูกต้อง');
      return;
    }

    if (!canEditItems) {
      toast.error('คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }

    setSubmitting(true);
    try {
      // 1. อัปเดตข้อมูลสินค้าใน items
      const updatePayload: Record<string, unknown> = {
        name: name.trim(),
        quantity: numQty,
        unit: unit.trim() || 'ชิ้น',
        image_url: imageUrl || null,
        notes: notes.trim() || null,
        status: numQty <= 0 ? 'out_of_stock' : numQty <= 1 ? 'low_stock' : 'in_stock',
        updated_at: new Date().toISOString(),
      };

      let { error: updateError } = await supabase
        .from('items')
        .update(updatePayload)
        .eq('id', item!.id);

      // ถ้าตารางไม่มีคอลัมน์ image_url ให้ลอง update แบบไม่มี image_url
      if (updateError && updateError.message?.includes('image_url')) {
        delete updatePayload.image_url;
        const retry = await supabase.from('items').update(updatePayload).eq('id', item!.id);
        updateError = retry.error;
      }

      if (updateError) throw updateError;

      // 2. จัดการวันหมดอายุใน item_batches (ใช้ YYYY-MM-DD ตรงตามปฏิทิน ไม่เลื่อนวัน)
      const cleanExpiry = normalizeDateString(expiryDate);
      const existingBatch = item!.item_batches?.[0];
      if (existingBatch) {
        await supabase
          .from('item_batches')
          .update({
            quantity: numQty,
            expiry_date: cleanExpiry,
            notes: notes.trim() || null,
          })
          .eq('id', existingBatch.id);
      } else if (cleanExpiry) {
        const batchId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
              });

        await supabase.from('item_batches').insert({
          id: batchId,
          item_id: item!.id,
          quantity: numQty,
          expiry_date: cleanExpiry,
          notes: notes.trim() || null,
        });
      }

      // 3. บันทึก Activity Log
      if (currentHousehold?.id && authUser?.id) {
        try {
          await supabase.from('activity_logs').insert({
            household_id: currentHousehold.id,
            fridge_id: item!.fridge_id,
            item_id: item!.id,
            user_id: authUser.id,
            action: 'item_updated',
            details: {
              user_name: user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก',
              item_name: name.trim(),
              quantity: numQty,
              unit: unit.trim() || 'ชิ้น',
            },
          });
        } catch {
          // ignore
        }
      }

      toast.success(`แก้ไข "${name}" เรียบร้อย`);
      onClose();
      onSuccess();
    } catch (err: unknown) {
      console.error('Update product error:', err);
      const msg = err instanceof Error ? err.message : 'แก้ไขสินค้าไม่สำเร็จ';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const isDataUrl = imageUrl?.startsWith('data:image') || imageUrl?.startsWith('http');

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
            <Edit2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              แก้ไขข้อมูลและรูปภาพสินค้า
            </h3>
            <p className="text-xs text-muted">
              ปรับแต่งรูปภาพ ชื่อ จำนวน และวันหมดอายุ
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Permission Notice if cannot edit */}
          {!canEditItems && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">สิทธิ์การใช้งานจำกัด (ดูข้อมูลได้อย่างเดียว)</p>
                <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                  เจ้าของบ้านกำหนดให้บัญชีของคุณดูข้อมูลได้อย่างเดียว ไม่สามารถบันทึกการแก้ไขข้อมูลสินค้าได้
                </p>
              </div>
            </div>
          )}

          {/* Picture / Emoji Preview & Selection */}
          <div className="p-4 rounded-xl border border-border bg-muted/5 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              รูปภาพ / ไอคอนสินค้า
            </label>

            <div className="flex items-center gap-4">
              {/* Image Preview Box */}
              <div className="w-16 h-16 rounded-2xl border-2 border-primary-500/30 bg-primary-50 dark:bg-primary-950/40 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm relative group">
                {isDataUrl ? (
                  <img
                    src={imageUrl}
                    alt={name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl">{imageUrl || getAutoEmoji(name)}</span>
                )}
              </div>

              {/* Upload Button */}
              <div className="flex-1 space-y-1.5">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-foreground bg-card hover:bg-muted/15 border border-border cursor-pointer transition shadow-xs">
                  <Upload className="w-3.5 h-3.5 text-primary-600" />
                  <span>อัปโหลดรูปจริงจากเครื่อง</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-muted">
                  รองรับภาพถ่ายจากกล้องมือถือจริง และไฟล์ภาพ JPG, PNG (บีบอัดอัตโนมัติ)
                </p>
              </div>
            </div>

            {/* Quick Emoji Picker */}
            <div className="pt-2">
              <span className="text-xs text-muted block mb-2 font-medium">
                หรือเลือกอิโมจิอาหารยอดนิยม:
              </span>
              <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-h-28 overflow-y-auto p-1.5 rounded-xl bg-card border border-border">
                {FOOD_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setImageUrl(emoji)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-muted/20 hover:scale-110 active:scale-95 transition ${
                      imageUrl === emoji ? 'bg-primary-100 dark:bg-primary-900/50 ring-2 ring-primary-500' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              ชื่อสินค้า <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // ถ้ายังไม่ได้เลือกรูปภาพเอง ให้ auto แนะนำ emoji ตามชื่อ
                if (!imageUrl || FOOD_EMOJIS.includes(imageUrl)) {
                  setImageUrl(getAutoEmoji(e.target.value));
                }
              }}
              placeholder="เช่น ไข่ไก่, นมสด, หมูบด..."
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
              required
            />
          </div>

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                จำนวน <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                หน่วยนับ
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="ฟอง, กล่อง, ชิ้น..."
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
              />
            </div>
          </div>

          {/* Expiry Date */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary-600" />
                <span>วันหมดอายุ (เวลาไทย)</span>
              </label>
              {expiryDate && (
                <button
                  type="button"
                  onClick={() => setExpiryDate('')}
                  className="text-[11px] text-muted hover:text-rose-500 font-medium"
                >
                  ล้างวันที่
                </button>
              )}
            </div>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(normalizeDateString(e.target.value) || '')}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'วันนี้', days: 0 },
                { label: '+3 วัน', days: 3 },
                { label: '+7 วัน', days: 7 },
                { label: '+14 วัน', days: 14 },
              ].map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setExpiryDate(addDaysFromBangkokToday(p.days))}
                  className="px-2.5 py-1 rounded-lg border border-border bg-card hover:border-primary-500 hover:text-primary-600 text-[11px] font-semibold text-muted transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {expiryDate && (
              <p className="text-xs text-muted">
                ตรงกับวันที่ <strong className="text-foreground">{formatThaiDate(expiryDate)}</strong> •{' '}
                <strong className="text-primary-600">{formatExpiryLabel(getDaysUntilExpiry(expiryDate))}</strong>
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              โน้ตเพิ่มเติม (ถ้ามี)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ซื้อจาก Tops, เปิดขวดแล้ว..."
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-foreground hover:bg-muted/10 transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || !canEditItems}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] shadow-sm shadow-primary-600/25 transition disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                'กำลังบันทึก...'
              ) : !canEditItems ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>ไม่มีสิทธิ์แก้ไข</span>
                </>
              ) : (
                'บันทึกการแก้ไข'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

