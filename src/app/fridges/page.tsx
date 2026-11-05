'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { AddProductModal } from '@/components/inventory/AddProductModal';
import { EditProductModal } from '@/components/inventory/EditProductModal';
import { FridgeModal } from '@/components/fridge/FridgeModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SkeletonCard, SkeletonRow } from '@/components/ui/LoadingSkeleton';
import toast from 'react-hot-toast';
import {
  Refrigerator,
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  CheckCircle,
  Utensils,
  AlarmClock,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  CookingPot,
  Sparkles,
  Layers,
} from 'lucide-react';
import type { Item, ItemBatch } from '@/types/database';

interface ItemWithBatches extends Item {
  item_batches?: ItemBatch[];
  earliestExpiry?: string | null;
  daysLeft?: number | null;
}

function FridgesContent() {
  const router = useRouter();
  const supabase = createClient();
  const { currentHousehold, fridges, authUser, user, refreshFridges } = useHousehold();

  const [items, setItems] = useState<ItemWithBatches[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeFridgeTab, setActiveFridgeTab] = useState<string>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const searchParams = useSearchParams();

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddFridge, setShowAddFridge] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemWithBatches | null>(null);
  const [deletingItem, setDeletingItem] = useState<ItemWithBatches | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showRestock, setShowRestock] = useState(true);

  // ตรวจสอบ query param ?add=true จาก Bottom Navigation
  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setShowAddProduct(true);
    }
  }, [searchParams]);

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

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const combined: ItemWithBatches[] = itemRows.map((it) => {
        const batches = batchMap.get(it.id) || [];
        const activeBatch = batches.find((b) => b.expiry_date && Number(b.quantity) > 0);
        let daysLeft: number | null = null;
        if (activeBatch?.expiry_date) {
          const exp = new Date(activeBatch.expiry_date);
          exp.setHours(0, 0, 0, 0);
          daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          ...it,
          item_batches: batches,
          earliestExpiry: activeBatch?.expiry_date || null,
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

  // ฟังก์ชันใช้ของ (-1)
  async function handleConsume(item: ItemWithBatches) {
    if (!currentHousehold?.id || !authUser?.id) return;
    const currentQty = Number(item.quantity);
    if (currentQty <= 0) {
      toast.error('สินค้าหมดแล้ว');
      return;
    }

    const newQty = Math.max(0, currentQty - 1);
    const newStatus = newQty === 0 ? 'out_of_stock' : newQty <= 1 ? 'low_stock' : 'in_stock';

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty, status: newStatus } : i))
    );

    try {
      await supabase
        .from('items')
        .update({ quantity: newQty, status: newStatus })
        .eq('id', item.id);

      const currentUserName = user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก';
      await supabase.from('activity_logs').insert({
        household_id: currentHousehold.id,
        fridge_id: item.fridge_id,
        item_id: item.id,
        user_id: authUser.id,
        action: 'quantity_decreased',
        details: {
          user_name: currentUserName,
          item_name: item.name,
          amount: 1,
          new_quantity: newQty,
          unit: item.unit,
        },
      });

      toast.success(`ใช้แล้ว! "${item.name}" คงเหลือ ${newQty} ${item.unit}`);
    } catch (err) {
      toast.error('ไม่สามารถอัปเดตจำนวนได้');
      fetchInventory();
    }
  }

  // ลบสินค้า
  async function handleDeleteConfirm() {
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
  function handleCookAI(itemName: string) {
    toast.success(`ส่ง "${itemName}" ไปยังเมนู AI เรียบร้อย! 🍲`);
    router.push(`/recipes?ingredient=${encodeURIComponent(itemName)}`);
  }

  // เพิ่มในรายการซื้อ
  function handleAddToGroceryList(itemName: string) {
    toast.success(`ใส่ "${itemName}" ในรายการซื้อของแล้ว 🛒`);
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

  // กรองตาม Filter (ตู้เย็น, หมวดหมู่, คำค้นหา)
  const filteredItems = useMemo(() => {
    return inStockItems.filter((item) => {
      // 1. ตู้เย็น
      if (activeFridgeTab !== 'all' && item.fridge_id !== activeFridgeTab) {
        return false;
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
  }, [inStockItems, activeFridgeTab, activeCategory, search]);

  const urgentCount = inStockItems.filter((i) => i.daysLeft !== null && i.daysLeft !== undefined && i.daysLeft <= 2).length;

  const householdTitleName = currentHousehold?.name || user?.display_name || authUser?.email?.split('@')[0] || 'ของฉัน';

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-12 gap-5 animate-in fade-in duration-300">
        {/* Top Ambient Banner & Stats Pulse */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
              ตู้เย็น บ้านคุณ{householdTitleName} ❄️
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
              {currentHousehold?.name || 'ครัวในบ้าน'} •{' '}
              {urgentCount > 0 ? (
                <span className="text-tertiary-600 font-bold">
                  ตรวจพบของใกล้หมดอายุ {urgentCount} รายการ!
                </span>
              ) : (
                <span className="text-secondary-600 font-bold">
                  ของในตู้สดยังคงคุณภาพดีเยี่ยม 🌱
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddProduct(true)}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary-600 to-primary-500 text-white shadow-md shadow-primary-500/25 active:scale-95 transition shrink-0"
            title="เพิ่มวัตถุดิบด่วน"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Multi-Fridge Switcher (Segmented Pill Carousel) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setActiveFridgeTab('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-bold shrink-0 transition active:scale-95 shadow-xs ${
              activeFridgeTab === 'all'
                ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">kitchen</span>
            <span>ทั้งหมด ({inStockItems.length})</span>
          </button>

          {fridges.map((f) => {
            const count = fridgeCounts.get(f.id) || 0;
            const isActive = activeFridgeTab === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFridgeTab(f.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-bold shrink-0 transition active:scale-95 shadow-xs ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <span>{f.icon || '❄️'}</span>
                <span>
                  {f.name} ({count})
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowAddFridge(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 shrink-0 transition border border-primary-200"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>เพิ่มตู้</span>
          </button>
        </div>

        {/* Search & Category Filter Area */}
        <div className="flex flex-col gap-3">
          {/* Search Bar */}
          <div className="relative flex items-center w-full rounded-2xl bg-surface-container-lowest border border-border shadow-xs">
            <Search className="w-4 h-4 text-muted absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาวัตถุดิบ เช่น นม, ผัก, ไข่ไก่, ซอส..."
              className="w-full h-11 pl-10 pr-9 bg-transparent rounded-2xl text-xs sm:text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-muted hover:text-foreground text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'all', label: 'ทั้งหมด' },
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
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition active:scale-95 shadow-xs ${
                  activeCategory === cat.id
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low border border-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inventory Items List */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 rounded-3xl border border-dashed border-border bg-surface-container-lowest text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-container text-muted flex items-center justify-center mx-auto">
              <Refrigerator className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-bold text-sm text-foreground">
              {search ? 'ไม่พบวัตถุดิบที่ตรงกับคำค้นหา' : 'ยังไม่มีวัตถุดิบในหมวดหมู่นี้'}
            </h3>
            <p className="text-xs text-muted max-w-xs mx-auto">
              กดปุ่มเพิ่มสินค้า หรือสแกนใบเสร็จเพื่อนำของเข้าตู้เย็นอัตโนมัติ
            </p>
            <button
              type="button"
              onClick={() => setShowAddProduct(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-bold shadow-xs active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มวัตถุดิบ</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map((item) => {
              const fridgeObj = fridges.find((f) => f.id === item.fridge_id);
              const daysLeft = item.daysLeft;

              // กำหนด Badge วันหมดอายุ (ดีไซน์คมชัด สบายตา ไม่แสบตาใน Dark Mode)
              let badgeColor = 'bg-secondary-500/15 text-secondary-700 dark:text-secondary-300 border-secondary-500/30';
              let badgeText = 'ยังสดใหม่';
              let isUrgent = false;

              if (daysLeft !== null && daysLeft !== undefined) {
                if (daysLeft < 0) {
                  badgeColor = 'bg-tertiary-500/15 text-tertiary-700 dark:text-tertiary-300 border-tertiary-500/30';
                  badgeText = `หมดอายุแล้ว ${Math.abs(daysLeft)} วัน`;
                  isUrgent = true;
                } else if (daysLeft === 0) {
                  badgeColor = 'bg-tertiary-500/20 text-tertiary-700 dark:text-tertiary-300 border-tertiary-500/40 animate-pulse';
                  badgeText = 'หมดอายุวันนี้!';
                  isUrgent = true;
                } else if (daysLeft <= 2) {
                  badgeColor = 'bg-tertiary-500/20 text-tertiary-700 dark:text-tertiary-300 border-tertiary-500/40 animate-pulse';
                  badgeText = `หมดใน ${daysLeft} วัน`;
                  isUrgent = true;
                } else if (daysLeft <= 5) {
                  badgeColor = 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
                  badgeText = `หมดใน ${daysLeft} วัน`;
                } else {
                  badgeColor = 'bg-secondary-500/15 text-secondary-700 dark:text-secondary-300 border-secondary-500/30';
                  badgeText = `เหลือ ${daysLeft} วัน`;
                }
              }

              return (
                <div
                  key={item.id}
                  className="flex flex-col p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border hover:shadow-md transition"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Thumbnail */}
                    <div className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-surface-container-low border border-border flex items-center justify-center text-3xl shadow-inner">
                      {item.image_url && item.image_url.startsWith('http') ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{item.image_url || '🥫'}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-heading font-bold text-sm text-on-surface truncate">
                          {item.name}
                        </h3>
                        {/* Expiry Badge */}
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          <span>{badgeText}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                          <span>{fridgeObj?.icon || '❄️'}</span>
                          <span>{fridgeObj?.name || 'ตู้เย็น'}</span>
                        </span>
                        <span className="text-muted">•</span>
                        <span className="text-xs font-bold text-primary-600">
                          จำนวน: {item.quantity} {item.unit}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Row */}
                  <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-border/50">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-on-surface-variant">
                      {isUrgent ? (
                        <span className="text-tertiary-600 font-bold flex items-center gap-1">
                          <AlarmClock className="w-3.5 h-3.5" />
                          <span>ควรรีบใช้ให้หมด</span>
                        </span>
                      ) : (
                        <span>พร้อมปรุงอาหาร</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isUrgent && (
                        <button
                          type="button"
                          onClick={() => handleCookAI(item.name)}
                          className="px-3 py-1.5 rounded-xl bg-tertiary-500/15 hover:bg-tertiary-500/25 border border-tertiary-500/30 text-tertiary-700 dark:text-tertiary-300 text-xs font-bold transition flex items-center gap-1 active:scale-95 shadow-xs"
                          title="ส่งไปให้ AI คิดสูตรเมนู"
                        >
                          <CookingPot className="w-3.5 h-3.5" />
                          <span>ปรุงด่วน</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingItem(item)}
                        className="px-3 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container text-on-surface text-xs font-semibold transition"
                      >
                        แก้ไข
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingItem(item)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-surface-container-low text-tertiary-600 hover:bg-tertiary-100 transition"
                        title="ลบรายการ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleConsume(item)}
                        className="px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold active:scale-95 transition shadow-xs flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>ใช้แล้ว (-1)</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Out of Stock / Restock Collapsible Section */}
        {outOfStockItems.length > 0 && (
          <div className="rounded-3xl bg-surface-container-low border border-border p-4 shadow-xs transition mt-4">
            <button
              type="button"
              onClick={() => setShowRestock(!showRestock)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-sm text-on-surface">
                      ของหมด / ต้องซื้อเพิ่ม
                    </span>
                    <span className="px-2 py-0.2 rounded-full bg-tertiary-100 text-tertiary-800 text-[10px] font-bold">
                      {outOfStockItems.length} รายการ
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">
                    วัตถุดิบหมดสต็อก เตรียมช้อปปิ้งรอบใหม่
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
              <div className="flex flex-col gap-2.5 mt-4 pt-3 border-t border-border/60">
                {outOfStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-surface-container-lowest border border-border/80 shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-lg">
                        {item.image_url || '🥫'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-heading font-bold text-xs text-on-surface truncate">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-tertiary-600 font-medium">
                          คงเหลือ: 0 {item.unit} (หมด)
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddToGroceryList(item.name)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-100 hover:bg-primary-500 text-primary-800 hover:text-white text-xs font-bold active:scale-95 transition"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>+ รายการซื้อ</span>
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
        onClose={() => setShowAddFridge(false)}
      />

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
