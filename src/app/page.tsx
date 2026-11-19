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
import { fetchWeeklyBudgetSummary, type WeeklyBudgetSummary } from '@/lib/budget';
import {
  getDaysUntilExpiry,
  normalizeDateString,
  formatThaiDate,
  formatBangkokTodayThai,
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
  Calendar,
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
  const { currentHousehold, fridges, user, authUser, refreshHouseholds } = useHousehold();

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
  });

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
            } else if (daysLeft <= 5) {
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

  const displayName = user?.display_name || authUser?.email?.split('@')[0] || 'คุณ';
  const todayThaiDisplay = formatBangkokTodayThai();
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

  function handleCopyHouseholdCode(e: React.MouseEvent) {
    e.stopPropagation();
    if (!householdCode) return;
    navigator.clipboard.writeText(householdCode);
    setCopiedCode(true);
    toast.success(`คัดลอกรหัสบ้าน ${householdCode} แล้ว!`);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function handleOpenAddProduct(fridgeId?: string) {
    setSelectedFridgeId(fridgeId);
    setShowAddProduct(true);
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-10 gap-6 animate-in fade-in duration-300">
        {/* Section 1: Personalized Warm Greeting & Header matching UI.pdf Page 1 */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted mb-0.5">
                <Calendar className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                <span>{todayThaiDisplay}</span>
              </div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
                <span>แดชบอร์ด</span>
                <span className="text-sm font-normal text-muted">สวัสดีคุณ{displayName} 🌿</span>
              </h1>
            </div>

            {/* Quick Share / House Pill Button matching UI.pdf Top Button */}
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary-600 hover:bg-primary-700 text-white transition-all duration-200 shadow-sm shrink-0 active:scale-95 text-xs font-bold"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>แชร์รหัสบ้าน</span>
            </button>
          </div>

          {/* Active Household Context Chip + Share Pin */}
          {currentHousehold && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-surface-container-low px-4 py-2.5 rounded-2xl border border-border shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-2 text-foreground hover:text-primary-600 transition text-left min-w-0"
                  title="คลิกเพื่อดูและแชร์รหัสบ้าน"
                >
                  <span className="material-symbols-outlined text-[20px] text-primary-600 shrink-0">cottage</span>
                  <span className="font-heading font-bold text-sm truncate max-w-[140px] sm:max-w-xs">
                    {currentHousehold.name}
                  </span>
                </button>
                <Link
                  href="/household"
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-surface-container text-[11px] font-medium text-muted hover:text-foreground transition shrink-0"
                  title="จัดการสมาชิกในบ้าน"
                >
                  <Users className="w-3 h-3" />
                  <span>{memberCount} คน</span>
                </Link>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-1.5 bg-stone-50 dark:bg-surface-container-lowest px-3 py-1 rounded-full text-on-surface-variant border border-border hover:border-primary-500 transition active:scale-95"
                  title="คลิกเพื่อดูและแชร์รหัสบ้าน"
                >
                  <span className="text-[11px] font-semibold text-muted">รหัสบ้าน:</span>
                  <span className="text-xs font-bold text-primary-600 tracking-wider">
                    {householdCode}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyHouseholdCode}
                  className="w-7 h-7 rounded-full bg-stone-50 dark:bg-surface-container-lowest border border-border hover:border-primary-500 flex items-center justify-center text-muted hover:text-primary-600 transition active:scale-95"
                  title="คัดลอกรหัสบ้าน"
                >
                  {copiedCode ? (
                    <Check className="w-3.5 h-3.5 text-secondary-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Circular Summary Card matching UI.pdf Page 1 */}
        <section className="p-6 rounded-[28px] bg-white dark:bg-surface-container-lowest border border-border shadow-xs flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading font-bold text-base sm:text-lg text-foreground">
                ความสดใหม่ของวัตถุดิบ (Smart Health)
              </h2>
              <p className="text-xs text-muted">
                ภาพรวมความสดใหม่และวันหมดอายุของวัตถุดิบทั้งหมดในบ้าน
              </p>
            </div>
            <Link
              href="/expirations"
              className="p-1.5 rounded-full hover:bg-stone-100 dark:hover:bg-surface-container text-muted hover:text-foreground transition"
              title="ดูวันหมดอายุทั้งหมด"
            >
              <span className="material-symbols-outlined text-[20px]">more_horiz</span>
            </Link>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 py-2">
            {/* Circular Ring SVG Donut Chart matching UI.pdf */}
            <div className="relative w-40 h-40 sm:w-48 sm:h-48 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring Track */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="stroke-stone-100 dark:stroke-stone-800"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Fresh Arc (Emerald) */}
                {totalItemsCount > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="stroke-emerald-500 transition-all duration-700"
                    strokeWidth="8"
                    strokeDasharray={`${(freshItemsCount / totalItemsCount) * 251.3} 251.3`}
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    fill="transparent"
                  />
                )}
                {/* Expiring Arc (Amber) */}
                {totalItemsCount > 0 && expiringSoonCount > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="stroke-amber-500 transition-all duration-700"
                    strokeWidth="8"
                    strokeDasharray={`${(expiringSoonCount / totalItemsCount) * 251.3} 251.3`}
                    strokeDashoffset={`${-((freshItemsCount / totalItemsCount) * 251.3)}`}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                )}
                {/* Expired Arc (Red) */}
                {totalItemsCount > 0 && expiredCount > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="stroke-rose-500 transition-all duration-700"
                    strokeWidth="8"
                    strokeDasharray={`${(expiredCount / totalItemsCount) * 251.3} 251.3`}
                    strokeDashoffset={`${-(((freshItemsCount + expiringSoonCount) / totalItemsCount) * 251.3)}`}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <span className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
                  {totalItemsCount > 0 ? `${Math.round((freshItemsCount / totalItemsCount) * 100)}%` : '0'}
                </span>
                <span className="text-[11px] font-semibold text-muted leading-tight mt-0.5">
                  ยังสดใหม่พร้อมปรุง
                </span>
              </div>
            </div>

            {/* Breakdown Column matching UI.pdf Right Column */}
            <div className="grid grid-cols-2 gap-2.5 w-full flex-1 min-w-[200px]">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 dark:bg-surface-container-low border border-border/70">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <span className="w-6 h-6 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center text-xs">🎯</span>
                  <span>ทั้งหมด</span>
                </div>
                <span className="font-heading text-base font-bold text-foreground">{totalItemsCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50/70 dark:bg-surface-container-low border border-emerald-100/70">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">🥦</span>
                  <span>ยังสดใหม่</span>
                </div>
                <span className="font-heading text-base font-bold text-emerald-700 dark:text-emerald-300">{freshItemsCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/70 dark:bg-surface-container-low border border-amber-100/70">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-xs">⏳</span>
                  <span>ใกล้หมด</span>
                </div>
                <span className="font-heading text-base font-bold text-amber-700 dark:text-amber-300">{expiringSoonCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-rose-50/70 dark:bg-surface-container-low border border-rose-100/70">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
                  <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center text-xs">⚠️</span>
                  <span>หมดอายุ</span>
                </div>
                <span className="font-heading text-base font-bold text-rose-700 dark:text-rose-300">{expiredCount}</span>
              </div>
            </div>
          </div>

          {/* Sub-card Row matching UI.pdf collapsible status */}
          <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <Refrigerator className="w-4 h-4 text-primary-600" />
              <span>ข้อมูลสุขภาพวัตถุดิบในบ้าน (ใน {fridges.length} ตู้เย็น)</span>
            </span>
            <Link href="/fridges" className="text-primary-600 font-semibold hover:underline flex items-center gap-0.5">
              <span>ดูตู้เย็น</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* Section 2.5: Mascot AI Recommendation Banner matching UI.pdf Page 1 */}
        {dailyRecipeTeaser && (
          <section className="p-5 rounded-[28px] bg-gradient-to-r from-orange-100/80 via-amber-50/80 to-orange-50/80 border border-orange-200/60 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 text-center sm:text-left">
              <div className="w-12 h-12 rounded-2xl bg-white text-2xl flex items-center justify-center shrink-0 shadow-xs">
                🥕
              </div>
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-800 px-2 py-0.5 rounded-full bg-orange-200/50 mb-0.5">
                  🍲 เมนู AI ประจำมื้อนี้
                </span>
                <h3 className="font-heading font-bold text-base text-foreground">
                  {dailyRecipeTeaser.dishTitle}
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  ใช้วัตถุดิบสดพร้อมปรุงในตู้ของคุณ ปลอดภัย คัดกรองของหมดอายุออก 100%
                </p>
              </div>
            </div>

            <Link
              href={`/recipes?ingredient=${encodeURIComponent(dailyRecipeTeaser.leadName)}&fridgeId=${encodeURIComponent(dailyRecipeTeaser.fridgeId)}`}
              className="px-4 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>สุ่มเมนูนี้ใน AI Recipe →</span>
            </Link>
          </section>
        )}

        {/* Section 2: Quick Action Highlights (Pill Triggers) */}
        <section className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => handleOpenAddProduct()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-sm hover:opacity-95 active:scale-95 transition-all shrink-0 text-xs sm:text-sm font-bold"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="whitespace-nowrap">เพิ่มวัตถุดิบ</span>
          </button>

          <Link
            href="/receipts"
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-lowest text-on-surface border border-border shadow-xs hover:bg-surface-container-low active:scale-95 transition-all shrink-0 text-xs sm:text-sm font-bold"
          >
            <Receipt className="w-4 h-4 text-primary-600" />
            <span className="whitespace-nowrap">🧾 สแกนบิล OCR</span>
          </Link>

          <Link
            href="/recipes"
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary-fixed text-on-secondary-fixed shadow-xs hover:bg-secondary-200 active:scale-95 transition-all shrink-0 text-xs sm:text-sm font-bold"
          >
            <Sparkles className="w-4 h-4 text-secondary-700" />
            <span className="whitespace-nowrap">🍲 สุ่มเมนู AI</span>
          </Link>
        </section>

        {/* Section 3: Master Responsive Split Grid (12-Col Desktop / 1-Col Mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* Main Inventory & Operations Area (7-8 Cols on Desktop) */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-5 sm:gap-6 min-w-0">
            {/* 4 Summary KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* KPI 1: Fridges & Total Items */}
              <Link
                href="/fridges"
                className="flex flex-col justify-between p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border hover:border-primary-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-2xl bg-primary-100 dark:bg-primary-950/60 flex items-center justify-center text-primary-700 dark:text-primary-300">
                    <Package className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-bold text-muted">
                    {fridges.length} ตู้เย็น
                  </span>
                </div>
                <div className="mt-3">
                  <span className="font-heading text-2xl font-bold text-foreground block">
                    {totalItemsCount}
                  </span>
                  <span className="text-xs text-muted">วัตถุดิบทั้งหมด</span>
                </div>
              </Link>

              {/* KPI 2: Fresh Items */}
              <Link
                href="/fridges"
                className="flex flex-col justify-between p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border hover:border-secondary-500/50 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-2xl bg-secondary-100 dark:bg-secondary-950/60 flex items-center justify-center text-secondary-700 dark:text-secondary-300">
                    <Leaf className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-bold text-secondary-600">สดใหม่</span>
                </div>
                <div className="mt-3">
                  <span className="font-heading text-2xl font-bold text-secondary-600 block">
                    {freshItemsCount}
                  </span>
                  <span className="text-xs text-muted">ยังสดใหม่</span>
                </div>
              </Link>

              {/* KPI 3: Expiring Soon (0-5 days) */}
              <Link
                href="/expirations"
                className="flex flex-col justify-between p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border hover:border-amber-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-600">
                    <AlarmClock className="w-4 h-4" />
                  </span>
                  {expiringSoonCount > 0 && (
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </div>
                <div className="mt-3">
                  <span className="font-heading text-2xl font-bold text-amber-600 block">
                    {expiringSoonCount}
                  </span>
                  <span className="text-xs text-muted">ใกล้หมดอายุ (0-5 วัน)</span>
                </div>
              </Link>

              {/* KPI 4: Expired (< 0 days) */}
              <Link
                href="/expirations"
                className="flex flex-col justify-between p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border hover:border-tertiary-400 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-2xl bg-tertiary-100 dark:bg-tertiary-950/60 flex items-center justify-center text-tertiary-600">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  {expiredCount > 0 && (
                    <span className="w-2.5 h-2.5 rounded-full bg-tertiary-500 animate-ping" />
                  )}
                </div>
                <div className="mt-3">
                  <span className="font-heading text-2xl font-bold text-tertiary-600 block">
                    {expiredCount}
                  </span>
                  <span className="text-xs text-muted">หมดอายุแล้ว</span>
                </div>
              </Link>
            </div>

            {/* Priority Use-First Alert Card */}
            <div className="flex flex-col p-4 sm:p-5 rounded-3xl bg-surface-container-lowest shadow-sm border border-border gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
                    <AlarmClock className="w-4 h-4" />
                  </span>
                  <div>
                    <h2 className="font-heading font-bold text-sm sm:text-base text-foreground">
                      รายการที่ควรนำมาใช้ก่อน
                    </h2>
                    <p className="text-[11px] text-muted">
                      กดรายการเพื่อเปิดดูในตู้เย็น หรือส่งไปให้ AI แนะนำเมนู
                    </p>
                  </div>
                </div>
                <Link
                  href="/recipes"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-500/10 hover:bg-primary-500/20 text-primary-600 dark:text-primary-400 text-xs font-bold transition shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>สุ่มเมนู AI</span>
                </Link>
              </div>

              {expiringItems.length === 0 && expiredItems.length === 0 ? (
                <div className="p-4 rounded-2xl bg-surface-container-low/70 border border-border/60 text-xs text-muted flex items-center gap-2">
                  <span>🌱</span>
                  <span>ไม่มีวัตถุดิบที่ใกล้หมดอายุหรือหมดอายุในขณะนี้ ของในตู้สดใหม่ดีเยี่ยม!</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {expiringItems.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href={item.fridge_id ? `/fridges/${item.fridge_id}` : '/fridges'}
                      className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-surface-container-low hover:bg-surface-container border border-border/60 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl shrink-0">
                          {item.image_url && !item.image_url.startsWith('http') && !item.image_url.startsWith('data:')
                            ? item.image_url
                            : getAutoEmoji(item.name)}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-foreground block truncate">
                            {item.name}
                          </span>
                          <span className="text-[11px] text-muted block truncate">
                            {fridgeNameMap.get(item.fridge_id) || 'ตู้เย็น'} • {formatThaiDate(item.expiry_date)}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.daysLeft === 0
                            ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {formatExpiryShortBadge(item.daysLeft)}
                      </span>
                    </Link>
                  ))}
                  {expiredItems.slice(0, 2).map((item) => (
                    <Link
                      key={`exp-${item.id}`}
                      href={item.fridge_id ? `/fridges/${item.fridge_id}` : '/expirations'}
                      className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-tertiary-500/10 hover:bg-tertiary-500/15 border border-tertiary-500/25 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl shrink-0">
                          {item.image_url && !item.image_url.startsWith('http') && !item.image_url.startsWith('data:')
                            ? item.image_url
                            : getAutoEmoji(item.name)}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-foreground block truncate">
                            {item.name}
                          </span>
                          <span className="text-[11px] text-tertiary-600 dark:text-tertiary-300 block truncate">
                            ควรตรวจสอบ/นำออกจากตู้
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-tertiary-600 text-white">
                        {formatExpiryShortBadge(item.daysLeft)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* My Fridges Compartment Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-base sm:text-lg font-bold text-on-surface flex items-center gap-2">
                  <span>ตู้เย็นของคุณ</span>
                  <span className="w-5 h-5 rounded-full bg-surface-container-high font-bold text-xs flex items-center justify-center text-on-surface-variant">
                    {fridges.length}
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddFridge(true)}
                    className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1"
                  >
                    + เพิ่มตู้เย็น
                  </button>
                  <Link
                    href="/fridges"
                    className="text-xs font-bold text-muted hover:text-foreground flex items-center gap-0.5 ml-2"
                  >
                    <span>จัดการตู้</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {loadingData ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-bold shadow-xs active:scale-95 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>สร้างตู้เย็นใหม่</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {fridges.map((f) => {
                    const itemCount = fridgeItemsCountMap.get(f.id) || 0;
                    const expCount = fridgeExpiringMap.get(f.id) || 0;
                    const previewNames = fridgePreviewItemsMap.get(f.id) || [];

                    return (
                      <div
                        key={f.id}
                        className="flex flex-col p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border gap-3.5 hover:shadow-md transition"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-surface-container-low flex items-center justify-center border border-border text-2xl shadow-inner">
                            <span>{f.icon || '❄️'}</span>
                          </div>

                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <h3 className="font-heading font-bold text-sm text-on-surface truncate">
                                {f.name}
                              </h3>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 shrink-0">
                                {itemCount} รายการ
                              </span>
                            </div>
                            <p className="text-xs text-on-surface-variant truncate mt-0.5">
                              {previewNames.length > 0
                                ? `${previewNames.join(', ')}${itemCount > previewNames.length ? ` และอีก ${itemCount - previewNames.length} อย่าง` : ''}`
                                : 'ยังไม่มีวัตถุดิบในตู้นี้'}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {expCount > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-tertiary-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary-500 animate-pulse" />
                                  <span>{expCount} รายการใกล้หมดอายุ</span>
                                </span>
                              ) : itemCount > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-secondary-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-secondary-500" />
                                  <span>วัตถุดิบทั้งหมดยังสดใหม่</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
                                  <span>พร้อมเพิ่มวัตถุดิบ</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                          <Link
                            href={`/fridges/${f.id}`}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-bold transition active:scale-98"
                          >
                            <Eye className="w-3.5 h-3.5 text-primary-600" />
                            <span>ดูสต็อก</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleOpenAddProduct(f.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-xs active:scale-98 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>เพิ่มของ</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Activities Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-base sm:text-lg font-bold text-on-surface">
                  กิจกรรมล่าสุดในบ้าน
                </h2>
                <Link
                  href="/activities"
                  className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1"
                >
                  <span>ซิงค์เรียลไทม์ ⚡</span>
                </Link>
              </div>

              <div className="flex flex-col p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border divide-y divide-border/60">
                {activities.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted">
                    ยังไม่มีประวัติกิจกรรมล่าสุด
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
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-500/15 text-secondary-700 dark:text-secondary-300 border border-secondary-500/25">
                          +{amount} {unit}
                        </span>
                      );
                      iconClass = 'bg-secondary-500/15 text-secondary-600 dark:text-secondary-400 border border-secondary-500/25';
                    } else if (act.action === 'quantity_decreased') {
                      actTitle = `หยิบ "${itemName}" ออก ${amount} ${unit}`;
                      badgeNode = (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                          -{amount} {unit}
                        </span>
                      );
                      iconClass = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25';
                    } else if (act.action === 'item_removed') {
                      actTitle = `ลบรายการ "${itemName}" ออกจากตู้`;
                      iconClass = 'bg-tertiary-500/15 text-tertiary-600 dark:text-tertiary-400 border border-tertiary-500/25';
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
                      iconClass = 'bg-surface-container text-on-surface-variant border border-border';
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
                            : '🏡'}
                        </div>

                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-on-surface truncate">
                              {userName}
                            </span>
                            <span className="text-[11px] text-on-surface-variant shrink-0">
                              {new Date(act.created_at).toLocaleTimeString('th-TH', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              น.
                            </span>
                          </div>
                          <p className="text-xs text-on-surface mt-0.5">
                            {actTitle}
                          </p>
                          {badgeNode && <div className="mt-1">{badgeNode}</div>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar Widgets Area (4-5 Cols on Desktop) */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5 sm:gap-6 min-w-0">
            {/* Weekly Grocery Budget Tracker (100% REAL DATA) */}
            <div
              onClick={() => setShowEditBudgetModal(true)}
              className="flex flex-col p-5 rounded-3xl bg-surface-container-lowest shadow-sm border border-border gap-3.5 cursor-pointer hover:border-primary-400 transition group"
              title="คลิกเพื่อตั้งค่าหรือแก้ไขงบประมาณ"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </span>
                  <span className="font-heading font-bold text-sm text-foreground flex items-center gap-1.5">
                    <span>งบอาหารสัปดาห์นี้</span>
                    <Edit2 className="w-3.5 h-3.5 text-muted group-hover:text-primary-600 transition" />
                  </span>
                </div>
                <span className="text-[11px] font-bold text-primary-600 dark:text-primary-300 bg-primary-500/15 border border-primary-500/25 px-2.5 py-1 rounded-full">
                  เหลือ ฿{budgetSummary.remaining.toLocaleString()}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading text-2xl font-bold text-foreground">
                    ฿{budgetSummary.totalSpent.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted">
                    / ฿{budgetSummary.budget.toLocaleString()}
                  </span>
                </div>
                <span className="text-xs text-muted font-medium">
                  {budgetSummary.percentUsed}% ที่ใช้ไป
                </span>
              </div>

              <div className="w-full bg-surface-container rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary-500 to-primary-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, budgetSummary.percentUsed)}%` }}
                />
              </div>

              {/* Breakdown chips */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50 text-[11px]">
                <div className="p-2.5 rounded-2xl bg-surface-container-low flex flex-col">
                  <span className="text-muted">🛒 ซูเปอร์มาร์เก็ต</span>
                  <span className="font-bold text-foreground mt-0.5">
                    ฿{budgetSummary.supermarketSpent.toLocaleString()}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-surface-container-low flex flex-col">
                  <span className="text-muted">🛵 สั่งเดลิเวอรี</span>
                  <span className="font-bold text-foreground mt-0.5">
                    ฿{budgetSummary.deliverySpent.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Recipe Daily Inspiration Teaser */}
            <div className="flex flex-col p-5 rounded-3xl bg-gradient-to-br from-surface-container-lowest via-surface-container-low to-surface-container-lowest shadow-sm border border-border/80 gap-3.5 hover:border-secondary-500/40 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl bg-secondary-100 dark:bg-secondary-950/60 text-secondary-700 dark:text-secondary-300 flex items-center justify-center">
                    <CookingPot className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-heading font-bold text-sm text-foreground">
                      ไอเดียเมนูจากของในตู้
                    </h3>
                    <span className="text-[11px] text-muted">ปลอดภัย คัดกรองของหมดอายุออก</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary-500/15 text-secondary-600 border border-secondary-500/25">
                  AI กู้ชีพ
                </span>
              </div>

              {dailyRecipeTeaser ? (
                <div className="p-3.5 rounded-2xl bg-surface-container/60 border border-border/70 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🍲</span>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-foreground block truncate">
                        {dailyRecipeTeaser.dishTitle}
                      </span>
                      <span className="text-[11px] text-muted block truncate">
                        ใช้วัตถุดิบสดพร้อมปรุงในตู้ของคุณ
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {dailyRecipeTeaser.names.map((n) => (
                      <span
                        key={n}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-container-lowest text-muted border border-border"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/recipes?ingredient=${encodeURIComponent(dailyRecipeTeaser.leadName)}&fridgeId=${encodeURIComponent(dailyRecipeTeaser.fridgeId)}`}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>สุ่มเมนูนี้ใน AI Recipe</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </Link>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-surface-container-low text-center text-xs text-muted">
                  เพิ่มวัตถุดิบลงตู้เย็นเพื่อรับคำแนะนำเมนูประจำวันจาก AI
                </div>
              )}
            </div>

            {/* Household Members & Quick Sharing */}
            <div className="flex flex-col p-5 rounded-3xl bg-surface-container-lowest shadow-sm border border-border gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-heading font-bold text-sm text-foreground">
                      สมาชิกในครัวเรือน
                    </h3>
                    <span className="text-[11px] text-muted">
                      {memberCount} คนร่วมจัดการตู้เย็น
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1"
                >
                  <Share2 className="w-3 h-3" />
                  <span>เชิญ</span>
                </button>
              </div>

              {/* Code Chip */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-container-low border border-border/70">
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-muted">รหัสบ้านสำหรับคนในครอบครัว</span>
                  <span className="text-xs font-bold text-primary-600 tracking-wider">
                    {householdCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHouseholdCode}
                  className="px-2.5 py-1 rounded-xl bg-surface-container-lowest border border-border text-xs font-bold text-foreground hover:text-primary-600 transition flex items-center gap-1 active:scale-95 shadow-xs"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-secondary-600" />
                      <span>คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>คัดลอก</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Zero-Waste Eco Tip Card */}
            <div className="p-4 rounded-3xl bg-surface-container-low border border-border/60 flex items-start gap-3">
              <span className="text-2xl shrink-0">🌿</span>
              <div className="space-y-0.5">
                <span className="font-heading font-bold text-xs text-foreground block">
                  เคล็ดลับบ้านประหยัด & รักษ์โลก
                </span>
                <p className="text-[11px] text-muted leading-relaxed">
                  นำผักผลไม้ห่อด้วยกระดาษอเนกประสงค์ก่อนใส่ช่องแช่ผัก ช่วยลดความชื้นสะสมและยืดอายุได้นานขึ้น 2 เท่า!
                </p>
              </div>
            </div>
          </div>
        </div>
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
