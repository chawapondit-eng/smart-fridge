'use client';

import React, { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import {
  Camera,
  FolderOpen,
  Receipt,
  Sparkles,
  CheckCircle,
  X,
  Wallet,
  ZoomIn,
  Plus,
  Edit2,
  Refrigerator,
  AlertTriangle,
} from 'lucide-react';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';
import { EditBudgetModal } from '@/components/budget/EditBudgetModal';
import { fetchWeeklyBudgetSummary, type WeeklyBudgetSummary } from '@/lib/budget';
import { addDaysFromBangkokToday, normalizeDateString } from '@/lib/date';

interface ParsedReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price?: number;
  expiryDate?: string;
  targetFridgeId?: string;
  confidence: number;
}

interface ExistingFridgeItem {
  id: string;
  name: string;
  fridge_id: string;
  quantity: number;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function ReceiptScannerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFridgeParam = searchParams.get('fridgeId') || '';
  const supabase = createClient();
  const { currentHousehold, fridges, authUser, user } = useHousehold();

  const [defaultFridgeId, setDefaultFridgeId] = useState<string>(initialFridgeParam);
  const [existingItems, setExistingItems] = useState<ExistingFridgeItem[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedReceiptItem[]>([]);
  const [storeName, setStoreName] = useState<string>('ซูเปอร์มาร์เก็ต');
  const [submitting, setSubmitting] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [showEditBudgetModal, setShowEditBudgetModal] = useState(false);

  // ซิงค์ตู้เย็นปลายทางเริ่มต้นจาก URL หรือตู้แรกในบ้าน
  useEffect(() => {
    if (fridges.length === 0) return;
    if (initialFridgeParam && fridges.some((f) => f.id === initialFridgeParam)) {
      setDefaultFridgeId(initialFridgeParam);
    } else if (!defaultFridgeId || !fridges.some((f) => f.id === defaultFridgeId)) {
      setDefaultFridgeId(fridges[0].id);
    }
  }, [fridges, initialFridgeParam, defaultFridgeId]);

  // โหลดรายการที่มีอยู่แล้วในตู้เย็นเพื่อป้องกันการเพิ่มรายการซ้ำโดยไม่ตั้งใจ
  useEffect(() => {
    async function loadExistingItems() {
      if (!currentHousehold?.id) return;
      try {
        const { data } = await supabase
          .from('items')
          .select('id, name, fridge_id, quantity')
          .eq('household_id', currentHousehold.id)
          .gt('quantity', 0);
        if (data) {
          setExistingItems(data as ExistingFridgeItem[]);
        }
      } catch {
        // ignore
      }
    }
    loadExistingItems();
  }, [currentHousehold?.id, supabase]);

  // Real Budget State
  const [budgetSummary, setBudgetSummary] = useState<WeeklyBudgetSummary>({
    budget: 3000,
    totalSpent: 0,
    remaining: 3000,
    percentUsed: 0,
    receiptCount: 0,
    supermarketSpent: 0,
    deliverySpent: 0,
  });

  const loadBudget = React.useCallback(async () => {
    if (!currentHousehold?.id) return;
    const summary = await fetchWeeklyBudgetSummary(supabase, currentHousehold.id);
    setBudgetSummary(summary);
  }, [currentHousehold?.id, supabase]);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 1. จัดการเลือกไฟล์ภาพ
  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    // เริ่มสแกนทันทีเพื่อความรวดเร็ว
    scanImageFile(file);
  }

  // 2. เรียก API Gemini AI Vision เพื่อดึงรายการอาหาร
  async function scanImageFile(file: File) {
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const savedKey = typeof window !== 'undefined' ? localStorage.getItem('smart_fridge_gemini_key') || '' : '';
      if (savedKey) {
        formData.append('apiKey', savedKey);
      }

      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success && Array.isArray(data.items) && data.items.length > 0) {
        const defaultFId = defaultFridgeId || fridges[0]?.id || '';

        const mapped: ParsedReceiptItem[] = data.items.map((rawIt: unknown, idx: number) => {
          const it = (rawIt || {}) as Record<string, unknown>;
          const itemName = String(it.name || 'สินค้า');
          // คำนวณวันหมดอายุตามเวลาไทย (Asia/Bangkok) โดยไม่ใช้ UTC toISOString
          const expDays = itemName.includes('นม')
            ? 7
            : itemName.includes('ผัก')
            ? 3
            : itemName.includes('เนื้อ') || itemName.includes('ไก่') || itemName.includes('หมู')
            ? 4
            : itemName.includes('ไข่')
            ? 14
            : 10;

          const expDate = addDaysFromBangkokToday(expDays);

          return {
            id: `${Date.now()}-${idx + 1}`,
            name: itemName,
            quantity: Number(it.quantity) || 1,
            unit: String(it.unit || 'ชิ้น'),
            price: Number(it.price) || 0,
            expiryDate: expDate,
            targetFridgeId: defaultFId,
            confidence: Number(it.confidence) || 0.95,
          };
        });

        // รวมรายการที่ชื่อเหมือนกันภายในใบเสร็จเดียวกัน เพื่อลดความซ้ำซ้อน
        const deduped: ParsedReceiptItem[] = [];
        for (const item of mapped) {
          const norm = normalizeName(item.name);
          const existingIdx = deduped.findIndex((d) => normalizeName(d.name) === norm);
          if (existingIdx !== -1) {
            deduped[existingIdx] = {
              ...deduped[existingIdx],
              quantity: deduped[existingIdx].quantity + item.quantity,
              price: (deduped[existingIdx].price || 0) + (item.price || 0),
            };
          } else {
            deduped.push(item);
          }
        }

        setParsedItems(deduped);
        if (data.store) setStoreName(data.store);
        toast.success(`ตรวจพบ ${deduped.length} รายการจากใบเสร็จ!`);
      } else {
        toast.error(data.error || 'ไม่สามารถอ่านข้อความจากใบเสร็จได้ กรุณาลองถ่ายภาพใหม่ให้ตรงและคมชัดขึ้น');
      }
    } catch {
      toast.error('ไม่สามารถอ่านใบเสร็จได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setScanning(false);
    }
  }

  // แก้ไขข้อมูลไอเทมในลิสต์
  function updateItem(index: number, updates: Partial<ParsedReceiptItem>) {
    setParsedItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...updates } : it))
    );
  }

  // ลบไอเทมออกจากลิสต์
  function removeItem(index: number) {
    setParsedItems((prev) => prev.filter((_, i) => i !== index));
    toast.success('นำรายการออกแล้ว');
  }

  // เพิ่มรายการด้วยตนเองกรณี OCR อ่านไม่ครบ
  function addManualRow() {
    const expDate = addDaysFromBangkokToday(7);
    setParsedItems((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        name: '',
        quantity: 1,
        unit: 'ชิ้น',
        price: 0,
        expiryDate: expDate,
        targetFridgeId: defaultFridgeId || fridges[0]?.id || '',
        confidence: 1,
      },
    ]);
  }

  // เปลี่ยนตู้เย็นปลายทางเริ่มต้นสำหรับทุกรายการ
  function handleChangeDefaultFridge(newFridgeId: string) {
    setDefaultFridgeId(newFridgeId);
    setParsedItems((prev) => prev.map((it) => ({ ...it, targetFridgeId: newFridgeId })));
  }

  // ตรวจสอบว่ารายการซ้ำกับของที่มีอยู่แล้วในตู้เย็นปลายทางหรือไม่
  function findDuplicateInFridge(name: string, targetFridgeId?: string): ExistingFridgeItem | undefined {
    const norm = normalizeName(name);
    if (!norm) return undefined;
    const fId = targetFridgeId || defaultFridgeId || fridges[0]?.id;
    return existingItems.find(
      (ex) => ex.fridge_id === fId && normalizeName(ex.name) === norm
    );
  }

  // คำนวณยอดรวม
  const totalPrice = useMemo(() => {
    return parsedItems.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0);
  }, [parsedItems]);

  // 3. บันทึกสินค้าลงในตู้เย็น (Supabase Database) พร้อมป้องกันรายการซ้ำ
  async function handleConfirmAndSave() {
    if (submitting) return;
    if (!currentHousehold?.id || !authUser?.id) {
      toast.error('กรุณาเลือกครัวเรือนก่อนบันทึก');
      return;
    }
    const validItems = parsedItems.filter((it) => it.name.trim().length > 0);
    if (validItems.length === 0) {
      toast.error('กรุณาระบุชื่อสินค้าอย่างน้อย 1 รายการก่อนบันทึก');
      return;
    }

    const fallbackFridgeId = defaultFridgeId || fridges[0]?.id;
    if (!fallbackFridgeId) {
      toast.error('กรุณาสร้างตู้เย็นอย่างน้อย 1 ตู้ก่อนบันทึกของ');
      return;
    }

    setSubmitting(true);
    try {
      // โหลดรายการล่าสุดจาก DB เพื่อกันรายการซ้ำอย่างแม่นยำ
      const { data: latestDbItems } = await supabase
        .from('items')
        .select('id, name, fridge_id, quantity')
        .eq('household_id', currentHousehold.id)
        .gt('quantity', 0);

      const dbPool: ExistingFridgeItem[] = (latestDbItems as ExistingFridgeItem[]) || [];
      let mergedCount = 0;
      let insertedCount = 0;

      for (const it of validItems) {
        const targetFridge = it.targetFridgeId || fallbackFridgeId;
        const cleanName = it.name.trim();
        const addQty = Number(it.quantity) || 1;
        const norm = normalizeName(cleanName);

        // ตรวจสอบว่ามีสินค้านี้อยู่ในตู้เย็นเดียวกันแล้วหรือไม่
        const existing = dbPool.find(
          (ex) => ex.fridge_id === targetFridge && normalizeName(ex.name) === norm
        );

        let finalItemId = '';

        if (existing) {
          // รวมจำนวนเข้ากับรายการเดิม ป้องกันการสร้างรายการซ้ำ
          const updatedQty = Number(existing.quantity) + addQty;
          const { error: updErr } = await supabase
            .from('items')
            .update({
              quantity: updatedQty,
              status: updatedQty <= 1 ? 'low_stock' : 'in_stock',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updErr) {
            throw new Error(updErr.message || 'อัปเดตรายการเดิมไม่สำเร็จ');
          }
          existing.quantity = updatedQty;
          finalItemId = existing.id;
          mergedCount++;
        } else {
          const autoEmoji = getAutoEmoji(cleanName);
          const itemId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                  const r = (Math.random() * 16) | 0;
                  const v = c === 'x' ? r : (r & 0x3) | 0x8;
                  return v.toString(16);
                });

          // 1. เพิ่มเข้า items table (พร้อม added_by และ fallback)
          const fullPayload: Record<string, unknown> = {
            id: itemId,
            fridge_id: targetFridge,
            household_id: currentHousehold.id,
            name: cleanName,
            quantity: addQty,
            unit: it.unit.trim() || 'ชิ้น',
            image_url: autoEmoji,
            status: addQty <= 1 ? 'low_stock' : 'in_stock',
            added_by: authUser.id,
          };

          const { data: initialInserted, error: itemErr } = await supabase
            .from('items')
            .insert(fullPayload)
            .select('id')
            .maybeSingle();

          let insertedItem = initialInserted;

          if (itemErr) {
            // Retry without optional columns if column does not exist
            const retryPayload: Record<string, unknown> = {
              id: itemId,
              fridge_id: targetFridge,
              household_id: currentHousehold.id,
              name: cleanName,
              quantity: addQty,
              unit: it.unit.trim() || 'ชิ้น',
            };
            const retryRes = await supabase
              .from('items')
              .insert(retryPayload)
              .select('id')
              .maybeSingle();

            if (retryRes.error) {
              console.error('Failed to insert item:', retryRes.error);
              throw new Error(retryRes.error.message || itemErr.message || 'บันทึกสินค้าไม่สำเร็จ');
            }
            insertedItem = retryRes.data;
          }

          finalItemId = insertedItem?.id || itemId;
          dbPool.push({ id: finalItemId, name: cleanName, fridge_id: targetFridge, quantity: addQty });
          insertedCount++;
        }

        // 2. ถ้ามีวันหมดอายุ บันทึกเข้า item_batches (Calendar Date YYYY-MM-DD)
        const cleanExpiry = normalizeDateString(it.expiryDate);
        if (cleanExpiry && finalItemId) {
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
              quantity: addQty,
              expiry_date: cleanExpiry,
              added_by: authUser.id,
            });

            if (bRes.error && bRes.error.message?.includes('added_by')) {
              await supabase.from('item_batches').insert({
                id: batchId,
                item_id: finalItemId,
                quantity: addQty,
                expiry_date: cleanExpiry,
              });
            }
          } catch (e) {
            console.warn('Batch insert warning:', e);
          }
        }
      }

      // 3. บันทึกลง Activity Logs (สำหรับติดตามและอัปเดตงบประมาณอาหารอัตโนมัติ)
      try {
        const currentUserName = user?.display_name || authUser.email?.split('@')[0] || 'สมาชิก';
        await supabase.from('activity_logs').insert({
          household_id: currentHousehold.id,
          user_id: authUser.id,
          action: 'receipt_scanned',
          details: {
            user_name: currentUserName,
            store_name: storeName,
            items_count: validItems.length,
            total_price: totalPrice,
          },
        });
      } catch (e) {
        console.warn('Activity log insert warning:', e);
      }

      // ล้างสถานะเพื่อป้องกันการกดบันทึกซ้ำ และโหลดงบประมาณใหม่
      setParsedItems([]);
      setImageFile(null);
      setPreviewUrl(null);
      await loadBudget();

      const summaryMsg =
        mergedCount > 0 && insertedCount > 0
          ? `บันทึกใหม่ ${insertedCount} รายการ และรวมกับของเดิม ${mergedCount} รายการเรียบร้อย!`
          : mergedCount > 0
          ? `รวมจำนวนเข้ากับรายการเดิม ${mergedCount} รายการเรียบร้อย!`
          : `บันทึก ${insertedCount} รายการเข้าตู้เย็นสำเร็จ! 🎉`;

      toast.success(summaryMsg);
      router.push(fallbackFridgeId ? `/fridges/${fallbackFridgeId}` : '/fridges');
    } catch (err: unknown) {
      console.error('Error saving receipt items:', err);
      const errObj = err as { message?: string; details?: string } | null;
      const msg =
        errObj?.message ||
        errObj?.details ||
        (typeof err === 'string' ? err : 'เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-12 gap-5 animate-in fade-in duration-300">
        {/* Primary Element: Receipt Scan & Upload Zone */}
        <div className="bg-surface-container-lowest rounded-3xl p-5 sm:p-7 shadow-sm border border-border flex flex-col items-center text-center relative overflow-hidden">
          <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-border/60 text-left">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary-600" />
              <h1 className="font-heading text-lg sm:text-xl font-bold text-foreground">
                สแกนใบเสร็จ
              </h1>
            </div>

            {fridges.length > 0 && (
              <div className="flex items-center gap-2 bg-surface-container-low border border-border rounded-xl px-3 py-1.5 text-xs">
                <Refrigerator className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                <span className="text-muted">บันทึกลงตู้:</span>
                <select
                  value={defaultFridgeId || fridges[0]?.id || ''}
                  onChange={(e) => handleChangeDefaultFridge(e.target.value)}
                  aria-label="เลือกตู้เย็นปลายทาง"
                  className="bg-transparent font-bold text-foreground outline-none cursor-pointer"
                >
                  {fridges.map((f) => (
                    <option key={f.id} value={f.id} className="bg-card text-foreground">
                      {f.icon || '❄️'} {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="relative w-16 h-16 rounded-2xl bg-primary-500/10 border border-primary-500/25 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-primary-600 text-[34px]">
              document_scanner
            </span>
          </div>

          <h2 className="font-heading font-semibold text-base sm:text-lg text-foreground mb-4">
            ถ่ายภาพหรือเลือกใบเสร็จเพื่อดึงรายการวัตถุดิบ
          </h2>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {/* Camera */}
            <button
              type="button"
              disabled={scanning}
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-3.5 px-4 rounded-2xl font-bold text-xs sm:text-sm shadow-sm active:scale-[0.98] transition disabled:opacity-60"
            >
              <Camera className="w-4 h-4" />
              <span>ถ่ายภาพใบเสร็จ</span>
            </button>
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileSelect(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />

            {/* File Pick */}
            <button
              type="button"
              disabled={scanning}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 bg-surface-container-high hover:bg-surface-container text-on-surface py-3.5 px-4 rounded-2xl font-bold text-xs sm:text-sm shadow-xs active:scale-[0.98] transition border border-border disabled:opacity-60"
            >
              <FolderOpen className="w-4 h-4 text-primary-600" />
              <span>อัปโหลดรูปภาพ</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileSelect(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {scanning && (
            <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/15 border border-primary-500/30 text-primary-600 dark:text-primary-300 text-xs font-bold animate-pulse">
              <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              <span>กำลังอ่านรายการสินค้าและราคาจากใบเสร็จ...</span>
            </div>
          )}
        </div>

        {/* OCR Verification Panel */}
        {parsedItems.length > 0 && (
          <div className="bg-surface-container-lowest rounded-3xl p-4 sm:p-6 shadow-sm border border-border space-y-4">
            {/* Scanned Status Header */}
            <div className="flex items-center justify-between bg-surface-container-low p-3.5 rounded-2xl border border-border/60">
              <div className="flex items-center gap-3">
                {previewUrl ? (
                  <div
                    onClick={() => setShowZoomModal(true)}
                    className="w-12 h-14 rounded-xl overflow-hidden shrink-0 relative bg-surface-container cursor-pointer border border-border"
                  >
                    <img src={previewUrl} alt="ใบเสร็จ" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-primary-600/15 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-primary-600" />
                    </div>
                  </div>
                ) : (
                  <div className="w-12 h-14 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700">
                    <Receipt className="w-6 h-6" />
                  </div>
                )}

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-sm text-on-surface">
                      {storeName}
                    </span>
                    <span className="px-2 py-0.2 rounded-full bg-primary-100 text-primary-800 text-[10px] font-bold">
                      พร้อมบันทึก
                    </span>
                  </div>
                  <span className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary-600" />
                    <span>AI ดึงข้อมูลสำเร็จ {parsedItems.length} รายการ</span>
                  </span>
                </div>
              </div>

              {previewUrl && (
                <button
                  type="button"
                  onClick={() => setShowZoomModal(true)}
                  className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-foreground"
                  title="ขยายภาพใบเสร็จ"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Extracted Items List */}
            <div className="space-y-3">
              {parsedItems.map((it, idx) => {
                const autoEmoji = getAutoEmoji(it.name || 'สินค้า');
                const dupItem = findDuplicateInFridge(it.name, it.targetFridgeId);

                return (
                  <div
                    key={it.id}
                    className="bg-surface-container-low p-3.5 rounded-2xl space-y-2 border border-border/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-2xl bg-surface-container-lowest flex items-center justify-center text-xl shrink-0 shadow-xs border border-border">
                          <span>{autoEmoji}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={it.name}
                            placeholder="ระบุชื่อสินค้า..."
                            onChange={(e) => updateItem(idx, { name: e.target.value })}
                            className="font-sans font-medium text-sm text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary-500 outline-none w-full truncate"
                          />
                          {dupItem && (
                            <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>มีในตู้นี้แล้ว ({dupItem.quantity}) • จะรวมจำนวนให้อัตโนมัติเพื่อไม่ให้ซ้ำ</span>
                            </div>
                          )}
                          <div className="flex items-center flex-wrap gap-2 mt-1">
                            {/* Editable Price Input */}
                            <div className="flex items-center gap-1 bg-surface-container px-2.5 py-1 rounded-xl border border-border/80 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500/20">
                              <span className="text-xs font-bold text-primary-500">฿</span>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={it.price === 0 ? '' : it.price}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    price: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="0.00"
                                title="คลิกเพื่อแก้ไขราคา"
                                className="w-16 bg-transparent text-xs font-bold text-foreground outline-none"
                              />
                            </div>

                            {/* Editable Quantity & Unit */}
                            <div className="flex items-center gap-1 text-xs text-muted">
                              <span>จำนวน:</span>
                              <input
                                type="number"
                                min="0.1"
                                step="1"
                                value={it.quantity}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    quantity: parseFloat(e.target.value) || 1,
                                  })
                                }
                                className="w-10 bg-surface-container px-1 py-0.5 rounded-lg border border-border/60 text-center font-medium text-xs text-foreground outline-none"
                              />
                              <input
                                type="text"
                                value={it.unit}
                                onChange={(e) => updateItem(idx, { unit: e.target.value })}
                                className="w-12 bg-surface-container px-1 py-0.5 rounded-lg border border-border/60 text-center font-medium text-xs text-foreground outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-muted hover:text-tertiary-600 p-1.5 rounded-full hover:bg-surface-container transition"
                        title="ลบรายการนี้"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {/* Expiry Selector */}
                      <div className="bg-surface-container rounded-xl px-3 py-1.5 flex items-center justify-between border border-border/70 text-xs">
                        <span className="text-muted text-[11px]">หมดอายุ:</span>
                        <input
                          type="date"
                          value={it.expiryDate || ''}
                          onChange={(e) => updateItem(idx, { expiryDate: e.target.value })}
                          className="bg-transparent font-medium text-xs text-foreground outline-none"
                        />
                      </div>

                      {/* Fridge Selector */}
                      <div className="bg-surface-container rounded-xl px-3 py-1.5 flex items-center justify-between border border-border/70 text-xs">
                        <span className="text-muted text-[11px]">ตู้:</span>
                        <select
                          value={it.targetFridgeId || fridges[0]?.id || ''}
                          onChange={(e) => updateItem(idx, { targetFridgeId: e.target.value })}
                          className="bg-transparent font-medium text-xs text-foreground outline-none max-w-[110px] truncate"
                        >
                          {fridges.map((f) => (
                            <option key={f.id} value={f.id} className="bg-card text-foreground">
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Missing Item Row Button */}
            <button
              type="button"
              onClick={addManualRow}
              className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-primary-500 text-xs font-semibold text-muted hover:text-primary-600 flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มรายการสินค้าที่ตกหล่น</span>
            </button>

            {/* Receipt Total Summary */}
            <div className="bg-surface-container rounded-2xl p-4 flex items-center justify-between border border-border/80">
              <div className="flex items-center gap-2 text-foreground">
                <Receipt className="w-5 h-5 text-primary-500" />
                <span className="text-xs sm:text-sm font-medium">
                  ยอดรวมใบเสร็จ ({parsedItems.length} รายการ)
                </span>
              </div>
              <span className="font-heading text-lg sm:text-xl text-primary-500 font-bold">
                ฿{totalPrice.toFixed(2)}
              </span>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleConfirmAndSave}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white py-3.5 rounded-2xl font-heading font-bold text-sm shadow-md shadow-primary-500/25 flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>ยืนยันและบันทึกลงตู้เย็น (Confirm & Add)</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Budget Tracking Card (100% REAL DATA, NO FAKE!) */}
        <div className="bg-surface-container-lowest rounded-3xl p-5 sm:p-6 shadow-sm border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-sm text-on-surface">
                การติดตามงบอาหารสัปดาห์นี้
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowEditBudgetModal(true)}
              className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-900 transition"
            >
              <Edit2 className="w-3 h-3" />
              <span>ตั้งค่างบ</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="font-heading text-xl sm:text-2xl font-bold text-on-surface">
                  ฿{budgetSummary.totalSpent.toLocaleString()}
                </span>
                <span className="text-xs text-on-surface-variant font-medium">
                  {' '}
                  / ฿{budgetSummary.budget.toLocaleString()}
                </span>
              </div>
              <span className="text-xs font-bold text-primary-700 bg-primary-100 dark:bg-primary-900/40 dark:text-primary-300 px-2.5 py-0.5 rounded-full">
                {budgetSummary.remaining > 0
                  ? `เหลือ ฿${budgetSummary.remaining.toLocaleString()}`
                  : `เกินงบ ฿${Math.abs(budgetSummary.budget - budgetSummary.totalSpent).toLocaleString()}`}
              </span>
            </div>

            {/* Segmented Bar */}
            <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden flex">
              {budgetSummary.totalSpent > 0 ? (
                <>
                  <div
                    className="h-full bg-primary-500 rounded-l-full transition-all duration-500"
                    style={{
                      width: `${budgetSummary.budget > 0 ? Math.min(100, Math.round((budgetSummary.supermarketSpent / budgetSummary.budget) * 100)) : 0}%`,
                    }}
                  />
                  <div
                    className="h-full bg-amber-400 transition-all duration-500"
                    style={{
                      width: `${budgetSummary.budget > 0 ? Math.min(100, Math.round((budgetSummary.deliverySpent / budgetSummary.budget) * 100)) : 0}%`,
                    }}
                  />
                </>
              ) : (
                <div className="h-full bg-surface-container-high w-full" />
              )}
            </div>

            {/* Breakdown Legend */}
            {budgetSummary.totalSpent > 0 ? (
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-on-surface">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                  <span>
                    ซูเปอร์มาร์เก็ต:{' '}
                    <strong>
                      ฿{budgetSummary.supermarketSpent.toLocaleString()} (
                      {budgetSummary.totalSpent > 0
                        ? Math.round((budgetSummary.supermarketSpent / budgetSummary.totalSpent) * 100)
                        : 0}
                      %)
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>
                    เดลิเวอรี/Grab:{' '}
                    <strong>
                      ฿{budgetSummary.deliverySpent.toLocaleString()} (
                      {budgetSummary.totalSpent > 0
                        ? Math.round((budgetSummary.deliverySpent / budgetSummary.totalSpent) * 100)
                        : 0}
                      %)
                    </strong>
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted pt-1">
                ยังไม่มีการบันทึกค่าใช้จ่ายในสัปดาห์นี้ เริ่มถ่ายรูปใบเสร็จเพื่อติดตามงบอาหารได้เลย
              </p>
            )}
          </div>
        </div>

        {/* Edit Budget Modal */}
        {currentHousehold && (
          <EditBudgetModal
            isOpen={showEditBudgetModal}
            onClose={() => setShowEditBudgetModal(false)}
            householdId={currentHousehold.id}
            currentBudget={budgetSummary.budget}
            onSuccess={(newBudget) => {
              setBudgetSummary((prev) => ({
                ...prev,
                budget: newBudget,
                remaining: Math.max(0, newBudget - prev.totalSpent),
                percentUsed: newBudget > 0 ? Math.min(100, Math.round((prev.totalSpent / newBudget) * 100)) : 0,
              }));
            }}
          />
        )}

        {/* Zoom Modal */}
        {showZoomModal && previewUrl && (
          <div
            onClick={() => setShowZoomModal(false)}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <div className="relative max-w-lg w-full max-h-[85vh] overflow-hidden rounded-3xl bg-card p-2">
              <button
                type="button"
                onClick={() => setShowZoomModal(false)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                ✕
              </button>
              <img src={previewUrl} alt="ขยายใบเสร็จ" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl" />
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default function ReceiptScannerPage() {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        </MainLayout>
      }
    >
      <ReceiptScannerContent />
    </Suspense>
  );
}
