'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { SkeletonCard } from '@/components/ui/LoadingSkeleton';
import { AddProductModal } from '@/components/inventory/AddProductModal';
import { FridgeModal } from '@/components/fridge/FridgeModal';
import { ShareHouseholdModal } from '@/components/household/ShareHouseholdModal';
import { EditBudgetModal } from '@/components/budget/EditBudgetModal';
import { BudgetOverviewCard } from '@/components/dashboard/BudgetOverviewCard';
import { SmartHealthDonutCard } from '@/components/dashboard/SmartHealthDonutCard';
import { fetchWeeklyBudgetSummary, type WeeklyBudgetSummary } from '@/lib/budget';
import {
  getDaysUntilExpiry,
  normalizeDateString,
  formatThaiDate,
  formatExpiryShortBadge,
} from '@/lib/date';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';
import toast from 'react-hot-toast';
import {
  Refrigerator,
  Plus,
  Receipt,
  Sparkles,
  ChevronRight,
  AlarmClock,
  Wallet,
  Eye,
  Share2,
  Edit2,
  Copy,
  Check,
  Users,
  AlertTriangle,
  Leaf,
  Package,
  CookingPot,
  ArrowRight,
} from 'lucide-react';
import type { Item, ActivityLog } from '@/types/database';

interface ExpiringItem extends Item {
  daysLeft: number;
  expiry_date: string;
}

export default function DashboardPage() {
  const supabase = createClient();
  const { currentHousehold, fridges, user, authUser, refreshHouseholds, canAddItems } = useHousehold();

  const [items, setItems] = useState<Item[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [expiredItems, setExpiredItems] = useState<ExpiringItem[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [memberCount, setMemberCount] = useState<number>(1);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Real Budget Summary state
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

  const handleBudgetUpdated = useCallback((newBudget: number) => {
    setBudgetSummary((prev) => {
      const remaining = Math.max(0, newBudget - prev.totalSpent);
      const overBudgetAmount = Math.max(0, prev.totalSpent - newBudget);
      const percentUsed = newBudget > 0 ? Math.round((prev.totalSpent / newBudget) * 100) : 0;
      return {
        ...prev,
        budget: newBudget,
        remaining,
        percentUsed,
        isOverBudget: prev.totalSpent > newBudget,
        isNearLimit: prev.totalSpent <= newBudget && percentUsed >= 80,
        overBudgetAmount,
      };
    });
  }, []);

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddFridge, setShowAddFridge] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditBudgetModal, setShowEditBudgetModal] = useState(false);
  const [selectedFridgeId, setSelectedFridgeId] = useState<string | undefined>(undefined);
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    if (!currentHousehold?.id || !authUser?.id) {
      setItems([]);
      setExpiringItems([]);
      setActivities([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    try {
      // 0. ตรวจสอบว่าผู้ใช้ยังเป็นสมาชิกของครัวเรือนนี้จริงหรือไม่
      const { data: memberCheck } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', currentHousehold.id)
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (!memberCheck) {
        setItems([]);
        setExpiringItems([]);
        setExpiredItems([]);
        setActivities([]);
        setMemberCount(0);
        setLoadingData(false);
        refreshHouseholds();
        return;
      }

      // 1. ดึง Items ทั้งหมดใน Household
      const { data: itemsData } = await supabase
        .from('items')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .order('created_at', { ascending: false });

      if (itemsData && itemsData.length > 0) {
        setItems(itemsData as Item[]);

        // 2. ดึง Batches เพื่อแยกของหมดอายุ / ใกล้หมดอายุ / ยังสดใหม่ (Asia/Bangkok Calendar Date)
        const itemIds = (itemsData as Item[]).map((i) => i.id);
        const itemMap = new Map((itemsData as Item[]).map((i) => [i.id, i]));

        const { data: batchesData } = await supabase
          .from('item_batches')
          .select('id, item_id, quantity, expiry_date')
          .in('item_id', itemIds)
          .not('expiry_date', 'is', null)
          .order('expiry_date', { ascending: true });

        if (batchesData) {
          const seenItemIds = new Set<string>();
          const expiringSoonList: ExpiringItem[] = [];
          const expiredList: ExpiringItem[] = [];

          for (const b of batchesData) {
            const it = itemMap.get(b.item_id);
            if (!it || Number(it.quantity) <= 0 || Number(b.quantity) <= 0) continue;
            if (seenItemIds.has(b.item_id)) continue;

            const cleanDate = normalizeDateString(b.expiry_date);
            if (!cleanDate) continue;
            seenItemIds.add(b.item_id);

            const daysLeft = getDaysUntilExpiry(cleanDate);
            if (daysLeft === null) continue;

            const entry: ExpiringItem = {
              ...it,
              quantity: Number(it.quantity),
              expiry_date: cleanDate,
              daysLeft,
            };

            if (daysLeft < 0) {
              expiredList.push(entry);
            } else if (daysLeft <= 3) {
              expiringSoonList.push(entry);
            }
          }

          setExpiredItems(expiredList);
          setExpiringItems(expiringSoonList);
        }
      } else {
        setItems([]);
        setExpiringItems([]);
        setExpiredItems([]);
      }

      // 3. ดึงประวัติกิจกรรมล่าสุด
      const { data: actData } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .order('created_at', { ascending: false })
        .limit(6);

      if (actData) {
        setActivities(actData as ActivityLog[]);
      }

      // 4. ดึงจำนวนสมาชิกใน Household
      const { count } = await supabase
        .from('household_members')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', currentHousehold.id);

      if (count !== null) {
        setMemberCount(count);
      }

      // 5. โหลดข้อมูล Real Weekly Budget
      const summary = await fetchWeeklyBudgetSummary(supabase, currentHousehold.id);
      setBudgetSummary(summary);
    } catch (err) {
      console.error('Error fetching dashboard data:', (err as { message?: string })?.message || err);
    } finally {
      setLoadingData(false);
    }
  }, [currentHousehold?.id, authUser?.id, refreshHouseholds, supabase]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const totalItemsCount = items.reduce((acc, curr) => acc + (Number(curr.quantity) > 0 ? 1 : 0), 0);
  const expiredCount = expiredItems.length;
  const expiringSoonCount = expiringItems.length;
  const freshItemsCount = Math.max(0, totalItemsCount - expiredCount - expiringSoonCount);
  const rawCode = currentHousehold?.id || '';
  const householdCode = rawCode.startsWith('#TY-') ? rawCode : `#TY-${rawCode.slice(0, 6).toUpperCase()}`;

  // คำนวณจำนวนและตัวอย่างไอเทมในแต่ละตู้เย็น (ข้อมูลจริงจาก Database)
  const fridgeItemsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.fridge_id && Number(item.quantity) > 0) {
        map.set(item.fridge_id, (map.get(item.fridge_id) || 0) + 1);
      }
    }
    return map;
  }, [items]);

  const fridgePreviewItemsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of items) {
      if (item.fridge_id && Number(item.quantity) > 0) {
        const list = map.get(item.fridge_id) || [];
        if (list.length < 3) {
          list.push(item.name);
          map.set(item.fridge_id, list);
        }
      }
    }
    return map;
  }, [items]);

  // คำนวณของใกล้หมดอายุในแต่ละตู้ (ยังไม่หมดอายุแต่เหลือ <= 5 วัน)
  const fridgeExpiringMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of expiringItems) {
      if (exp.fridge_id) {
        map.set(exp.fridge_id, (map.get(exp.fridge_id) || 0) + 1);
      }
    }
    return map;
  }, [expiringItems]);

  const fridgeNameMap = useMemo(() => {
    return new Map(fridges.map((f) => [f.id, f.name]));
  }, [fridges]);

  // วัตถุดิบที่พร้อมใช้จริง (มีของ และยังไม่หมดอายุ 100%) เพื่อทำ AI Recipe Daily Teaser
  const usableItems = useMemo(() => {
    return items.filter((it) => {
      if (Number(it.quantity) <= 0) return false;
      const isExp = expiredItems.some((e) => e.id === it.id);
      return !isExp;
    });
  }, [items, expiredItems]);

  const dailyRecipeTeaser = useMemo(() => {
    if (usableItems.length === 0) return null;
    const priorityItems = expiringItems.length > 0 ? expiringItems : usableItems;
    const lead = priorityItems[0];
    const secondary = usableItems.find((u) => u.id !== lead?.id);
    const names = [lead?.name, secondary?.name].filter(Boolean) as string[];

    return {
      names,
      leadName: lead?.name || '',
      dishTitle:
        names.length >= 2
          ? `เมนูจาก ${names.join(' + ')}`
          : `เมนูจาก ${names[0]}`,
      fridgeId: lead?.fridge_id || fridges[0]?.id || '',
    };
  }, [usableItems, expiringItems, fridges]);

  // รวมรายการเร่งด่วนสำหรับ "รายการที่ควรนำมาใช้ก่อน": ของหมดอายุขึ้นก่อน ตามด้วยของใกล้หมดอายุ เรียงจากเหลือน้อยวันที่สุด
  const urgentList = useMemo(() => {
    const list: ExpiringItem[] = [...expiredItems, ...expiringItems];
    return list.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [expiredItems, expiringItems]);

  function handleCopyHouseholdCode(e: React.MouseEvent) {
    e.stopPropagation();
    if (!householdCode) return;
    navigator.clipboard.writeText(householdCode);
    setCopiedCode(true);
    toast.success(`คัดลอกรหัสบ้าน ${householdCode} แล้ว!`);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function handleOpenAddProduct(fridgeId?: string) {
    if (!canAddItems) {
      toast.error('คุณไม่มีสิทธิ์เพิ่มวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }
    setSelectedFridgeId(fridgeId);
    setShowAddProduct(true);
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-10 gap-6 animate-in fade-in duration-300">
        {/* =========================================================================
            Household Hub Card (ศูนย์ข้อมูลและจัดการบ้าน)
           ========================================================================= */}
        {currentHousehold && (
          <section className="p-4 sm:p-5 rounded-3xl bg-surface-container-lowest border border-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* ซ้าย: ข้อมูลบ้าน (ไอคอนบ้าน + ชื่อบ้าน + จำนวนสมาชิก) */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-primary-500/15 text-primary-600 flex items-center justify-center shrink-0 border border-primary-500/20 shadow-2xs">
                <span className="material-symbols-outlined text-[24px]">cottage</span>
              </div>
              <div className="flex flex-col min-w-0">
                <h2 className="font-heading font-bold text-base sm:text-lg text-foreground truncate">
                  {currentHousehold.name}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                  <Users className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                  <span className="font-medium">สมาชิก {memberCount} คน</span>
                </div>
              </div>
            </div>

            {/* ขวา: ปุ่มจัดการบ้าน (คัดลอกรหัสเชิญ / แชร์รหัสบ้าน + จัดการสมาชิก) */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
              {/* ปุ่มคัดลอกรหัสเชิญ */}
              <button
                type="button"
                onClick={handleCopyHouseholdCode}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-border text-foreground text-xs font-semibold transition active:scale-95 shadow-2xs cursor-pointer flex-1 sm:flex-initial"
                title="คัดลอกรหัสเชิญเข้าบ้าน"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-bold">คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-primary-600" />
                    <span>คัดลอกรหัสเชิญ</span>
                  </>
                )}
              </button>

              {/* ปุ่มแชร์รหัสบ้าน */}
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="inline-flex items-center justify-center p-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-border text-primary-600 hover:text-primary-700 transition active:scale-95 shadow-2xs cursor-pointer"
                title="แชร์รหัสบ้าน / QR Code"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>

              {/* ปุ่มจัดการสมาชิก */}
              <Link
                href="/household"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition active:scale-95 shadow-xs cursor-pointer flex-1 sm:flex-initial"
                title="จัดการสมาชิกในบ้าน"
              >
                <Users className="w-3.5 h-3.5" />
                <span>จัดการสมาชิก</span>
              </Link>
            </div>
          </section>
        )}

        {/* =========================================================================
            Section 2: Quick Action Highlights (3 Pills matching Image 1)
           ========================================================================= */}
        <section className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => handleOpenAddProduct()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-sm active:scale-95 transition-all shrink-0 text-xs sm:text-sm font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="whitespace-nowrap">เพิ่มวัตถุดิบ</span>
          </button>

          <Link
            href="/receipts"
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container border border-border hover:bg-surface-container-high text-foreground shadow-2xs active:scale-95 transition-all shrink-0 text-xs sm:text-sm font-bold cursor-pointer"
          >
            <Receipt className="w-4 h-4 text-primary-600" />
            <span className="whitespace-nowrap">🧾 สแกนบิล OCR</span>
          </Link>

          <Link
            href="/recipes"
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 hover:bg-emerald-900/60 shadow-2xs active:scale-95 transition-all shrink-0 text-xs sm:text-sm font-bold cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="whitespace-nowrap">🪄 สุ่มเมนู AI</span>
          </Link>
        </section>

        {/* =========================================================================
            Section 3: ภาพรวมงบประมาณ (Budget Overview) — อยู่ด้านบนสุดเหนือความสดใหม่
           ========================================================================= */}
        {currentHousehold && (
          <BudgetOverviewCard
            summary={budgetSummary}
            householdId={currentHousehold.id}
            householdName={currentHousehold.name}
            onBudgetUpdated={handleBudgetUpdated}
          />
        )}

        {/* =========================================================================
            Section 4: ความสดใหม่ของวัตถุดิบ (Smart Health — Donut Chart)
           ========================================================================= */}
        <SmartHealthDonutCard
          totalItems={totalItemsCount}
          freshItems={freshItemsCount}
          expiringSoonItems={expiringSoonCount}
          expiredItems={expiredCount}
          fridgeCount={fridges.length}
        />

        {/* =========================================================================
            Section 5: รายการวัตถุดิบที่ควรนำมาใช้ก่อน (Priority Use-First)
           ========================================================================= */}
        <section className="p-4 sm:p-5 rounded-3xl bg-surface-container-lowest border border-border gap-3 shadow-xs flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
                <AlarmClock className="w-4 h-4" />
              </span>
              <div>
                <h2 className="font-heading font-bold text-sm sm:text-base text-foreground">
                  รายการที่ควรนำมาใช้ก่อน
                </h2>
                <p className="text-[11px] text-muted">
                  วัตถุดิบใกล้หมดอายุและหมดอายุที่ควรจัดการเป็นอันดับแรก
                </p>
              </div>
            </div>
            <Link
              href="/recipes"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🪄 สุ่มเมนู AI</span>
            </Link>
          </div>

          {/* Items List */}
          <div className="mt-2 divide-y divide-border/60">
            {urgentList.length > 0 ? (
              urgentList.slice(0, 5).map((item) => {
                const isExpired = item.daysLeft < 0;
                const isToday = item.daysLeft === 0;
                return (
                  <Link
                    key={item.id}
                    href={item.fridge_id ? `/fridges?selected=${item.fridge_id}` : '/fridges'}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 hover:opacity-90 transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-2xl bg-surface-container flex items-center justify-center text-lg shrink-0">
                        {getAutoEmoji(item.name)}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-heading font-bold text-sm text-foreground truncate group-hover:text-primary-600 transition">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-muted truncate">
                          {isExpired
                            ? 'ควรตรวจสอบ/นำออกจากตู้'
                            : isToday
                            ? 'ควรปรุงรับประทานภายในวันนี้'
                            : `ควรใช้ปรุงอาหารภายใน ${item.daysLeft} วัน`}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 border ${
                        isExpired
                          ? 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                          : isToday
                          ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                          : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                      }`}
                    >
                      {isExpired
                        ? `หมดอายุแล้ว ${Math.abs(item.daysLeft)} วัน`
                        : isToday
                        ? 'หมดอายุวันนี้'
                        : `เหลือ ${item.daysLeft} วัน`}
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-muted">
                🥦 วัตถุดิบทั้งหมดยังสดใหม่ ไม่มีรายการที่ต้องรีบใช้
              </div>
            )}
          </div>
        </section>

        {/* =========================================================================
            Section 5: Compartment Cards (ตู้เย็นของคุณ) (Image 1)
           ========================================================================= */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <span>ตู้เย็นของคุณ</span>
              <span className="w-5 h-5 rounded-full bg-surface-container font-bold text-xs flex items-center justify-center text-muted">
                {fridges.length}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAddFridge(true)}
                className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                + เพิ่มตู้เย็น
              </button>
              <Link
                href="/fridges"
                className="text-xs font-bold text-muted hover:text-foreground flex items-center gap-0.5 cursor-pointer"
              >
                <span>จัดการตู้</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {loadingData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : fridges.length === 0 ? (
            <div className="p-8 rounded-3xl border border-dashed border-border bg-surface-container-lowest text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto">
                <Refrigerator className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-bold text-sm text-foreground">
                ยังไม่มีตู้เย็นในครัวเรือนนี้
              </h3>
              <p className="text-xs text-muted max-w-xs mx-auto">
                สร้างตู้เย็นใบแรกของคุณเพื่อเริ่มจัดการอาหาร เตือนวันหมดอายุ และสแกนบิล
              </p>
              <button
                type="button"
                onClick={() => setShowAddFridge(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>สร้างตู้เย็นใหม่</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fridges.map((f) => {
                const itemCount = fridgeItemsCountMap.get(f.id) || 0;
                const expCount = fridgeExpiringMap.get(f.id) || 0;
                const fridgeItems = items.filter((i) => i.fridge_id === f.id && Number(i.quantity) > 0);
                const previewNames = fridgeItems.slice(0, 3).map((i) => i.name);
                const remainingCount = fridgeItems.length - 3;
                const previewText = previewNames.length > 0
                  ? `${previewNames.join(', ')}${remainingCount > 0 ? ` และอีก ${remainingCount} อย่าง` : ''}`
                  : 'ยังไม่มีวัตถุดิบในตู้นี้';

                const isFreezer = f.name.includes('ฟรีซ') || f.name.includes('แช่แข็ง');
                const isBeverage = f.name.includes('เครื่องดื่ม') || f.name.includes('เบียร์') || f.name.includes('หน้าบ้าน');

                return (
                  <div
                    key={f.id}
                    className="p-5 rounded-3xl bg-surface-container-lowest border border-border flex flex-col justify-between gap-4 shadow-xs"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center text-xl shrink-0">
                            {f.icon || (isFreezer ? '❄️' : isBeverage ? '🍺' : '❄️')}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-heading font-bold text-base text-foreground truncate">
                              {f.name}
                            </h3>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-muted px-2.5 py-1 rounded-full bg-surface-container">
                          {itemCount} รายการ
                        </span>
                      </div>

                      <p className="text-xs text-muted truncate mt-1">
                        {previewText}
                      </p>

                      <div className="mt-1">
                        {expCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>มี {expCount} รายการใกล้หมดอายุ</span>
                          </span>
                        ) : itemCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>วัตถุดิบทั้งหมดยังสดใหม่</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                            <span>พร้อมเก็บวัตถุดิบ</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons Row matching Image 1 */}
                    <div className="flex items-center gap-2.5 pt-2 border-t border-border/60">
                      <Link
                        href={`/fridges?selected=${f.id}`}
                        className="flex-1 py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-bold text-foreground transition text-center flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>ดูตู้เย็น</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleOpenAddProduct(f.id)}
                        className="flex-1 py-2 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition text-center flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ เพิ่มของ</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* =========================================================================
            Section 6: Recent Household Activities (Image 1)
           ========================================================================= */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base sm:text-lg font-bold text-foreground">
              กิจกรรมล่าสุดในบ้าน
            </h2>
            <Link
              href="/activities"
              className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>ซิงค์เรียลไทม์</span>
              <span>⚡</span>
            </Link>
          </div>

          <div className="p-4 sm:p-5 rounded-3xl bg-surface-container-lowest border border-border divide-y divide-border/60 shadow-xs">
            {activities.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted">
                ยังไม่มีประวัติกิจกรรมล่าสุดในบ้าน
              </div>
            ) : (
              activities.map((act) => {
                const details = act.details as Record<string, unknown> | null;
                const userName = (details?.user_name as string) || 'สมาชิก';
                const itemName = (details?.item_name as string) || (details?.name as string) || 'สินค้า';
                const unit = (details?.unit as string) || 'ชิ้น';
                const amount = details?.amount !== undefined ? Number(details.amount) : 1;

                let actTitle = '';
                let badgeNode: React.ReactNode = null;
                let iconClass = 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/25';

                if (act.action === 'item_added' || act.action === 'quantity_increased') {
                  actTitle = `เพิ่ม "${itemName}" ${amount} ${unit}`;
                  badgeNode = (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/25">
                      +{amount} {unit}
                    </span>
                  );
                  iconClass = 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25';
                } else if (act.action === 'quantity_decreased') {
                  actTitle = `หยิบ "${itemName}" ออก ${amount} ${unit}`;
                  badgeNode = (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25">
                      -{amount} {unit}
                    </span>
                  );
                  iconClass = 'bg-amber-500/15 text-amber-500 border border-amber-500/25';
                } else if (act.action === 'item_removed') {
                  actTitle = `ลบรายการ "${itemName}" ออกจากตู้`;
                  iconClass = 'bg-rose-500/15 text-rose-500 border border-rose-500/25';
                } else if (act.action === 'member_joined') {
                  actTitle = `${userName} เข้าร่วมครัวเรือน`;
                  iconClass = 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/25';
                } else if (act.action === 'receipt_scanned') {
                  actTitle = `สแกนใบเสร็จเพิ่มวัตถุดิบ`;
                  iconClass = 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25';
                } else if (act.action === 'fridge_created') {
                  actTitle = `สร้างตู้เย็นใหม่`;
                  iconClass = 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/25';
                } else if (act.action === 'item_updated') {
                  actTitle = `อัปเดตข้อมูล "${itemName}"`;
                  iconClass = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25';
                } else {
                  actTitle = `ทำรายการในตู้เย็น`;
                  iconClass = 'bg-surface-container text-muted border border-border';
                }

                return (
                  <div
                    key={act.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-start gap-3"
                  >
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-bold text-xs ${iconClass}`}
                    >
                      {act.action === 'quantity_increased' || act.action === 'item_added'
                        ? '➕'
                        : act.action === 'quantity_decreased'
                        ? '➖'
                        : act.action === 'item_removed'
                        ? '🗑️'
                        : act.action === 'item_updated'
                        ? '🔄'
                        : '🏡'}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-foreground truncate">
                          {userName}
                        </span>
                        <span className="text-[11px] text-muted shrink-0">
                          {new Date(act.created_at).toLocaleTimeString('th-TH', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          น.
                        </span>
                      </div>
                      <p className="text-xs text-foreground mt-0.5">
                        {actTitle}
                      </p>
                      {badgeNode && <div className="mt-1">{badgeNode}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Section 6: Zero-Waste Eco Tip Card */}
        <section className="p-4 sm:p-5 rounded-3xl bg-surface-container-low border border-border/60 flex items-start gap-3">
          <span className="text-2xl shrink-0">🌿</span>
          <div className="space-y-0.5">
            <span className="font-heading font-bold text-xs sm:text-sm text-foreground block">
              เคล็ดลับบ้านประหยัด & รักษ์โลก
            </span>
            <p className="text-xs text-muted leading-relaxed">
              นำผักผลไม้ห่อด้วยกระดาษอเนกประสงค์ก่อนใส่ช่องแช่ผัก ช่วยลดความชื้นสะสมและยืดอายุได้นานขึ้น 2 เท่า!
            </p>
          </div>
        </section>
      </div>

      {/* Add Product Modal */}
      <AddProductModal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        defaultFridgeId={selectedFridgeId}
        onSuccess={fetchDashboardData}
      />

      {/* Add Fridge Modal */}
      <FridgeModal
        isOpen={showAddFridge}
        onClose={() => setShowAddFridge(false)}
      />

      {/* Share Household Modal */}
      <ShareHouseholdModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        household={currentHousehold}
      />

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
    </MainLayout>
  );
}
