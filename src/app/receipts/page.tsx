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
  ShieldCheck,
  HelpCircle,
  Utensils,
  CookingPot,
  Sparkle,
  ArrowRight,
  RotateCcw,
  Calendar,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';
import { EditBudgetModal } from '@/components/budget/EditBudgetModal';
import { fetchWeeklyBudgetSummary, type WeeklyBudgetSummary } from '@/lib/budget';
import {
  addDaysFromBangkokToday,
  normalizeDateString,
  formatThaiDate,
  getBangkokTodayString,
} from '@/lib/date';
import {
  classifyProductWithLearning,
  recordUserProductCorrection,
  guessSmartUnit,
  validatePriceConsistency,
  resolveHierarchicalPrice,
  recordPriceHistory,
  type ProductCategory,
  type PriceSource,
} from '@/lib/productClassifier';
import {
  EditScannedItemModal,
  type EditableReceiptItem,
} from '@/components/receipt/EditScannedItemModal';

export interface ParsedReceiptItem {
  id: string;
  name: string;
  normalizedName?: string;
  category: ProductCategory;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  lineTotal: number | null;
  price: number | null;
  discount?: number | null;
  expiryDate: string | null;
  targetFridgeId?: string;
  confidence: number;
  reason: string;
  rawText?: string;
  purchaseDate?: string | null;
  isExcluded: boolean;
  isUserEdited?: boolean;
  priceSource: PriceSource;
  isPriceEstimated: boolean;
  priceSourceLabel: string;
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
  const { currentHousehold, fridges, authUser, user, canAddItems } = useHousehold();

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
  const [editingItem, setEditingItem] = useState<ParsedReceiptItem | null>(null);

  // Review Tabs: 'food' (อาหารและเครื่องปรุง) | 'non_food' (ของใช้) | 'needs_review' (ต้องตรวจสอบ)
  const [activeTab, setActiveTab] = useState<'food' | 'non_food' | 'needs_review'>('food');

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
    isOverBudget: false,
    isNearLimit: false,
    overBudgetAmount: 0,
    history: [],
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
          const itemName = String(it.name || 'สินค้า').trim();

          // ตรวจสอบกับ Learned Dictionary ประจำครัวเรือนนี้
          const learned = classifyProductWithLearning(itemName, currentHousehold?.id);
          const initialCategory: ProductCategory =
            (it.category as ProductCategory) || learned.category || 'unknown';
          const initialConfidence =
            typeof it.confidence === 'number' ? it.confidence : learned.confidence;
          const initialReason = String(it.reason || learned.reason || '');

          // วันหมดอายุเริ่มต้นเป็น null (เนื่องจากใบเสร็จทั่วไปไม่มีวันหมดอายุพิมพ์ไว้)
          const initialExpiry: string | null = typeof it.expiryDate === 'string' && it.expiryDate.trim() ? it.expiryDate.trim() : null;
          const parsedUnitPrice = typeof it.unitPrice === 'number' && it.unitPrice > 0 ? it.unitPrice : null;
          const parsedLineTotal = typeof it.lineTotal === 'number' && it.lineTotal > 0 ? it.lineTotal : (typeof it.price === 'number' && it.price > 0 ? it.price : null);
          const parsedQty = typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1;
          const discount = typeof it.discount === 'number' ? it.discount : null;

          // ประเมินราคาตามลำดับความสำคัญ 4 ลำดับ
          // Priority 1: บิลจริง -> Priority 2 & 3: ประวัติในบ้าน -> Priority 4: Benchmark
          const resolvedPrice = resolveHierarchicalPrice(
            itemName,
            parsedUnitPrice,
            parsedLineTotal,
            parsedQty,
            currentHousehold?.id
          );

          return {
            id: `${Date.now()}-${idx + 1}`,
            name: itemName,
            normalizedName: String(it.normalizedName || itemName.toLowerCase()),
            category: initialCategory,
            confidence: initialConfidence,
            reason: initialReason,
            quantity: parsedQty,
            unit: String(it.unit || learned.suggestedUnit || 'ชิ้น'),
            unitPrice: resolvedPrice.unitPrice,
            lineTotal: resolvedPrice.lineTotal,
            price: resolvedPrice.price,
            discount,
            expiryDate: initialExpiry,
            targetFridgeId: defaultFId,
            isExcluded: initialCategory === 'non_food',
            rawText: String(it.rawText || itemName),
            purchaseDate: typeof data.purchase_date === 'string' ? data.purchase_date : null,
            priceSource: resolvedPrice.source,
            isPriceEstimated: resolvedPrice.isEstimate,
            priceSourceLabel: resolvedPrice.sourceLabel,
          };
        });

        // Deduplicate: รวมรายการที่ชื่อเหมือนกันในใบเสร็จ
        const deduped: ParsedReceiptItem[] = [];
        for (const item of mapped) {
          const norm = normalizeName(item.name);
          const existingIdx = deduped.findIndex((d) => normalizeName(d.name) === norm);
          if (existingIdx !== -1) {
            const combinedQty = deduped[existingIdx].quantity + item.quantity;
            const combinedLineTotal =
              item.lineTotal !== null || deduped[existingIdx].lineTotal !== null
                ? Math.round(((deduped[existingIdx].lineTotal || 0) + (item.lineTotal || 0)) * 100) / 100
                : null;
            const combinedUnitPrice =
              combinedLineTotal !== null && combinedQty > 0
                ? Math.round((combinedLineTotal / combinedQty) * 100) / 100
                : deduped[existingIdx].unitPrice;

            const isReceiptPrice =
              deduped[existingIdx].priceSource === 'receipt' || item.priceSource === 'receipt';

            deduped[existingIdx] = {
              ...deduped[existingIdx],
              quantity: combinedQty,
              lineTotal: combinedLineTotal,
              unitPrice: combinedUnitPrice,
              price: combinedLineTotal,
              priceSource: isReceiptPrice ? 'receipt' : (item.priceSource || deduped[existingIdx].priceSource),
              isPriceEstimated: !isReceiptPrice,
              priceSourceLabel: isReceiptPrice ? 'ราคาจากใบเสร็จ' : (item.priceSourceLabel || deduped[existingIdx].priceSourceLabel),
            };
          } else {
            deduped.push(item);
          }
        }

        setParsedItems(deduped);
        if (data.store) setStoreName(data.store);

        // นับจำนวนแต่ละหมวด
        const foodCount = deduped.filter((i) => (i.category === 'food' || i.category === 'seasoning') && i.confidence >= 0.70).length;
        const nonFoodCount = deduped.filter((i) => i.category === 'non_food').length;
        const reviewCount = deduped.filter((i) => i.category === 'unknown' || i.confidence < 0.70).length;

        toast.success(`ดึงสำเร็จ: อาหาร/เครื่องปรุง ${foodCount} รายการ, ของใช้ ${nonFoodCount} รายการ`);

        // ถ้ามีรายการที่ต้องตรวจสอบ ให้สลับไปแท็บนั้นก่อน
        if (foodCount > 0) {
          setActiveTab('food');
        } else if (reviewCount > 0) {
          setActiveTab('needs_review');
        } else {
          setActiveTab('non_food');
        }
      } else {
        toast.error(data.error || 'ไม่สามารถอ่านข้อความจากใบเสร็จได้ กรุณาลองถ่ายภาพใหม่ให้ตรงและคมชัดขึ้น');
      }
    } catch {
      toast.error('ไม่สามารถอ่านใบเสร็จได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setScanning(false);
    }
  }

  // สแกนใหม่ / รีเซ็ตผลการสแกน
  function handleResetScan() {
    if (parsedItems.length > 0 && !window.confirm('ต้องการยกเลิกผลการสแกนปัจจุบันและเริ่มสแกนใหม่หรือไม่?')) {
      return;
    }
    setParsedItems([]);
    setImageFile(null);
    setPreviewUrl(null);
    setStoreName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  // แก้ไขข้อมูลไอเทมในลิสต์
  function updateItem(id: string, updates: Partial<ParsedReceiptItem>) {
    setParsedItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
    );
  }

  // เปลี่ยนประเภทสินค้าโดยตรง (พร้อมบันทึกลง Learned Dictionary เพื่อเรียนรู้)
  function handleReclassify(id: string, newCategory: ProductCategory) {
    const target = parsedItems.find((i) => i.id === id);
    if (!target) return;

    if (currentHousehold?.id) {
      recordUserProductCorrection(currentHousehold.id, target.name, newCategory);
    }

    const reason =
      newCategory === 'food'
        ? 'ผู้ใช้ยืนยันว่าเป็นอาหาร'
        : newCategory === 'seasoning'
        ? 'ผู้ใช้ยืนยันว่าเป็นเครื่องปรุงรส'
        : newCategory === 'non_food'
        ? 'ผู้ใช้ยืนยันว่าเป็นของใช้'
        : 'ผู้ใช้ระบุว่าไม่แน่ใจ';

    updateItem(id, {
      category: newCategory,
      confidence: 1.0,
      reason,
      isExcluded: newCategory === 'non_food',
    });

    toast.success(`เปลี่ยน "${target.name}" เป็น ${newCategory === 'food' ? 'อาหาร 🥗' : newCategory === 'seasoning' ? 'เครื่องปรุง 🧂' : 'ของใช้ 🧼'}`);
  }

  // ลบไอเทมออกจากลิสต์
  function removeItem(id: string) {
    setParsedItems((prev) => prev.filter((it) => it.id !== id));
    toast.success('นำรายการออกแล้ว');
  }

  // กำหนดวันหมดอายุแบบด่วน (Shelf-life presets)
  function setQuickExpiryDays(id: string, days: number) {
    const expDate = addDaysFromBangkokToday(days);
    updateItem(id, { expiryDate: expDate });
    toast.success(`ตั้งวันหมดอายุ: ${formatThaiDate(expDate)}`);
  }

  // เพิ่มรายการด้วยตนเองกรณี OCR อ่านไม่ครบ
  function addManualRow() {
    const newItem: ParsedReceiptItem = {
      id: `manual-${Date.now()}`,
      name: '',
      category: 'food',
      confidence: 1.0,
      reason: 'เพิ่มด้วยตนเอง',
      quantity: 1,
      unit: 'ชิ้น',
      unitPrice: null,
      lineTotal: null,
      price: null,
      expiryDate: null,
      targetFridgeId: defaultFridgeId || fridges[0]?.id || '',
      isExcluded: false,
      isUserEdited: true,
      priceSource: 'receipt',
      isPriceEstimated: false,
      priceSourceLabel: 'ผู้ใช้ระบุเอง',
    };
    setParsedItems((prev) => [...prev, newItem]);
    setActiveTab('food');
    setEditingItem(newItem);
  }

  // บันทึกข้อมูลที่ผู้ใช้แก้ไขจาก Edit Modal / Bottom Sheet
  function handleSaveEditedItem(updated: EditableReceiptItem) {
    const enriched: ParsedReceiptItem = {
      ...updated,
      priceSource: updated.priceSource || 'receipt',
      isPriceEstimated: Boolean(updated.isPriceEstimated),
      priceSourceLabel: updated.priceSourceLabel || 'ผู้ใช้กำหนดเอง',
    };

    setParsedItems((prev) =>
      prev.map((it) => (it.id === enriched.id ? enriched : it))
    );

    if (currentHousehold?.id && enriched.name.trim()) {
      recordUserProductCorrection(currentHousehold.id, enriched.name, enriched.category);
      if (enriched.unitPrice && enriched.unitPrice > 0) {
        recordPriceHistory(currentHousehold.id, enriched.name, enriched.unitPrice, enriched.unit);
      }
    }

    toast.success(`บันทึกการแก้ไข "${enriched.name}" เรียบร้อยแล้ว`);
  }

  // เปลี่ยนตู้เย็นปลายทางเริ่มต้นสำหรับทุกรายการอาหาร
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

  // แยกกลุ่มตาม 3 หมวดหมู่หลัก
  const foodAndSeasoningItems = useMemo(
    () => parsedItems.filter((i) => (i.category === 'food' || i.category === 'seasoning') && i.confidence >= 0.70),
    [parsedItems]
  );

  const foodOnlyItems = useMemo(
    () => parsedItems.filter((i) => i.category === 'food' && i.confidence >= 0.70),
    [parsedItems]
  );

  const seasoningOnlyItems = useMemo(
    () => parsedItems.filter((i) => i.category === 'seasoning' && i.confidence >= 0.70),
    [parsedItems]
  );

  const nonFoodItems = useMemo(
    () => parsedItems.filter((i) => i.category === 'non_food'),
    [parsedItems]
  );

  const needsReviewItems = useMemo(
    () => parsedItems.filter((i) => i.category === 'unknown' || i.confidence < 0.70),
    [parsedItems]
  );

  // คำนวณยอดรวมจากใบเสร็จจริง (Actual Receipt Price)
  const actualReceiptTotal = useMemo(() => {
    return parsedItems.reduce(
      (acc, curr) =>
        acc + (curr.priceSource === 'receipt' && curr.lineTotal !== null ? Number(curr.lineTotal) : 0),
      0
    );
  }, [parsedItems]);

  // คำนวณยอดรวมราคาประเมิน (Estimated Price)
  const estimatedTotal = useMemo(() => {
    return parsedItems.reduce(
      (acc, curr) =>
        acc + (curr.priceSource !== 'receipt' && curr.lineTotal !== null ? Number(curr.lineTotal) : 0),
      0
    );
  }, [parsedItems]);

  // คำนวณยอดรวมทั้งหมด (Actual + Estimated)
  const totalPrice = useMemo(() => {
    return parsedItems.reduce(
      (acc, curr) =>
        acc + (curr.lineTotal !== null ? Number(curr.lineTotal) : curr.price !== null ? Number(curr.price) : 0),
      0
    );
  }, [parsedItems]);

  // ยอดรวมอาหารและเครื่องปรุงที่จะบันทึกลงงบประมาณจริง (เฉพาะราคาจริงจากใบเสร็จ)
  const foodActualReceiptTotal = useMemo(() => {
    return foodAndSeasoningItems.reduce(
      (acc, curr) =>
        acc + (curr.priceSource === 'receipt' && curr.lineTotal !== null ? Number(curr.lineTotal) : 0),
      0
    );
  }, [foodAndSeasoningItems]);

  const pricedItemsCount = useMemo(() => {
    return parsedItems.filter(
      (i) => (i.lineTotal !== null && i.lineTotal > 0) || (i.price !== null && i.price > 0)
    ).length;
  }, [parsedItems]);

  const completeItemsCount = useMemo(() => {
    return parsedItems.filter(
      (i) =>
        i.name.trim().length > 0 &&
        i.unit.trim().length > 0 &&
        ((i.lineTotal !== null && i.lineTotal > 0) || (i.price !== null && i.price > 0))
    ).length;
  }, [parsedItems]);

  // 3. บันทึกสินค้าลงในตู้เย็น (เฉพาะรายการอาหารและเครื่องปรุงที่ได้รับการยืนยัน 100%)
  async function handleConfirmAndSave() {
    if (submitting) return;

    if (!canAddItems) {
      toast.error('คุณไม่มีสิทธิ์เพิ่มสินค้าเข้าตู้เย็น (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }

    if (!currentHousehold?.id || !authUser?.id) {
      toast.error('กรุณาเลือกครัวเรือนก่อนบันทึก');
      return;
    }

    // กรองเอาเฉพาะ FOOD และ SEASONING ที่ไม่ถูก Exclude และมีชื่อสินค้าถูกต้อง
    const validFoodItems = parsedItems.filter(
      (it) =>
        (it.category === 'food' || it.category === 'seasoning') &&
        !it.isExcluded &&
        it.name.trim().length > 0
    );

    if (validFoodItems.length === 0) {
      toast.error('ไม่มีรายการอาหารหรือเครื่องปรุงที่พร้อมบันทึก (โปรดตรวจสอบในแท็บ "ต้องตรวจสอบ" ก่อน)');
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

      for (const it of validFoodItems) {
        const targetFridge = it.targetFridgeId || fallbackFridgeId;
        const cleanName = it.name.trim();
        const addQty = Number(it.quantity) || 1;
        const norm = normalizeName(cleanName);

        // บันทึกคำศัพท์ที่ยืนยันลง Learned Dictionary เพื่อเพิ่มความแม่นยำในอนาคต
        recordUserProductCorrection(currentHousehold.id, cleanName, it.category);
        if (it.unitPrice && it.unitPrice > 0 && it.priceSource === 'receipt') {
          recordPriceHistory(currentHousehold.id, cleanName, it.unitPrice, it.unit);
        }

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

          // บันทึกลง items table
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

        // ถ้าผู้ใช้ระบุวันหมดอายุ บันทึกเข้า item_batches (ถ้าไม่ได้ระบุ จะไม่สร้าง batch วันหมดอายุปลอม)
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

            await supabase.from('item_batches').insert({
              id: batchId,
              item_id: finalItemId,
              quantity: addQty,
              expiry_date: cleanExpiry,
              added_by: authUser.id,
            });
          } catch (e) {
            console.warn('Batch insert warning:', e);
          }
        }
      }

      // บันทึกลง Activity Logs สำหรับติดตามค่าใช้จ่าย
      try {
        const currentUserName = user?.display_name || authUser.email?.split('@')[0] || 'สมาชิก';
        await supabase.from('activity_logs').insert({
          household_id: currentHousehold.id,
          user_id: authUser.id,
          action: 'receipt_scanned',
          details: {
            user_name: currentUserName,
            store_name: storeName,
            items_count: validFoodItems.length,
            actual_spent: foodActualReceiptTotal,
            estimated_spent: estimatedTotal,
            total_price: foodActualReceiptTotal > 0 ? foodActualReceiptTotal : totalPrice,
            non_food_excluded: nonFoodItems.length,
          },
        });
      } catch (e) {
        console.warn('Activity log insert warning:', e);
      }

      // ล้างสถานะเพื่อป้องกันการกดบันทึกซ้ำ
      setParsedItems([]);
      setImageFile(null);
      setPreviewUrl(null);
      await loadBudget();

      const summaryMsg = `บันทึกอาหารและเครื่องปรุง ${validFoodItems.length} รายการเรียบร้อย! ${nonFoodItems.length > 0 ? `(คัดแยกของใช้ ${nonFoodItems.length} รายการออกอัตโนมัติ 🧼)` : ''}`;
      toast.success(summaryMsg);
      router.push(fallbackFridgeId ? `/fridges/${fallbackFridgeId}` : '/fridges');
    } catch (err: unknown) {
      console.error('Error saving receipt items:', err);
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-12 gap-5 animate-in fade-in duration-300">
        {/* Primary Element: Receipt Scan & Upload Zone */}
        <div className="bg-white dark:bg-card rounded-3xl p-5 sm:p-7 shadow-xs border border-border flex flex-col items-center text-center relative overflow-hidden">
          <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-border/60 text-left">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary-600" />
              <h1 className="font-heading text-lg sm:text-xl font-bold text-foreground">
                สแกนใบเสร็จอัจฉริยะ (Smart OCR)
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

          <h2 className="font-heading font-semibold text-base sm:text-lg text-foreground mb-1">
            ถ่ายภาพหรืออัปโหลดสลิปใบเสร็จ
          </h2>
          <p className="text-xs text-muted max-w-sm mb-4">
            AI จะคัดแยก <strong className="text-primary-600">อาหารและเครื่องปรุง</strong> เข้าตู้เย็น และแยก <strong className="text-slate-600 dark:text-slate-300">ของใช้ในบ้าน</strong> ออกอัตโนมัติ
          </p>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
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
              <span>AI กำลังวิเคราะห์ใบเสร็จและคัดแยกหมวดหมู่สินค้า...</span>
            </div>
          )}
        </div>

        {/* OCR Verification & Classification Panel */}
        {parsedItems.length > 0 && (
          <div className="bg-white dark:bg-card rounded-3xl p-4 sm:p-6 shadow-xs border border-border space-y-4">
            {/* Scanned Result Header (Section 5) */}
            <div className="bg-surface-container-low p-4 sm:p-5 rounded-2xl border border-border/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                {previewUrl ? (
                  <div
                    onClick={() => setShowZoomModal(true)}
                    className="w-14 h-16 sm:w-16 sm:h-20 rounded-2xl overflow-hidden shrink-0 relative bg-surface-container cursor-pointer border-2 border-primary-500/40 hover:border-primary-500 transition group shadow-xs"
                    title="คลิกเพื่อดูภาพใบเสร็จขยายใหญ่"
                  >
                    <img src={previewUrl} alt="ใบเสร็จ" className="w-full h-full object-cover group-hover:scale-105 transition" />
                    <div className="absolute inset-0 bg-primary-950/20 group-hover:bg-primary-950/40 flex items-center justify-center transition">
                      <ZoomIn className="w-4 h-4 text-white drop-shadow" />
                    </div>
                  </div>
                ) : (
                  <div className="w-14 h-16 rounded-2xl bg-primary-500/10 border border-primary-500/25 flex items-center justify-center text-primary-600 shrink-0">
                    <Receipt className="w-7 h-7" />
                  </div>
                )}

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-heading font-bold text-base sm:text-lg text-foreground">
                      AI วิเคราะห์ใบเสร็จแล้ว
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      วิเคราะห์สมบูรณ์
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">
                    ระบบจัดเตรียมข้อมูลสินค้าให้เรียบร้อยแล้ว ตรวจสอบแล้วกดยืนยันเพื่อเพิ่มเข้าตู้เย็นได้ทันที
                  </p>

                  <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
                    <span className="px-2.5 py-1 rounded-full bg-surface-container border border-border/80 font-semibold text-foreground">
                      📦 ตรวจพบ {parsedItems.length} รายการ
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 font-bold text-emerald-700 dark:text-emerald-300">
                      🥗 พร้อมเพิ่ม {foodAndSeasoningItems.length} รายการ
                    </span>
                    {needsReviewItems.length > 0 ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 font-bold text-amber-700 dark:text-amber-300">
                        ⚠️ ต้องตรวจสอบ {needsReviewItems.length} รายการ
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 font-bold text-emerald-700 dark:text-emerald-300">
                        ✅ พร้อมเพิ่มครบถ้วน
                      </span>
                    )}
                    {actualReceiptTotal > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-primary-500/10 border border-primary-500/25 font-bold text-primary-600 dark:text-primary-400">
                        ยอดบิล ฿{actualReceiptTotal.toFixed(2)}
                      </span>
                    )}
                    {estimatedTotal > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 font-semibold text-amber-700 dark:text-amber-300">
                        💡 ประเมิน ฿{estimatedTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Header Action Buttons: Zoom & Rescan */}
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                {previewUrl && (
                  <button
                    type="button"
                    onClick={() => setShowZoomModal(true)}
                    className="px-3 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-bold text-foreground transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    title="ขยายภาพใบเสร็จ"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-primary-600" />
                    <span>ดูภาพใบเสร็จ</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="px-3 py-2 rounded-xl bg-surface-container hover:bg-red-500/10 border border-border hover:border-red-500/30 text-xs font-bold text-muted hover:text-red-600 transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="ยกเลิกผลการสแกนและเริ่มสแกนใหม่"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>สแกนใหม่</span>
                </button>
              </div>
            </div>

            {/* 3 Classification Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-surface-container-low border border-border/60">
              <button
                type="button"
                onClick={() => setActiveTab('food')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'food'
                    ? 'bg-white dark:bg-surface-container shadow-xs text-primary-600'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <span>🥗 อาหาร & เครื่องปรุง</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'food' ? 'bg-primary-500/15 text-primary-700' : 'bg-surface-container text-muted'}`}>
                  {foodAndSeasoningItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('non_food')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'non_food'
                    ? 'bg-white dark:bg-surface-container shadow-xs text-slate-700 dark:text-slate-200'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <span>🧼 ของใช้ทั่วไป</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'non_food' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800' : 'bg-surface-container text-muted'}`}>
                  {nonFoodItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('needs_review')}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'needs_review'
                    ? 'bg-white dark:bg-surface-container shadow-xs text-amber-600'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <span>⚠️ ต้องตรวจสอบ</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'needs_review' ? 'bg-amber-100 text-amber-800' : 'bg-surface-container text-muted'}`}>
                  {needsReviewItems.length}
                </span>
              </button>
            </div>

            {/* TAB 1: อาหารและเครื่องปรุง (Food & Seasoning) */}
            {activeTab === 'food' && (
              <div className="space-y-3">
                {foodAndSeasoningItems.length === 0 ? (
                  <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-dashed border-border">
                    <p className="text-xs text-muted">ไม่พบรายการอาหารในแท็บนี้ (อาจอยู่ในแท็บ &quot;ต้องตรวจสอบ&quot; หรือ &quot;ของใช้&quot;)</p>
                  </div>
                ) : (
                  foodAndSeasoningItems.map((it) => {
                    const autoEmoji = getAutoEmoji(it.name || 'สินค้า');
                    const dupItem = findDuplicateInFridge(it.name, it.targetFridgeId);
                    const isSeasoning = it.category === 'seasoning';
                    const priceValidation = validatePriceConsistency(it.quantity, it.unitPrice, it.lineTotal);

                    return (
                      <div
                        key={it.id}
                        className="bg-surface-container-low p-3.5 sm:p-4 rounded-2xl space-y-2.5 border border-border/60 hover:border-primary-500/40 transition"
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-2xl bg-white dark:bg-card flex items-center justify-center text-2xl shrink-0 shadow-xs border border-border">
                              <span>{autoEmoji}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-heading font-bold text-sm sm:text-base text-foreground truncate">
                                  {it.name || 'ยังไม่ระบุชื่อสินค้า'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleReclassify(it.id, isSeasoning ? 'food' : 'seasoning')}
                                  className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition ${
                                    isSeasoning
                                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300'
                                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                  }`}
                                  title="คลิกเพื่อสลับระหว่าง อาหาร กับ เครื่องปรุง"
                                >
                                  {isSeasoning ? '🧂 เครื่องปรุง' : '🥗 อาหาร'}
                                </button>
                                {it.isUserEdited && (
                                  <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.2 rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-300 border border-primary-500/20">
                                    แก้ไขแล้ว
                                  </span>
                                )}
                              </div>

                              {dupItem && (
                                <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  <span>มีในตู้นี้แล้ว ({dupItem.quantity}) • จะรวมจำนวนให้อัตโนมัติ</span>
                                </div>
                              )}

                              {/* Quantity & Detailed Price Row */}
                              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                                <span className="font-semibold text-foreground">
                                  {it.quantity} {it.unit}
                                </span>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {it.lineTotal !== null ? (
                                    <span className="font-heading font-bold text-primary-600 dark:text-primary-400">
                                      ฿{it.lineTotal.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-amber-600 dark:text-amber-400 italic font-medium">
                                      ไม่ระบุราคา
                                    </span>
                                  )}

                                  {it.unitPrice !== null && it.quantity > 1 && (
                                    <span className="text-muted text-[11px]">
                                      (฿{it.unitPrice.toFixed(2)}/{it.unit})
                                    </span>
                                  )}

                                  {/* Badge ระบุแหล่งที่มาของราคา */}
                                  {it.lineTotal !== null && (
                                    it.isPriceEstimated ? (
                                      <span
                                        className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                        title={it.priceSourceLabel || 'ราคาประเมินมาตรฐาน'}
                                      >
                                        💡 ราคาประเมิน
                                      </span>
                                    ) : (
                                      <span
                                        className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                        title="ราคาจริงจากใบเสร็จ"
                                      >
                                        🧾 จากใบเสร็จ
                                      </span>
                                    )
                                  )}
                                </div>

                                {priceValidation.hasDiscrepancy && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingItem(it)}
                                    className="cursor-pointer text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-semibold hover:bg-amber-500/25 transition"
                                    title={priceValidation.message}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    <span>ราคาไม่ตรง</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons: [แก้ไข] & [ลบ] */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingItem(it)}
                              className="px-2.5 py-1.5 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-700 dark:text-primary-300 border border-primary-500/25 text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow-2xs"
                              title="เปิดหน้าต่างแก้ไขข้อมูลสินค้าอย่างละเอียด"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>แก้ไข</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              className="text-muted hover:text-red-500 p-1.5 rounded-xl hover:bg-surface-container transition"
                              title="ลบรายการนี้"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Shelf-Life & Expiry Presets Row */}
                        <div className="pt-2 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-muted flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-primary-600" />
                              <span>วันหมดอายุ:</span>
                            </span>
                            {it.expiryDate ? (
                              <div className="inline-flex items-center gap-1 bg-primary-500/10 text-primary-700 dark:text-primary-300 font-bold px-2 py-0.5 rounded-md text-[11px] border border-primary-500/25">
                                <span>{formatThaiDate(it.expiryDate)}</span>
                                <button
                                  type="button"
                                  onClick={() => updateItem(it.id, { expiryDate: null })}
                                  className="hover:text-red-600 ml-0.5"
                                  title="ล้างวันหมดอายุ"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted italic">ยังไม่ระบุ:</span>
                            )}

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQuickExpiryDays(it.id, 3)}
                                className="px-2 py-0.5 rounded bg-white dark:bg-card border border-border/80 hover:border-primary-400 text-[10px] text-muted hover:text-foreground font-medium transition"
                              >
                                +3 วัน (สด)
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuickExpiryDays(it.id, 7)}
                                className="px-2 py-0.5 rounded bg-white dark:bg-card border border-border/80 hover:border-primary-400 text-[10px] text-muted hover:text-foreground font-medium transition"
                              >
                                +7 วัน (นม)
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuickExpiryDays(it.id, 30)}
                                className="px-2 py-0.5 rounded bg-white dark:bg-card border border-border/80 hover:border-primary-400 text-[10px] text-muted hover:text-foreground font-medium transition"
                              >
                                +30 วัน (ซอส/แห้ง)
                              </button>
                            </div>
                          </div>

                          {/* Fridge selector */}
                          <div className="flex items-center gap-1 bg-white dark:bg-card px-2.5 py-1 rounded-xl border border-border/70 text-xs shrink-0">
                            <span className="text-muted text-[11px]">ตู้:</span>
                            <select
                              value={it.targetFridgeId || fridges[0]?.id || ''}
                              onChange={(e) => updateItem(it.id, { targetFridgeId: e.target.value })}
                              className="bg-transparent font-medium text-xs text-foreground outline-none cursor-pointer"
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
                  })
                )}
              </div>
            )}

            {/* TAB 2: ของใช้ที่ไม่ใช่อาหาร (Non-Food Items) */}
            {activeTab === 'non_food' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                  <div>
                    <strong className="block text-slate-900 dark:text-slate-100">AI คัดแยกสินค้าที่ไม่ใช่อาหารออกโดยอัตโนมัติ</strong>
                    <span>รายการด้านล่างนี้จะไม่ถูกนำเข้าตู้เย็น แต่ยังคงนำยอดเงินไปรวมในงบประมาณได้ หาก AI เข้าใจผิด สามารถกดย้ายกลับมาเป็นอาหารได้ทันที</span>
                  </div>
                </div>

                {nonFoodItems.length === 0 ? (
                  <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-dashed border-border">
                    <p className="text-xs text-muted">ไม่มีของใช้ทั่วไปในใบเสร็จนี้</p>
                  </div>
                ) : (
                  nonFoodItems.map((it) => (
                    <div
                      key={it.id}
                      className="bg-surface-container-low p-3.5 rounded-2xl flex items-center justify-between gap-3 border border-border/60 hover:border-slate-400/50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center text-lg shrink-0">
                          🧼
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-heading font-bold text-sm text-foreground block truncate">
                            {it.name}
                          </span>
                          <span className="text-[11px] text-muted block truncate">
                            {it.reason || 'ของใช้ในบ้าน/ผลิตภัณฑ์ทำความสะอาด'} • {it.quantity} {it.unit}
                            {it.lineTotal !== null ? ` (฿${it.lineTotal.toFixed(2)})` : it.price !== null ? ` (฿${it.price.toFixed(2)})` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingItem(it)}
                          className="px-2.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-bold text-foreground transition flex items-center gap-1 active:scale-95"
                          title="แก้ไขข้อมูลของใช้ หรือเปลี่ยนหมวดหมู่"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-primary-500" />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReclassify(it.id, 'food')}
                          className="px-2.5 py-1.5 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-700 dark:text-primary-300 border border-primary-500/25 text-xs font-bold transition flex items-center gap-1 active:scale-95"
                          title="ย้ายรายการนี้ไปยังหมวดอาหาร"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>เป็นอาหาร</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          className="w-8 h-8 rounded-xl bg-surface-container text-muted hover:text-red-500 flex items-center justify-center transition border border-border/60"
                          title="ลบรายการ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: ต้องตรวจสอบ (Needs Review Items) */}
            {activeTab === 'needs_review' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <HelpCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <strong className="block text-amber-950 dark:text-amber-100">รายการที่ AI ไม่แน่ใจหรือชื่อไม่ชัดเจน</strong>
                    <span>กรุณากดปุ่มแก้ไข หรือกดเลือกประเภทเพื่อยืนยันข้อมูลให้ถูกต้อง</span>
                  </div>
                </div>

                {needsReviewItems.length === 0 ? (
                  <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-dashed border-border">
                    <p className="text-xs text-muted">ไม่มีรายการที่ต้องตรวจสอบเพิ่มเติม ตรวจพบครบถ้วนแล้ว!</p>
                  </div>
                ) : (
                  needsReviewItems.map((it) => (
                    <div
                      key={it.id}
                      className="bg-surface-container-low p-3.5 rounded-2xl space-y-2.5 border border-amber-300 dark:border-amber-800/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs font-bold shrink-0">
                            ?
                          </span>
                          <span className="font-heading font-bold text-sm text-foreground truncate">
                            {it.name || 'ไม่ทราบชื่อสินค้า'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingItem(it)}
                            className="px-2.5 py-1 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 text-primary-700 dark:text-primary-300 border border-primary-500/25 text-xs font-bold transition flex items-center gap-1 active:scale-95"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>แก้ไข</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            className="text-muted hover:text-red-500 p-1.5 rounded-xl hover:bg-surface-container transition"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted flex items-center justify-between flex-wrap gap-1">
                        <span>{it.reason || 'AI ตรวจพบความมั่นใจต่ำ ต้องการการยืนยัน'}</span>
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <span>{it.quantity} {it.unit}</span>
                          {it.lineTotal !== null ? (
                            <span className="text-primary-600 dark:text-primary-400">
                              • ฿{it.lineTotal.toFixed(2)} {it.isPriceEstimated && <span className="text-[10px] text-amber-600 dark:text-amber-300 font-normal">(ราคาประเมิน)</span>}
                            </span>
                          ) : (
                            <span className="text-muted font-normal">• ไม่พบราคา</span>
                          )}
                        </span>
                      </div>

                      {/* 3 Classification Action Buttons */}
                      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                        <span className="text-[11px] text-muted">ยืนยันเป็น:</span>
                        <button
                          type="button"
                          onClick={() => handleReclassify(it.id, 'food')}
                          className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/25 transition active:scale-95"
                        >
                          🥗 อาหาร
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReclassify(it.id, 'seasoning')}
                          className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25 transition active:scale-95"
                        >
                          🧂 เครื่องปรุง
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReclassify(it.id, 'non_food')}
                          className="px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 text-xs font-bold hover:bg-slate-300 transition active:scale-95"
                        >
                          🧼 ของใช้
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Add Missing Item Button */}
            <button
              type="button"
              onClick={addManualRow}
              className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-primary-500 text-xs font-semibold text-muted hover:text-primary-600 flex items-center justify-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มรายการสินค้าที่ตกหล่น</span>
            </button>

            {/* Clean Summary & Confirmation Panel (PART 6) */}
            <div className="bg-surface-container-low rounded-3xl p-5 border border-border/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-primary-500/15 text-primary-600 flex items-center justify-center shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-heading text-sm sm:text-base font-bold text-foreground flex items-center gap-2 flex-wrap">
                      <span>สรุปข้อมูลก่อนเพิ่มเข้าตู้เย็น</span>
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                        พร้อมบันทึก {foodAndSeasoningItems.length} รายการ
                      </span>
                      {needsReviewItems.length > 0 && (
                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                          รอตรวจสอบ {needsReviewItems.length} รายการ
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-muted mt-0.5">
                      ระบบจะเพิ่มเฉพาะสินค้าอาหารและเครื่องปรุงเข้าสู่ตู้เย็น และคัดแยกของใช้ออก 100%
                    </p>
                  </div>
                </div>

                {/* Price Summary */}
                <div className="flex flex-col sm:items-end text-left sm:text-right bg-white dark:bg-card p-3 rounded-2xl border border-border/70">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted font-medium">ยอดรวมจากใบเสร็จ:</span>
                    <strong className="font-heading text-lg sm:text-xl text-primary-600 dark:text-primary-400 font-bold">
                      ฿{actualReceiptTotal.toFixed(2)}
                    </strong>
                  </div>
                  {estimatedTotal > 0 && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold mt-0.5">
                      + ฿{estimatedTotal.toFixed(2)} (ราคาประเมินตลาด ไม่รวมในบิลจริง)
                    </span>
                  )}
                </div>
              </div>

              {/* Destination Fridge Selector (Default เป็นตู้หลัก) */}
              {fridges.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 bg-white dark:bg-card rounded-2xl border border-border/70 text-xs">
                  <div className="flex items-center gap-2">
                    <Refrigerator className="w-4 h-4 text-primary-600" />
                    <div>
                      <span className="font-bold text-foreground block">เลือกตู้เย็นปลายทาง:</span>
                      <span className="text-[11px] text-muted">กำหนดตู้เย็นปลายทางสำหรับทุกรายการอาหารพร้อมกัน</span>
                    </div>
                  </div>
                  <select
                    value={defaultFridgeId || fridges[0]?.id || ''}
                    onChange={(e) => handleChangeDefaultFridge(e.target.value)}
                    aria-label="เลือกตู้เย็นปลายทางสำหรับทุกรายการ"
                    className="bg-surface-container px-3 py-2 rounded-xl border border-border text-foreground font-bold text-xs outline-none cursor-pointer hover:border-primary-500 transition"
                  >
                    {fridges.map((f) => (
                      <option key={f.id} value={f.id} className="bg-card text-foreground">
                        {f.icon || '❄️'} {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={handleConfirmAndSave}
                disabled={submitting || foodAndSeasoningItems.length === 0}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white py-4 rounded-2xl font-heading font-bold text-base shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2.5 active:scale-[0.99] transition disabled:opacity-60 cursor-pointer"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>
                      ยืนยันและเพิ่มเข้าตู้เย็น ({foodAndSeasoningItems.length} รายการอาหารและเครื่องปรุง)
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Budget Tracking Card */}
        <div className="bg-white dark:bg-card rounded-3xl p-5 sm:p-6 shadow-xs border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="font-heading font-bold text-sm text-foreground">
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
                <span className="font-heading text-xl sm:text-2xl font-bold text-foreground">
                  ฿{budgetSummary.totalSpent.toLocaleString()}
                </span>
                <span className="text-xs text-muted font-medium">
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

            {budgetSummary.totalSpent > 0 ? (
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-foreground">
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

        {/* Edit Scanned Item Modal (Mobile Bottom Sheet / Desktop Dialog) */}
        <EditScannedItemModal
          isOpen={Boolean(editingItem)}
          item={editingItem}
          fridges={fridges}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveEditedItem}
        />

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
