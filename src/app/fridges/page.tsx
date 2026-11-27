'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { AddProductModal } from '@/components/inventory/AddProductModal';
import { EditProductModal, getAutoEmoji } from '@/components/inventory/EditProductModal';
import { QuantityStepper } from '@/components/inventory/QuantityStepper';
import { FridgeModal } from '@/components/fridge/FridgeModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SkeletonRow } from '@/components/ui/LoadingSkeleton';
import toast from 'react-hot-toast';
import {
  Refrigerator,
  Plus,
  Search,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  CookingPot,
  Calendar,
} from 'lucide-react';
import type { Item, ItemBatch, Fridge } from '@/types/database';
import {
  getDaysUntilExpiry,
  normalizeDateString,
  formatThaiDate,
  formatThaiTimestampDate,
  formatExpiryShortBadge,
  getBangkokTodayString,
  addDaysToDateString,
  parseCalendarDate,
} from '@/lib/date';

interface ItemWithBatches extends Item {
  item_batches?: ItemBatch[];
  earliestExpiry?: string | null;
  daysLeft?: number | null;
}

function FridgesContent() {
  const router = useRouter();
  const supabase = createClient();
  const { currentHousehold, fridges, authUser, user, deleteFridge, canAddItems, canEditItems, canDeleteItems } = useHousehold();

  const [items, setItems] = useState<ItemWithBatches[]>([]);
  const [loading, setLoading] = useState(true);
  const restockSectionRef = useRef<HTMLDivElement>(null);
  const [showDiaryStrip, setShowDiaryStrip] = useState(false);

  // Filters
  const [activeFridgeTab, setActiveFridgeTab] = useState<string>('all');
  const [activeFreshness, setActiveFreshness] = useState<'all' | 'soon' | 'today' | 'expired' | 'fresh'>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const searchParams = useSearchParams();

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddFridge, setShowAddFridge] = useState(false);
  const [editingFridge, setEditingFridge] = useState<Fridge | null>(null);
  const [deletingFridge, setDeletingFridge] = useState<Fridge | null>(null);
  const [deletingFridgeLoading, setDeletingFridgeLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemWithBatches | null>(null);
  const [deletingItem, setDeletingItem] = useState<ItemWithBatches | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showRestock, setShowRestock] = useState(true);

  // ตรวจสอบ query param ?add=true หรือ ?fridge=<id>
  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setShowAddProduct(true);
    }
    const fridgeParam = searchParams.get('fridge');
    if (fridgeParam && fridges.some((f) => f.id === fridgeParam)) {
      setActiveFridgeTab(fridgeParam);
    }
  }, [searchParams, fridges]);

  // ถ้าตู้เย็นที่เลือกอยู่ถูกลบ ให้สลับกลับมาเป็น 'all'
  useEffect(() => {
    if (activeFridgeTab !== 'all' && fridges.length > 0 && !fridges.some((f) => f.id === activeFridgeTab)) {
      setActiveFridgeTab('all');
    }
  }, [activeFridgeTab, fridges]);

  // ดึงข้อมูล Items และ Batches
  const fetchInventory = useCallback(async () => {
    if (!currentHousehold?.id || !authUser?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. ดึงรายการสินค้าทั้งหมดในครัวเรือน
      const { data: itemRows, error } = await supabase
        .from('items')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
          setItems([]);
          return;
        }
        throw error;
      }
      if (!itemRows || itemRows.length === 0) {
        setItems([]);
        return;
      }

      // 2. ดึง batches เพื่อหาวันหมดอายุที่เร็วที่สุด
      const itemIds = itemRows.map((i) => i.id);
      const { data: batchRows } = await supabase
        .from('item_batches')
        .select('*')
        .in('item_id', itemIds)
        .order('expiry_date', { ascending: true });

      const batchMap = new Map<string, ItemBatch[]>();
      if (batchRows) {
        for (const b of batchRows as ItemBatch[]) {
          const arr = batchMap.get(b.item_id) || [];
          arr.push(b);
          batchMap.set(b.item_id, arr);
        }
      }

      const combined: ItemWithBatches[] = itemRows.map((it) => {
        const batches = batchMap.get(it.id) || [];
        const activeBatch = batches.find((b) => b.expiry_date && Number(b.quantity) > 0) || batches.find((b) => b.expiry_date);
        const cleanExpiry = normalizeDateString(activeBatch?.expiry_date);
        const daysLeft = getDaysUntilExpiry(cleanExpiry);

        return {
          ...it,
          item_batches: batches,
          earliestExpiry: cleanExpiry,
          daysLeft,
        };
      });

      setItems(combined);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  }, [currentHousehold?.id, authUser?.id, supabase]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // ลบสินค้า
  async function handleDeleteConfirm() {
    if (!canDeleteItems) {
      toast.error('คุณไม่มีสิทธิ์ลบสินค้า (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }
    if (!deletingItem || !currentHousehold?.id || !authUser?.id) return;
    setDeleting(true);
    try {
      await supabase.from('items').delete().eq('id', deletingItem.id);

      const currentUserName = user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก';
      await supabase.from('activity_logs').insert({
        household_id: currentHousehold.id,
        fridge_id: deletingItem.fridge_id,
        user_id: authUser.id,
        action: 'item_removed',
        details: {
          user_name: currentUserName,
          item_name: deletingItem.name,
        },
      });

      setItems((prev) => prev.filter((i) => i.id !== deletingItem.id));
      toast.success(`ลบ "${deletingItem.name}" ออกจากตู้แล้ว`);
      setDeletingItem(null);
    } catch {
      toast.error('ลบสินค้าไม่สำเร็จ');
    } finally {
      setDeleting(false);
    }
  }

  // ส่งไปเมนู AI
  function handleCookAI(itemName: string, fridgeId?: string) {
    toast.success(`ส่ง "${itemName}" ไปยังเมนู AI เรียบร้อย! 🍲`);
    router.push(
      `/recipes?ingredient=${encodeURIComponent(itemName)}${fridgeId ? `&fridgeId=${encodeURIComponent(fridgeId)}` : ''}`
    );
  }

  // เติมสต็อกกลับเข้าตู้เย็น (+1) จริงใน Database
  async function handleRestockItem(item: ItemWithBatches) {
    if (!canEditItems && !canAddItems) {
      toast.error('คุณไม่มีสิทธิ์เติมสต็อก (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }
    if (!currentHousehold?.id || !authUser?.id) return;
    try {
      await supabase
        .from('items')
        .update({ quantity: 1, status: 'low_stock', updated_at: new Date().toISOString() })
        .eq('id', item.id);

      const currentUserName = user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก';
      await supabase.from('activity_logs').insert({
        household_id: currentHousehold.id,
        fridge_id: item.fridge_id,
        item_id: item.id,
        user_id: authUser.id,
        action: 'quantity_increased',
        details: {
          user_name: currentUserName,
          item_name: item.name,
          amount: 1,
          new_quantity: 1,
          unit: item.unit,
        },
      });

      toast.success(`เติม "${item.name}" กลับเข้าตู้เย็น (+1 ${item.unit}) แล้ว!`);
      fetchInventory();
    } catch {
      toast.error('ไม่สามารถเติมสต็อกได้');
    }
  }

  // ลบตู้เย็น (เฉพาะตู้ที่เลือก ไม่กระทบตู้เย็นใบอื่น)
  async function handleDeleteFridgeConfirm() {
    if (!deletingFridge) return;
    setDeletingFridgeLoading(true);
    try {
      const ok = await deleteFridge(deletingFridge.id);
      if (ok) {
        if (activeFridgeTab === deletingFridge.id) {
          setActiveFridgeTab('all');
        }
        setDeletingFridge(null);
        fetchInventory();
      }
    } finally {
      setDeletingFridgeLoading(false);
    }
  }

  // แบ่งสินค้าในสต็อก และสินค้าหมด
  const inStockItems = useMemo(() => items.filter((i) => Number(i.quantity) > 0), [items]);
  const outOfStockItems = useMemo(() => items.filter((i) => Number(i.quantity) === 0), [items]);

  // คำนวณจำนวนไอเทมของแต่ละตู้
  const fridgeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of inStockItems) {
      if (it.fridge_id) {
        map.set(it.fridge_id, (map.get(it.fridge_id) || 0) + 1);
      }
    }
    return map;
  }, [inStockItems]);

  // รายการในตู้ที่เลือก (ห้ามปะปนกับตู้อื่นเมื่อเลือกตู้เฉพาะ)
  const scopedInStockItems = useMemo(() => {
    if (activeFridgeTab === 'all') return inStockItems;
    return inStockItems.filter((i) => i.fridge_id === activeFridgeTab);
  }, [inStockItems, activeFridgeTab]);

  const scopedOutOfStockItems = useMemo(() => {
    if (activeFridgeTab === 'all') return outOfStockItems;
    return outOfStockItems.filter((i) => i.fridge_id === activeFridgeTab);
  }, [outOfStockItems, activeFridgeTab]);

  // นับจำนวนตามสถานะวันหมดอายุในตู้ที่เลือก (Calendar Date Asia/Bangkok)
  const freshnessCounts = useMemo(() => {
    let expired = 0;
    let today = 0;
    let soon = 0;
    let fresh = 0;
    for (const item of scopedInStockItems) {
      const d = item.daysLeft;
      if (d === null || d === undefined) {
        fresh++;
      } else if (d < 0) {
        expired++;
      } else if (d === 0) {
        today++;
      } else if (d <= 5) {
        soon++;
      } else {
        fresh++;
      }
    }
    return { expired, today, soon, fresh };
  }, [scopedInStockItems]);

  const bangkokToday = useMemo(() => getBangkokTodayString(), []);

  // 7 วันในแถบไดอารี่ (-2 วัน ถึง +4 วัน) ตาม UI.pdf Page 2
  const weekDays = useMemo(() => {
    const THAI_DAY_LETTERS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const list = [];
    for (let offset = -2; offset <= 4; offset++) {
      const dateStr = addDaysToDateString(bangkokToday, offset);
      const parts = parseCalendarDate(dateStr);
      if (parts) {
        const dObj = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
        const dayOfWeek = dObj.getUTCDay();
        const expiringCount = inStockItems.filter((it) => it.earliestExpiry === dateStr).length;
        list.push({
          dateStr,
          dayNumber: parts.day,
          dayName: THAI_DAY_LETTERS[dayOfWeek],
          isToday: offset === 0,
          expiringCount,
        });
      }
    }
    return list;
  }, [bangkokToday, inStockItems]);

  // กรองตาม Filter (ตู้เย็น, ไดอารี่วันที่, สถานะความสด, หมวดหมู่, คำค้นหา)
  const filteredItems = useMemo(() => {
    return scopedInStockItems.filter((item) => {
      // 0. กรองตามวันที่เลือกในไดอารี่ 7 วัน
      if (selectedCalendarDate) {
        if (item.earliestExpiry !== selectedCalendarDate) return false;
      }

      // 1. สถานะวันหมดอายุ (ทั้งหมด / ใกล้หมดอายุ / หมดอายุวันนี้ / หมดอายุแล้ว / ยังสดใหม่)
      if (activeFreshness !== 'all') {
        const d = item.daysLeft;
        if (activeFreshness === 'expired' && !(d !== null && d !== undefined && d < 0)) return false;
        if (activeFreshness === 'today' && d !== 0) return false;
        if (activeFreshness === 'soon' && !(d !== null && d !== undefined && d > 0 && d <= 5)) return false;
        if (activeFreshness === 'fresh' && d !== null && d !== undefined && d <= 5) return false;
      }

      // 2. หมวดหมู่ (เดาจากชื่อหรือ emoji/unit)
      if (activeCategory !== 'all') {
        const text = (item.name + ' ' + (item.notes || '')).toLowerCase();
        if (activeCategory === 'veggie' && !text.match(/ผัก|สลัด|ผลไม้|แตง|มะ|หอม|เห็ด|แอปเปิ้ล|ส้ม/)) return false;
        if (activeCategory === 'meat' && !text.match(/ไก่|หมู|เนื้อ|ปลา|กุ้ง|เป็ด|เบคอน|ไส้กรอก/)) return false;
        if (activeCategory === 'dairy' && !text.match(/นม|เนย|ชีส|โยเกิร์ต|ไข่/)) return false;
        if (activeCategory === 'drink' && !text.match(/น้ำ|ชา|กาแฟ|น้ำส้ม|โซดา|โค้ก|เบียร์|นม/)) return false;
        if (activeCategory === 'seasoning' && !text.match(/ซอส|พริก|เกลือ|น้ำตาล|ซีอิ๊ว|น้ำมัน|กระเทียม/)) return false;
      }

      // 3. คำค้นหา
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !(item.notes || '').toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [scopedInStockItems, selectedCalendarDate, activeFreshness, activeCategory, search]);

  const activeFridgeObj = fridges.find((f) => f.id === activeFridgeTab) || null;

  function scrollToRestockSection() {
    setShowRestock(true);
    setTimeout(() => {
      restockSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-12 gap-5 animate-in fade-in duration-300">
        {/* 1. Top Summary Cards Row (PDF Page 2) */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Card: รวมทุกตู้เย็น */}
          <button
            type="button"
            onClick={() => setActiveFridgeTab('all')}
            className={`ds-card p-4 text-left flex flex-col justify-between gap-2 transition active:scale-[0.98] cursor-pointer ${
              activeFridgeTab === 'all'
                ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-100/15 ring-2 ring-primary-500/20'
                : 'hover:border-primary-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-heading font-semibold text-xs sm:text-sm text-primary-700 dark:text-primary-300 truncate">
                  รวมทุกตู้เย็น
                </p>
                <p className="text-[11px] text-muted truncate">ของทั้งหมดในบ้าน</p>
              </div>
              <span className="text-xl shrink-0">🧊</span>
            </div>
            <span className="font-heading text-2xl sm:text-3xl font-bold text-foreground tabular-nums">
              {inStockItems.length}
            </span>
          </button>

          {/* Cards: Each Fridge */}
          {fridges.map((f) => {
            const count = fridgeCounts.get(f.id) || 0;
            const isActive = activeFridgeTab === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFridgeTab(f.id)}
                className={`ds-card p-4 text-left flex flex-col justify-between gap-2 transition active:scale-[0.98] cursor-pointer ${
                  isActive
                    ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-100/15 ring-2 ring-primary-500/20'
                    : 'hover:border-primary-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-heading font-semibold text-xs sm:text-sm text-foreground truncate">
                      {f.name}
                    </p>
                    <p className="text-[11px] text-muted truncate">รายการในตู้</p>
                  </div>
                  <span className="text-xl shrink-0">{f.icon || '❄️'}</span>
                </div>
                <span className="font-heading text-2xl sm:text-3xl font-bold text-foreground tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}

          {/* Card: ต้องซื้อเติม */}
          <button
            type="button"
            onClick={scrollToRestockSection}
            className="ds-card p-4 text-left flex flex-col justify-between gap-2 hover:border-amber-400 transition active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-heading font-semibold text-xs sm:text-sm text-foreground truncate">
                  ต้องซื้อเติม
                </p>
                <p className="text-[11px] text-muted truncate">รายการที่หมดแล้ว</p>
              </div>
              <span className="text-xl shrink-0">🛒</span>
            </div>
            <span className="font-heading text-2xl sm:text-3xl font-bold text-primary-600 tabular-nums">
              {outOfStockItems.length}
            </span>
          </button>
        </section>

        {/* 2. Search + Shopping List + Add Fridge + Add Product Action Bar (PDF Page 2) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
          <div className="ds-input relative flex items-center flex-1 shadow-[var(--shadow-xs)] bg-card">
            <Search className="w-4 h-4 text-muted absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า เช่น นมสด, อกไก่, บราวนี่..."
              className="w-full h-11 pl-10 pr-9 bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-muted hover:text-foreground text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <button
              type="button"
              onClick={scrollToRestockSection}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-card hover:bg-surface-container-low border border-border text-foreground text-xs sm:text-sm font-semibold shadow-[var(--shadow-xs)] transition active:scale-95 cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-primary-600" />
              <span>Shopping List</span>
              {scopedOutOfStockItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/12 text-rose-600 text-[10px] font-bold">
                  {scopedOutOfStockItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowDiaryStrip((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold shadow-[var(--shadow-xs)] transition active:scale-95 cursor-pointer ${
                showDiaryStrip || selectedCalendarDate
                  ? 'bg-primary-100 border-primary-300 text-primary-700'
                  : 'bg-card hover:bg-surface-container-low border-border text-foreground'
              }`}
            >
              <Calendar className="w-4 h-4 text-primary-600" />
              <span>ปฏิทิน</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingFridge(null);
                setShowAddFridge(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-card hover:bg-surface-container-low border border-border text-foreground text-xs sm:text-sm font-semibold shadow-[var(--shadow-xs)] transition active:scale-95 cursor-pointer"
            >
              <Refrigerator className="w-4 h-4 text-primary-600" />
              <span>+ ตู้เย็น</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!canAddItems) {
                  toast.error('คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
                  return;
                }
                setShowAddProduct(true);
              }}
              className="ds-btn-primary inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm cursor-pointer flex-1 sm:flex-initial shadow-[0_3px_10px_-2px_rgba(234,88,12,0.4)]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>เพิ่มของเข้าตู้</span>
            </button>
          </div>
        </div>

        {/* Selected Fridge Quick Manage Bar */}
        {activeFridgeObj && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-surface-container-low border border-border text-xs">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <span>{activeFridgeObj.icon || '❄️'}</span>
              <span>กำลังดูตู้: {activeFridgeObj.name}</span>
              <span className="text-muted font-normal">({scopedInStockItems.length} รายการ)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setEditingFridge(activeFridgeObj);
                  setShowAddFridge(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card hover:bg-surface-container border border-border font-medium text-muted hover:text-foreground transition cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
                <span>แก้ไขตู้</span>
              </button>
              <button
                type="button"
                onClick={() => setDeletingFridge(activeFridgeObj)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card hover:bg-rose-500/10 border border-border hover:border-rose-500/30 font-medium text-muted hover:text-rose-600 transition cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>ลบตู้</span>
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Food Diary 7-Day Calendar Strip */}
        {(showDiaryStrip || selectedCalendarDate !== null) && (
          <div className="ds-card p-4 sm:p-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-600 text-[20px]">calendar_month</span>
                <span className="font-heading font-semibold text-sm text-foreground">
                  ไดอารี่ความสด 7 วัน ({formatThaiDate(bangkokToday)})
                </span>
              </div>
              {selectedCalendarDate && (
                <button
                  type="button"
                  onClick={() => setSelectedCalendarDate(null)}
                  className="text-xs font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200/70 px-3 py-1 rounded-full border border-primary-600/20 transition cursor-pointer"
                >
                  ดูทั้งหมด ({scopedInStockItems.length}) ✕
                </button>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {weekDays.map((day) => {
                const isSelected = selectedCalendarDate === day.dateStr;
                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => setSelectedCalendarDate(isSelected ? null : day.dateStr)}
                    className={`flex flex-col items-center justify-center py-2 sm:py-3 rounded-2xl transition active:scale-95 relative cursor-pointer ${
                      isSelected
                        ? 'bg-primary-600 text-white shadow-[0_2px_8px_-2px_rgba(234,88,12,0.4)] font-semibold'
                        : day.isToday
                        ? 'bg-primary-100 border border-primary-600/25 text-primary-700 dark:text-primary-200 hover:bg-primary-200/60'
                        : 'bg-surface-container-low hover:bg-surface-container text-foreground border border-border'
                    }`}
                  >
                    <span className={`text-[10px] sm:text-xs font-medium ${isSelected ? 'text-white/90' : 'text-muted'}`}>
                      {day.dayName}
                    </span>
                    <span className="font-heading font-semibold text-sm sm:text-base mt-0.5 tabular-nums">
                      {day.dayNumber}
                    </span>
                    {day.expiringCount > 0 && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1 ${
                          isSelected ? 'bg-white' : 'bg-rose-500 animate-pulse'
                        }`}
                        title={`มีของหมดอายุ ${day.expiringCount} รายการ`}
                      />
                    )}
                    {day.isToday && !isSelected && (
                      <span className="text-[9px] font-semibold text-primary-600 dark:text-primary-300 mt-0.5">วันนี้</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Freshness & Category Filters */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: `ทั้งหมด (${scopedInStockItems.length})`, activeCls: 'bg-foreground text-background border-foreground' },
              { id: 'soon', label: `ใกล้หมดอายุ (${freshnessCounts.soon})`, activeCls: 'bg-amber-600 text-white border-amber-600' },
              { id: 'today', label: `หมดอายุวันนี้ (${freshnessCounts.today})`, activeCls: 'bg-amber-700 text-white border-amber-700' },
              { id: 'expired', label: `หมดอายุแล้ว (${freshnessCounts.expired})`, activeCls: 'bg-rose-600 text-white border-rose-600' },
              { id: 'fresh', label: `ยังสดใหม่ (${freshnessCounts.fresh})`, activeCls: 'bg-primary-600 text-white border-primary-600' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setActiveFreshness(st.id as 'all' | 'soon' | 'today' | 'expired' | 'fresh')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition border cursor-pointer ${
                  activeFreshness === st.id
                    ? st.activeCls
                    : 'bg-card text-muted hover:text-foreground hover:bg-surface-container-low border-border'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'all', label: 'ทุกหมวด' },
              { id: 'veggie', label: 'ผัก/ผลไม้ 🥦' },
              { id: 'meat', label: 'เนื้อสัตว์ 🥩' },
              { id: 'dairy', label: 'นม/เนย 🥛' },
              { id: 'drink', label: 'เครื่องดื่ม 🧃' },
              { id: 'seasoning', label: 'เครื่องปรุง 🧂' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 transition active:scale-95 cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-primary-600 text-white shadow-[var(--shadow-xs)]'
                    : 'bg-surface-container-low text-muted hover:text-foreground border border-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Inventory Items 2-Column Card Grid (PDF Page 2) */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 sm:p-10 rounded-[20px] border border-dashed border-border bg-card text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto">
              <Refrigerator className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-semibold text-sm sm:text-base text-foreground">
              {search ? 'ไม่พบวัตถุดิบที่ตรงกับคำค้นหา' : 'ยังไม่มีวัตถุดิบในหมวดหมู่นี้'}
            </h3>
            <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
              กดปุ่มเพิ่มสินค้า หรือสแกนใบเสร็จเพื่อนำของเข้าตู้เย็นอัตโนมัติ
            </p>
            <button
              type="button"
              onClick={() => {
                if (!canAddItems) {
                  toast.error('คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
                  return;
                }
                setShowAddProduct(true);
              }}
              className="ds-btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มของเข้าตู้</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredItems.map((item) => {
              const fridgeObj = fridges.find((f) => f.id === item.fridge_id);
              const daysLeft = item.daysLeft ?? null;

              let badgeColor = 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
              const badgeText = formatExpiryShortBadge(daysLeft);
              let isUrgent = false;
              let isItemExpired = false;

              if (daysLeft !== null) {
                if (daysLeft < 0) {
                  badgeColor = 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25';
                  isItemExpired = true;
                } else if (daysLeft <= 2) {
                  badgeColor = 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25';
                  isUrgent = true;
                } else if (daysLeft <= 5) {
                  badgeColor = 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25';
                  isUrgent = true;
                }
              }

              return (
                <div
                  key={item.id}
                  className="ds-card p-4 flex flex-col gap-3 hover:border-primary-400/50 transition"
                >
                  {/* Card Top Header Row: Fridge pill + Edit / Delete / Cook AI */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low border border-border text-[11px] font-medium text-muted truncate max-w-[60%]">
                      <span>{fridgeObj?.icon || '❄️'}</span>
                      <span className="truncate">{fridgeObj?.name || 'ตู้เย็น'}</span>
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {isUrgent && !isItemExpired && (
                        <button
                          type="button"
                          onClick={() => handleCookAI(item.name, item.fridge_id)}
                          className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-0.5 cursor-pointer"
                          title="ส่งไปให้ AI คิดสูตรเมนู"
                        >
                          <CookingPot className="w-3 h-3" />
                          <span>ปรุงด่วน</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (!canEditItems) {
                            toast.error('คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
                            return;
                          }
                          setEditingItem(item);
                        }}
                        className="text-[11px] font-medium text-muted hover:text-foreground transition cursor-pointer"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canDeleteItems) {
                            toast.error('คุณไม่มีสิทธิ์ลบวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
                            return;
                          }
                          setDeletingItem(item);
                        }}
                        className="text-[11px] font-medium text-muted hover:text-rose-600 transition cursor-pointer"
                      >
                        ลบออก
                      </button>
                    </div>
                  </div>

                  {/* Card Main Row: Emoji + Name/Expiry + Quantity Stepper */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shrink-0 bg-surface-container-low border border-border flex items-center justify-center text-2xl">
                        {item.image_url && (item.image_url.startsWith('http') || item.image_url.startsWith('data:image')) ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{item.image_url || getAutoEmoji(item.name) || '🥫'}</span>
                        )}
                      </div>

                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span>{badgeText}</span>
                          </span>
                        </div>
                        <h3 className="font-heading font-bold text-sm sm:text-base text-foreground truncate">
                          {item.name}
                        </h3>
                        <p className="text-[11px] text-muted truncate">
                          เพิ่มเมื่อ {formatThaiTimestampDate(item.created_at)} •{' '}
                          {item.earliestExpiry
                            ? `หมดอายุ ${formatThaiDate(item.earliestExpiry)}`
                            : 'ไม่ระบุวันหมดอายุ'}
                        </p>
                      </div>
                    </div>

                    <QuantityStepper
                      itemId={item.id}
                      initialQuantity={Number(item.quantity)}
                      unit={item.unit}
                      itemName={item.name}
                      fridgeId={item.fridge_id}
                      onQuantityChange={() => fetchInventory()}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Out of Stock / Restock Collapsible Section */}
        {scopedOutOfStockItems.length > 0 && (
          <div ref={restockSectionRef} className="rounded-[20px] bg-surface-container border border-border p-4 sm:p-5 transition mt-2">
            <button
              type="button"
              onClick={() => setShowRestock(!showRestock)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold text-sm text-foreground">
                      ของหมด / ต้องซื้อเพิ่ม
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/12 text-rose-700 dark:text-rose-300 text-[10px] font-semibold border border-rose-500/20">
                      {scopedOutOfStockItems.length} รายการ
                    </span>
                  </div>
                  <span className="text-[11px] text-muted">
                    วัตถุดิบหมดสต็อก กดเติมของเพื่อนำกลับเข้าตู้เย็นได้ทันที
                  </span>
                </div>
              </div>

              {showRestock ? (
                <ChevronUp className="w-5 h-5 text-muted" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted" />
              )}
            </button>

            {showRestock && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-4 pt-3 border-t border-border">
                {scopedOutOfStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border shadow-[var(--shadow-xs)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-lg shrink-0">
                        {item.image_url || getAutoEmoji(item.name) || '🥫'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-heading font-semibold text-xs text-foreground truncate">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-rose-600 font-medium">
                          คงเหลือ: 0 {item.unit} (หมด)
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestockItem(item)}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-100 hover:bg-primary-600 text-primary-700 dark:text-primary-200 hover:text-white text-xs font-semibold active:scale-95 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>เติมของ (+1)</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AddProductModal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        defaultFridgeId={activeFridgeTab !== 'all' ? activeFridgeTab : undefined}
        onSuccess={fetchInventory}
      />

      <FridgeModal
        isOpen={showAddFridge}
        fridge={editingFridge}
        onClose={() => {
          setShowAddFridge(false);
          setEditingFridge(null);
        }}
      />

      {deletingFridge && (
        <ConfirmModal
          isOpen={Boolean(deletingFridge)}
          title="ยืนยันการลบตู้เย็น"
          description={`คุณต้องการลบตู้เย็น "${deletingFridge.name}" และวัตถุดิบภายในตู้นี้ใช่หรือไม่? (จะไม่กระทบตู้เย็นใบอื่น)`}
          confirmLabel="ลบตู้เย็นนี้"
          isDanger
          loading={deletingFridgeLoading}
          onConfirm={handleDeleteFridgeConfirm}
          onClose={() => setDeletingFridge(null)}
        />
      )}

      {editingItem && (
        <EditProductModal
          isOpen={Boolean(editingItem)}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={fetchInventory}
        />
      )}

      {deletingItem && (
        <ConfirmModal
          isOpen={Boolean(deletingItem)}
          title="ยืนยันการลบสินค้า"
          description={`คุณต้องการลบ "${deletingItem.name}" ออกจากตู้เย็นใช่หรือไม่?`}
          confirmLabel="ลบสินค้า"
          isDanger
          loading={deleting}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeletingItem(null)}
        />
      )}
    </MainLayout>
  );
}

export default function FridgesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <FridgesContent />
    </Suspense>
  );
}
