'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { SkeletonCard, SkeletonRow } from '@/components/ui/LoadingSkeleton';
import { AddProductModal } from '@/components/inventory/AddProductModal';
import { FridgeModal } from '@/components/fridge/FridgeModal';
import { ShareHouseholdModal } from '@/components/household/ShareHouseholdModal';
import { EditBudgetModal } from '@/components/budget/EditBudgetModal';
import { fetchWeeklyBudgetSummary, type WeeklyBudgetSummary } from '@/lib/budget';
import toast from 'react-hot-toast';
import {
  Refrigerator,
  Package,
  Plus,
  Receipt,
  Sparkles,
  ChevronRight,
  UserPlus,
  AlarmClock,
  Wallet,
  CookingPot,
  ArrowRight,
  Eye,
  CheckCircle,
  Share2,
  Edit2,
} from 'lucide-react';
import type { Item, ActivityLog, Fridge } from '@/types/database';

interface ExpiringItem extends Item {
  daysLeft: number;
  expiry_date: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { currentHousehold, fridges, user, authUser, refreshHouseholds } = useHousehold();

  const [items, setItems] = useState<Item[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
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

        // 2. ดึง Batches ที่ใกล้หมดอายุ (ภายใน 4 วัน หรือหมดอายุแล้ว)
        const itemIds = (itemsData as Item[]).map((i) => i.id);
        const itemMap = new Map((itemsData as Item[]).map((i) => [i.id, i]));

        const { data: batchesData } = await supabase
          .from('item_batches')
          .select('id, item_id, quantity, expiry_date')
          .in('item_id', itemIds)
          .not('expiry_date', 'is', null)
          .order('expiry_date', { ascending: true })
          .limit(15);

        if (batchesData) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const expList: ExpiringItem[] = batchesData
            .filter((b) => Number(b.quantity) > 0)
            .map((b) => {
              const it = itemMap.get(b.item_id);
              const exp = new Date(b.expiry_date);
              exp.setHours(0, 0, 0, 0);
              const diffTime = exp.getTime() - today.getTime();
              const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return {
                ...it!,
                quantity: Number(b.quantity),
                expiry_date: b.expiry_date,
                daysLeft,
              };
            });

          setExpiringItems(expList);
        }
      } else {
        setItems([]);
        setExpiringItems([]);
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
  const totalItemsCount = items.reduce((acc, curr) => acc + (Number(curr.quantity) > 0 ? 1 : 0), 0);
  const urgentExpiring = expiringItems.filter((i) => i.daysLeft <= 2);
  const warningExpiring = expiringItems.filter((i) => i.daysLeft > 2 && i.daysLeft <= 4);
  const rawCode = currentHousehold?.id || '';
  const householdCode = rawCode.startsWith('#TY-') ? rawCode : `#TY-${rawCode.slice(0, 6).toUpperCase()}`;

  // คำนวณจำนวนไอเทมในแต่ละตู้เย็น
  const fridgeItemsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.fridge_id && Number(item.quantity) > 0) {
        map.set(item.fridge_id, (map.get(item.fridge_id) || 0) + 1);
      }
    }
    return map;
  }, [items]);

  // คำนวณของใกล้หมดอายุในแต่ละตู้
  const fridgeExpiringMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of expiringItems) {
      if (exp.fridge_id && exp.daysLeft <= 3) {
        map.set(exp.fridge_id, (map.get(exp.fridge_id) || 0) + 1);
      }
    }
    return map;
  }, [expiringItems]);

  function handleOpenAddProduct(fridgeId?: string) {
    setSelectedFridgeId(fridgeId);
    setShowAddProduct(true);
  }

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-10 gap-6 animate-in fade-in duration-300">
        {/* Section 1: Personalized Warm Greeting & Household Banner */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight flex items-center gap-2">
                <span>สวัสดีคุณ{displayName}</span>
                <span className="text-secondary-600">🌿</span>
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
                {totalItemsCount > 0
                  ? `วันนี้วัตถุดิบในบ้านพร้อมทำอาหาร ${Math.min(95, 70 + totalItemsCount * 3)}%`
                  : 'เริ่มต้นเพิ่มตู้เย็นและบันทึกวัตถุดิบในบ้านของคุณได้เลย'}
              </p>
            </div>

            {/* Quick Invite Button */}
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary-100 hover:bg-primary-500 text-primary-800 hover:text-white transition-all duration-200 shadow-xs shrink-0 active:scale-95 text-xs font-bold"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden xs:inline">แชร์รหัสบ้าน</span>
            </button>
          </div>

          {/* Active Household Context Chip + Share Pin */}
          {currentHousehold && (
            <div className="flex items-center justify-between bg-surface-container-low px-3.5 py-2.5 rounded-2xl border border-border/60">
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 text-on-surface hover:text-primary-600 transition text-left"
                title="คลิกเพื่อดูและแชร์รหัสบ้าน"
              >
                <span className="material-symbols-outlined text-[20px] text-primary-600">cottage</span>
                <span className="font-heading font-bold text-sm truncate max-w-[150px] sm:max-w-xs">
                  {currentHousehold.name}
                </span>
                <span className="text-[11px] font-semibold text-primary-600 underline ml-1">
                  (กดเพื่อแชร์รหัส)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-1.5 bg-surface-container-lowest px-3 py-1 rounded-full shadow-xs text-on-surface-variant border border-border/80 hover:border-primary-500 transition active:scale-95"
                title="คลิกเพื่อแชร์รหัสบ้าน"
              >
                <span className="text-[11px] font-semibold text-muted">รหัสบ้าน:</span>
                <span className="text-xs font-extrabold text-primary-600 tracking-wider">
                  {householdCode}
                </span>
              </button>
            </div>
          )}
        </section>

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

        {/* Section 3: Summary Metric Bento Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: Refrigerator Count (Dynamic count as requested) */}
          <Link
            href="/fridges"
            className="flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-surface-container-lowest shadow-sm border border-border hover:border-primary-400 transition"
          >
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-700">
                <Refrigerator className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant text-[11px] font-bold">
                {fridges.length} ตู้แอคทีฟ
              </span>
            </div>
            <div className="mt-4">
              <span className="font-heading text-2xl font-extrabold text-on-surface tracking-tight block">
                {fridges.length} ตู้เย็น
              </span>
              <span className="text-xs text-on-surface-variant truncate block mt-0.5">
                {fridges.length > 0
                  ? fridges.map((f) => f.name).join(' • ')
                  : 'ยังไม่มีตู้เย็น'}
              </span>
            </div>
          </Link>

          {/* Card 2: Expiring Soon Alert */}
          <Link
            href="/expirations"
            className="flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-surface-container-lowest shadow-sm border border-border relative overflow-hidden group hover:border-tertiary-300 transition"
          >
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-2xl bg-tertiary-100 flex items-center justify-center text-tertiary-600">
                <AlarmClock className="w-5 h-5" />
              </span>
              {expiringItems.length > 0 && (
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tertiary-500" />
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading text-2xl font-extrabold text-tertiary-600 tracking-tight">
                  {expiringItems.length}
                </span>
                <span className="text-xs font-bold text-on-surface">รายการใกล้หมด</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-tertiary-100 text-tertiary-800">
                  🔴 1-2 วัน ({urgentExpiring.length})
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                  🟡 3-4 วัน ({warningExpiring.length})
                </span>
              </div>
            </div>
          </Link>

          {/* Card 3: Weekly Grocery Budget Tracker (100% REAL DATA, NO FAKE!) */}
          <div
            onClick={() => setShowEditBudgetModal(true)}
            className="flex flex-col p-4 sm:p-5 rounded-3xl bg-surface-container-lowest shadow-sm border border-border gap-2 cursor-pointer hover:border-primary-400 transition group"
            title="คลิกเพื่อตั้งค่าหรือแก้ไขงบประมาณ"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-700">
                  <Wallet className="w-5 h-5" />
                </span>
                <span className="font-heading font-bold text-xs text-on-surface flex items-center gap-1">
                  <span>งบอาหารสัปดาห์นี้</span>
                  <Edit2 className="w-3 h-3 text-muted group-hover:text-primary-600 transition" />
                </span>
              </div>
              <span className="text-[11px] font-bold text-primary-600 dark:text-primary-300 bg-primary-500/15 border border-primary-500/25 px-2 py-0.5 rounded-full">
                เหลือ ฿{budgetSummary.remaining.toLocaleString()}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <div className="flex items-baseline gap-1">
                <span className="font-heading text-xl font-extrabold text-on-surface">
                  ฿{budgetSummary.totalSpent.toLocaleString()}
                </span>
                <span className="text-xs text-on-surface-variant">
                  / ฿{budgetSummary.budget.toLocaleString()}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant font-medium">
                {budgetSummary.percentUsed}% ที่ใช้ไป
              </span>
            </div>
            {/* Segmented Bar */}
            <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden mt-1">
              <div
                className="bg-primary-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, budgetSummary.percentUsed)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Section 4: Quick Access Compartment Cards (ตู้เย็นของคุณ) */}
        <section className="flex flex-col gap-3">
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
              {fridges.map((f, index) => {
                const itemCount = fridgeItemsCountMap.get(f.id) || 0;
                const expCount = fridgeExpiringMap.get(f.id) || 0;
                const tempText = index === 0 ? '3°C' : '5°C';

                return (
                  <div
                    key={f.id}
                    className="flex flex-col p-4 rounded-3xl bg-surface-container-lowest shadow-sm border border-border gap-3.5 hover:shadow-md transition"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-surface-container-low flex items-center justify-center border border-border text-2xl shadow-inner">
                        <span>{f.icon || '❄️'}</span>
                        <span className="absolute bottom-1 right-1 bg-stone-900/80 text-white px-1 py-0.2 rounded text-[9px] font-bold">
                          {tempText}
                        </span>
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
                          {index === 0
                            ? 'Kitchen Zone • ผักสด, เนื้อสัตว์, ซอส'
                            : 'Living Zone • เครื่องดื่ม, ช็อกโกแลต, ขนม'}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {expCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-tertiary-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-tertiary-500 animate-pulse" />
                              <span>{expCount} ชิ้นควรทานก่อน</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-secondary-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary-500" />
                              <span>ทั้งหมดคงความสด</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                      <Link
                        href={`/fridges`}
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
        </section>

        {/* Section 5: Recent Household Activity Feed (Keep as-is: "อันนี้ดีแล้ว") */}
        <section className="flex flex-col gap-3">
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
