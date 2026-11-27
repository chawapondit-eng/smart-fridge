'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  Calendar,
  Sparkles,
  Refrigerator,
  DollarSign,
  Plus,
  Minus,
  Tag,
  Scale,
} from 'lucide-react';
import {
  STANDARD_UNIT_GROUPS,
  ALL_STANDARD_UNITS,
  validatePriceConsistency,
  getEstimatedPriceBenchmark,
  type ProductCategory,
  type PriceSource,
} from '@/lib/productClassifier';
import { addDaysFromBangkokToday } from '@/lib/date';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';

export interface EditableReceiptItem {
  id: string;
  name: string;
  category: ProductCategory;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  lineTotal: number | null;
  price: number | null;
  expiryDate: string | null;
  targetFridgeId?: string;
  confidence: number;
  reason: string;
  rawText?: string;
  isExcluded: boolean;
  isUserEdited?: boolean;
  priceSource?: PriceSource;
  isPriceEstimated?: boolean;
  priceSourceLabel?: string;
}

interface FridgeOption {
  id: string;
  name: string;
  icon?: string;
}

interface EditScannedItemModalProps {
  isOpen: boolean;
  item: EditableReceiptItem | null;
  fridges: FridgeOption[];
  onClose: () => void;
  onSave: (updatedItem: EditableReceiptItem) => void;
}

export function EditScannedItemModal({
  isOpen,
  item,
  fridges,
  onClose,
  onSave,
}: EditScannedItemModalProps) {
  if (!isOpen || !item) return null;

  return (
    <EditScannedItemModalContent
      item={item}
      fridges={fridges}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function EditScannedItemModalContent({
  item,
  fridges,
  onClose,
  onSave,
}: {
  item: EditableReceiptItem;
  fridges: FridgeOption[];
  onClose: () => void;
  onSave: (updatedItem: EditableReceiptItem) => void;
}) {
  // 1. Local Form State
  const [name, setName] = useState<string>(item.name);
  const [category, setCategory] = useState<ProductCategory>(item.category);
  const [quantity, setQuantity] = useState<number>(item.quantity || 1);
  const [unit, setUnit] = useState<string>(item.unit || 'ชิ้น');
  const [isCustomUnit, setIsCustomUnit] = useState<boolean>(
    !ALL_STANDARD_UNITS.includes(item.unit || '') && Boolean(item.unit)
  );
  const [customUnitText, setCustomUnitText] = useState<string>(
    !ALL_STANDARD_UNITS.includes(item.unit || '') ? item.unit || '' : ''
  );

  const [unitPrice, setUnitPrice] = useState<number | null>(item.unitPrice);
  const [lineTotal, setLineTotal] = useState<number | null>(item.lineTotal ?? item.price);
  const [expiryDate, setExpiryDate] = useState<string | null>(item.expiryDate);
  const [targetFridgeId, setTargetFridgeId] = useState<string>(
    item.targetFridgeId || fridges[0]?.id || ''
  );

  // Sync state if initial item changes
  useEffect(() => {
    setName(item.name);
    setCategory(item.category);
    setQuantity(item.quantity || 1);
    const standard = ALL_STANDARD_UNITS.includes(item.unit || '');
    setUnit(item.unit || 'ชิ้น');
    setIsCustomUnit(!standard && Boolean(item.unit));
    setCustomUnitText(!standard ? item.unit || '' : '');
    setUnitPrice(item.unitPrice);
    setLineTotal(item.lineTotal ?? item.price);
    setExpiryDate(item.expiryDate);
    setTargetFridgeId(item.targetFridgeId || fridges[0]?.id || '');
  }, [item, fridges]);

  // Dynamic emoji
  const previewEmoji = useMemo(() => {
    if (category === 'non_food') return '🧼';
    if (category === 'seasoning') return '🧂';
    return getAutoEmoji(name || 'สินค้า');
  }, [category, name]);

  // Price validation & discrepancy checker
  const priceValidation = useMemo(() => {
    return validatePriceConsistency(quantity, unitPrice, lineTotal);
  }, [quantity, unitPrice, lineTotal]);

  // Benchmark estimated price fallback
  const benchmarkPrice = useMemo(() => {
    return getEstimatedPriceBenchmark(name);
  }, [name]);

  // Recalculation Handlers
  function handleQuantityChange(newQty: number) {
    const validQty = Math.max(0.01, Number(newQty) || 1);
    setQuantity(validQty);

    // If unitPrice exists, recalculate lineTotal
    if (unitPrice !== null) {
      setLineTotal(Math.round(validQty * unitPrice * 100) / 100);
    } else if (lineTotal !== null) {
      // If lineTotal exists but unitPrice doesn't, calculate unitPrice
      setUnitPrice(Math.round((lineTotal / validQty) * 100) / 100);
    }
  }

  function handleUnitPriceChange(rawVal: string) {
    if (rawVal.trim() === '') {
      setUnitPrice(null);
      return;
    }
    const val = parseFloat(rawVal);
    if (!isNaN(val) && val >= 0) {
      setUnitPrice(val);
      // Auto recalculate Line Total
      if (quantity > 0) {
        setLineTotal(Math.round(quantity * val * 100) / 100);
      }
    }
  }

  function handleLineTotalChange(rawVal: string) {
    if (rawVal.trim() === '') {
      setLineTotal(null);
      return;
    }
    const val = parseFloat(rawVal);
    if (!isNaN(val) && val >= 0) {
      setLineTotal(val);
      // Auto recalculate Unit Price
      if (quantity > 0) {
        setUnitPrice(Math.round((val / quantity) * 100) / 100);
      }
    }
  }

  function handleQuickExpiry(days: number) {
    const dateStr = addDaysFromBangkokToday(days);
    setExpiryDate(dateStr);
  }

  function handleUnitSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomUnit(true);
    } else {
      setIsCustomUnit(false);
      setUnit(val);
    }
  }

  function handleSave() {
    const finalUnit = isCustomUnit ? customUnitText.trim() || 'ชิ้น' : unit || 'ชิ้น';
    const finalCleanName = name.trim() || item.name;

    const hasPriceChanged = unitPrice !== item.unitPrice || lineTotal !== item.lineTotal;
    const finalPriceSource: PriceSource = hasPriceChanged ? 'receipt' : (item.priceSource || 'receipt');
    const finalIsEstimate = hasPriceChanged ? false : Boolean(item.isPriceEstimated);

    const updated: EditableReceiptItem = {
      ...item,
      name: finalCleanName,
      category,
      quantity,
      unit: finalUnit,
      unitPrice,
      lineTotal,
      price: lineTotal ?? unitPrice,
      priceSource: finalPriceSource,
      isPriceEstimated: finalIsEstimate,
      priceSourceLabel: hasPriceChanged ? 'ผู้ใช้กำหนดราคาเอง' : item.priceSourceLabel,
      expiryDate: expiryDate || null,
      targetFridgeId: targetFridgeId || undefined,
      isExcluded: category === 'non_food',
      isUserEdited: true,
      reason: `ผู้ใช้แก้ไขข้อมูลด้วยตนเอง (${category === 'food' ? 'อาหาร' : category === 'seasoning' ? 'เครื่องปรุง' : 'ของใช้'})`,
    };

    onSave(updated);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-foreground/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full sm:max-w-xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto bg-card rounded-t-[24px] sm:rounded-[22px] border border-border shadow-[var(--shadow-lg)] flex flex-col p-5 sm:p-6 space-y-4 text-foreground animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-item-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary-100 border border-primary-600/20 flex items-center justify-center text-2xl">
              {previewEmoji}
            </div>
            <div>
              <h2
                id="edit-item-modal-title"
                className="font-heading font-semibold text-base sm:text-lg text-foreground flex items-center gap-2"
              >
                <span>แก้ไขข้อมูลสินค้า</span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:text-primary-300">
                  AI OCR
                </span>
              </h2>
              {item.rawText && item.rawText !== name && (
                <p className="text-xs text-muted truncate max-w-xs sm:max-w-sm mt-0.5">
                  ข้อความเดิม: <span className="font-mono text-muted/90">&quot;{item.rawText}&quot;</span>
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-muted hover:text-foreground transition active:scale-95"
            aria-label="ปิดหน้าต่างแก้ไข"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4">
          {/* 3.1 Product Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-primary-500" />
              <span>ชื่อสินค้า</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ระบุชื่อวัตถุดิบหรือสินค้า..."
              className="w-full bg-surface-container-low border border-border focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none transition"
            />
          </div>

          {/* 3.2 Product Category Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary-500" />
              <span>หมวดหมู่สินค้า</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCategory('food')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  category === 'food'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'bg-surface-container-low border-border/80 text-muted hover:text-foreground'
                }`}
              >
                <span>🥗 อาหาร</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory('seasoning')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  category === 'seasoning'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'bg-surface-container-low border-border/80 text-muted hover:text-foreground'
                }`}
              >
                <span>🧂 เครื่องปรุง</span>
              </button>

              <button
                type="button"
                onClick={() => setCategory('non_food')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  category === 'non_food'
                    ? 'bg-slate-300/40 dark:bg-slate-700/60 border-slate-400 dark:border-slate-600 text-slate-800 dark:text-slate-100 shadow-xs'
                    : 'bg-surface-container-low border-border/80 text-muted hover:text-foreground'
                }`}
              >
                <span>🧼 ของใช้</span>
              </button>
            </div>

            {category === 'non_food' && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <strong>ของใช้ทั่วไปจะไม่ถูกนำเข้าตู้เย็น</strong> แต่ระบบจะยังคงนำราคาสินค้าไปรวมในงบประมาณประจำสัปดาห์
                </span>
              </div>
            )}
          </div>

          {/* 3.4 Quantity & 3.5 Unit Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Quantity */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-primary-500" />
                <span>จำนวน (Quantity)</span>
              </label>
              <div className="flex items-center bg-surface-container-low border border-border rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(Math.max(0.5, quantity - (quantity > 1 ? 1 : 0.5)))}
                  className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-muted hover:text-foreground transition active:scale-90"
                  aria-label="ลดจำนวน"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  value={quantity}
                  onChange={(e) => handleQuantityChange(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent text-center font-bold text-sm text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + 1)}
                  className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-muted hover:text-foreground transition active:scale-90"
                  aria-label="เพิ่มจำนวน"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Unit Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                หน่วยนับ (Unit)
              </label>
              <div className="flex flex-col gap-1.5">
                <select
                  value={isCustomUnit ? '__custom__' : unit}
                  onChange={handleUnitSelect}
                  className="w-full bg-surface-container-low border border-border focus:border-primary-500 rounded-xl px-3 py-2 text-xs font-semibold text-foreground outline-none cursor-pointer"
                  aria-label="เลือกหน่วยนับ"
                >
                  {STANDARD_UNIT_GROUPS.map((group) => (
                    <optgroup key={group.groupName} label={group.groupName}>
                      {group.units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__custom__">✏️ กำหนดหน่วยเอง (Custom Unit)...</option>
                </select>

                {isCustomUnit && (
                  <input
                    type="text"
                    value={customUnitText}
                    onChange={(e) => setCustomUnitText(e.target.value)}
                    placeholder="พิมพ์หน่วย เช่น ถาด, ลัง, มัด..."
                    className="w-full bg-surface-container-low border border-primary-500/60 rounded-xl px-3 py-1.5 text-xs text-foreground outline-none"
                  />
                )}

                {/* Quick Unit Chips */}
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {['ชิ้น', 'แพ็ก', 'กล่อง', 'ขวด', 'ถุง', 'กระป๋อง', 'กรัม', 'กิโลกรัม', 'ฟอง', 'จาน', 'ถ้วย'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => {
                        setUnit(u);
                        setIsCustomUnit(false);
                      }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition ${
                        !isCustomUnit && unit === u
                          ? 'bg-primary-500/20 border-primary-500 text-primary-700 dark:text-primary-300 font-bold'
                          : 'bg-surface-container-low hover:bg-surface-container border-border/70 text-muted hover:text-foreground'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3.3 Price: Separate Unit Price & Line Total with Auto Calculation */}
          <div className="space-y-1.5 p-3.5 rounded-2xl bg-surface-container-low border border-border/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-primary-500" />
                <span>การระบุราคา (คำนวณอัตโนมัติ)</span>
              </label>
              {priceValidation.hasDiscrepancy && (
                <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>ตัวเลขไม่ตรงกัน</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Unit Price */}
              <div className="space-y-1">
                <span className="text-[11px] text-muted">ราคาต่อหน่วย (Unit Price)</span>
                <div className="flex items-center bg-card border border-border rounded-xl px-3 py-2 focus-within:border-primary-500">
                  <span className="text-xs font-bold text-primary-500 mr-1.5">฿</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={unitPrice === null ? '' : unitPrice}
                    onChange={(e) => handleUnitPriceChange(e.target.value)}
                    placeholder="ไม่ระบุราคา"
                    className="w-full bg-transparent text-xs font-bold text-foreground placeholder:text-muted placeholder:font-normal outline-none"
                  />
                  <span className="text-[10px] text-muted shrink-0">/{isCustomUnit ? customUnitText || 'หน่วย' : unit}</span>
                </div>
              </div>

              {/* Line Total */}
              <div className="space-y-1">
                <span className="text-[11px] text-muted">ราคารวมทั้งหมด (Line Total)</span>
                <div className="flex items-center bg-card border border-border rounded-xl px-3 py-2 focus-within:border-primary-500">
                  <span className="text-xs font-bold text-primary-500 mr-1.5">฿</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={lineTotal === null ? '' : lineTotal}
                    onChange={(e) => handleLineTotalChange(e.target.value)}
                    placeholder="ไม่ระบุราคา"
                    className="w-full bg-transparent text-xs font-bold text-foreground placeholder:text-muted placeholder:font-normal outline-none"
                  />
                  <span className="text-[10px] text-muted shrink-0">รวม</span>
                </div>
              </div>
            </div>

            {priceValidation.hasDiscrepancy && priceValidation.message && (
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-700 dark:text-amber-300 mt-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>{priceValidation.message}</span>
              </div>
            )}

            {/* Benchmark Estimated Price Option when price is missing */}
            {unitPrice === null && lineTotal === null && benchmarkPrice.estimatedPrice !== null && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 text-xs mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-base shrink-0">💡</span>
                  <div>
                    <span className="font-bold text-primary-800 dark:text-primary-200">
                      ราคาประเมินมาตรฐาน: ฿{benchmarkPrice.estimatedPrice.toLocaleString()} / {benchmarkPrice.benchmarkUnit || unit}
                    </span>
                    <span className="block text-[10px] text-primary-600 dark:text-primary-400">
                      (ราคาเฉลี่ยตลาดทั่วไป ติดป้ายกำกับราคาประเมิน ไม่ใช่ราคาจริงจากบิล)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUnitPrice(benchmarkPrice.estimatedPrice);
                    if (quantity > 0 && benchmarkPrice.estimatedPrice) {
                      setLineTotal(Math.round(quantity * benchmarkPrice.estimatedPrice * 100) / 100);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-bold text-[11px] shadow-xs active:scale-95 transition shrink-0 cursor-pointer"
                >
                  ใช้ราคาประเมินนี้
                </button>
              </div>
            )}
          </div>

          {/* 3.6 Expiry Date Picker & Quick Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary-500" />
                <span>วันหมดอายุ (Expiry Date)</span>
              </label>
              <span className="text-[10px] text-muted">เว้นว่างได้หากใบเสร็จไม่ระบุ</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={expiryDate || ''}
                onChange={(e) => setExpiryDate(e.target.value || null)}
                className="w-full bg-surface-container-low border border-border focus:border-primary-500 rounded-xl px-3 py-2 text-xs font-semibold text-foreground outline-none"
              />
              {expiryDate && (
                <button
                  type="button"
                  onClick={() => setExpiryDate(null)}
                  className="px-2.5 py-2 rounded-xl bg-surface-container text-muted hover:text-red-500 text-xs font-semibold shrink-0 transition"
                  title="ล้างวันหมดอายุ"
                >
                  ล้าง
                </button>
              )}
            </div>

            {/* Quick shelf-life presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] text-muted">ด่วน:</span>
              <button
                type="button"
                onClick={() => handleQuickExpiry(3)}
                className="px-2 py-0.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-border/80 text-[10px] font-medium text-muted hover:text-foreground transition"
              >
                +3 วัน (ของสด)
              </button>
              <button
                type="button"
                onClick={() => handleQuickExpiry(7)}
                className="px-2 py-0.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-border/80 text-[10px] font-medium text-muted hover:text-foreground transition"
              >
                +7 วัน (นม/เนื้อ)
              </button>
              <button
                type="button"
                onClick={() => handleQuickExpiry(14)}
                className="px-2 py-0.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-border/80 text-[10px] font-medium text-muted hover:text-foreground transition"
              >
                +14 วัน (ไข่)
              </button>
              <button
                type="button"
                onClick={() => handleQuickExpiry(30)}
                className="px-2 py-0.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-border/80 text-[10px] font-medium text-muted hover:text-foreground transition"
              >
                +30 วัน (ซอส/แห้ง)
              </button>
            </div>
          </div>

          {/* Destination Fridge (สำหรับอาหารและเครื่องปรุง) */}
          {category !== 'non_food' && fridges.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Refrigerator className="w-3.5 h-3.5 text-primary-500" />
                <span>ตู้เย็นปลายทาง</span>
              </label>
              <select
                value={targetFridgeId}
                onChange={(e) => setTargetFridgeId(e.target.value)}
                className="w-full bg-surface-container-low border border-border focus:border-primary-500 rounded-xl px-3 py-2 text-xs font-semibold text-foreground outline-none cursor-pointer"
              >
                {fridges.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.icon || '❄️'} {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Modal Action Buttons (3.7 Save / Cancel) */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/70">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs sm:text-sm font-bold text-foreground transition active:scale-98"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="ds-btn-primary w-full py-2.5 px-4 text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>บันทึกการแก้ไข</span>
          </button>
        </div>
      </div>
    </div>
  );
}
