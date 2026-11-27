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
  formatExpiryShortBadge,
} from '@/lib/date';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';
import toast from 'react-hot-toast';
import {
  Refrigerator,
  Plus,
  Sparkles,
  ChevronRight,
  Eye,
  Share2,
  Copy,
  Check,
  Users,
  Edit2,
} from 'lucide-react';
import type { Item, ActivityLog } from '@/types/database';

interface ExpiringItem extends Item {
  daysLeft: number;
  expiry_date: string;
}

export default function DashboardPage() {
  const supabase = createClient();
  const { currentHousehold, fridges, user, authUser, refreshHouseholds, canAddItems, canEditItems } = useHousehold();

  const [items, setItems] = useState<Item[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [expiredItems, setExpiredItems] = useState<ExpiringItem[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [memberCount, setMemberCount] = useState<number>(1);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [consumingItemId, setConsumingItemId] = useState<string | null>(null);

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

  const totalItemsCount = items.reduce((acc, curr) => acc + (Number(curr.quantity) > 0 ? 1 : 0), 0);
  const urgentConsumeCount = expiredItems.length + expiringItems.filter((i) => i.daysLeft <= 2).length;
  const soon3To5Count = expiringItems.filter((i) => i.daysLeft >= 3 && i.daysLeft <= 5).length;
  const freshItemsCount = Math.max(0, totalItemsCount - urgentConsumeCount - soon3To5Count);
  const freshnessPercent = totalItemsCount > 0 ? Math.round((freshItemsCount / totalItemsCount) * 100) : 100;
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

  async function handleQuickConsume(item: ExpiringItem) {
    if (!canEditItems) {
      toast.error('คุณไม่มีสิทธิ์แก้ไขวัตถุดิบ (สิทธิ์ดูข้อมูลอย่างเดียว กรุณาติดต่อเจ้าของบ้าน)');
      return;
    }
    if (!authUser?.id || consumingItemId) return;

    const prevQty = Number(item.quantity);
    if (prevQty <= 0) return;
    const targetQty = prevQty - 1;

    setConsumingItemId(item.id);
    try {
      const { error: rpcError } = await supabase.rpc('update_item_quantity', {
        p_item_id: item.id,
        p_change: -1,
        p_user_id: authUser.id,
      });

      if (rpcError) {
        const { error: directErr } = await supabase
          .from('items')
          .update({
            quantity: targetQty,
            status: targetQty === 0 ? 'out_of_stock' : targetQty <= 1 ? 'low_stock' : 'in_stock',
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        if (directErr) throw directErr;
      }

      const actorName = user?.display_name || authUser.email?.split('@')[0] || 'สมาชิก';
      await supabase.from('activity_logs').insert({
        household_id: currentHousehold?.id || null,
        fridge_id: item.fridge_id || null,
        item_id: item.id,
        user_id: authUser.id,
        action: 'quantity_decreased',
        details: {
          user_name: actorName,
          item_name: item.name,
          amount: 1,
          change: -1,
          previous_quantity: prevQty,
          new_quantity: targetQty,
          unit: item.unit || 'ชิ้น',
        },
      });

      toast.success(
        targetQty === 0
          ? `ใช้ "${item.name}" หมดแล้ว (ย้ายไปรายการต้องซื้อเติม)`
          : `หยิบ "${item.name}" ออก 1 ${item.unit} (เหลือ ${targetQty} ${item.unit})`,
        { icon: '👋' }
      );
      await fetchDashboardData();
    } catch (err) {
      console.error('Quick consume error:', err);
      toast.error('ไม่สามารถตัดสต็อกได้ กรุณาลองใหม่');
    } finally {
      setConsumingItemId(null);
    }
  }

  const budgetPercentDisplay = Math.min(100, Math.max(0, budgetSummary.percentUsed));

  return (
    <MainLayout>
      <div className="flex flex-col w-full pb-10 gap-5 sm:gap-6 animate-in fade-in duration-300">
        {/* 1. Warm Orange Hero Overview Banner (PDF Page 1) */}
        <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-primary-600 via-primary-500 to-amber-500 text-white p-5 sm:p-7 shadow-[var(--shadow-md)]">
          {/* Subtle decorative blobs */}
          <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-14 -left-10 w-44 h-44 rounded-full bg-amber-300/20 blur-2xl" />

          <div className="relative z-10 flex flex-col gap-5">
            {/* Top Pills Row: Household info + Copy/Share/Manage + Add CTA */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/18 backdrop-blur-md border border-white/25 text-xs font-semibold">
                <span>🏡</span>
                <span className="truncate max-w-[160px] sm:max-w-xs">
                  {currentHousehold?.name || 'บ้านของคุณ'} • เชื่อมต่อ {fridges.length} ตู้เย็น
                </span>
              </div>

              {currentHousehold && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCopyHouseholdCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-[11px] font-semibold transition cursor-pointer"
                    title="คัดลอกรหัสเชิญเข้าบ้าน"
                  >
                    {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? 'คัดลอกแล้ว' : householdCode}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowShareModal(true)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 transition cursor-pointer"
                    title="แชร์รหัสเข้าบ้าน"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    href="/household"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 text-[11px] font-semibold transition"
                    title={`สมาชิก ${memberCount} คน`}
                  >
                    <Users className="w-3 h-3" />
                    <span>สมาชิก ({memberCount})</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Greeting + Mascot Fridge Card */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-xl">
                <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
                  สวัสดี {user?.display_name || authUser?.email?.split('@')[0] || 'คุณ'} 👋
                  <br />
                  วันนี้ของในตู้เย็นพร้อมทาน {totalItemsCount} ชิ้น
                </h2>
                <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                  ติดตามของใกล้หมดอายุและงบประจำสัปดาห์ร่วมกันในบ้าน
                </p>
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenAddProduct()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-primary-700 hover:bg-amber-50 font-heading font-semibold text-xs sm:text-sm shadow-sm active:scale-95 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>เพิ่มวัตถุดิบ</span>
                  </button>
                  <Link
                    href="/receipts"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/18 hover:bg-white/25 border border-white/25 text-white font-heading font-semibold text-xs sm:text-sm transition"
                  >
                    <span>🧾 สแกนใบเสร็จ</span>
                  </Link>
                </div>
              </div>

              {/* Right Warm Glass Fridge Mascot Box matching PDF Page 1 */}
              <div className="hidden sm:flex items-center justify-center w-32 h-24 rounded-2xl bg-white/16 backdrop-blur-md border border-white/25 shadow-inner shrink-0 relative">
                <span className="text-4xl">🧊</span>
                <span className="ml-1 text-3xl">🍊</span>
                <span className="absolute top-2 right-2.5 text-white/80 text-xs">✦</span>
              </div>
            </div>

            {/* Bottom 2 Translucent Progress Bars: Budget & Freshness Index */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Budget Progress Card */}
              <div className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span>🪙</span>
                    <span>งบประมาณรายสัปดาห์</span>
                    <button
                      type="button"
                      onClick={() => setShowEditBudgetModal(true)}
                      className="p-1 rounded-md hover:bg-white/20 transition cursor-pointer"
                      title="ตั้งค่างบประมาณรายสัปดาห์"
                      aria-label="แก้ไขงบประมาณ"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="font-heading tabular-nums font-bold">
                    {budgetSummary.percentUsed}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/25 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      budgetSummary.isOverBudget ? 'bg-rose-300' : 'bg-amber-200'
                    }`}
                    style={{ width: `${budgetPercentDisplay}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-white/90">
                  <span>
                    ใช้ไปแล้ว ฿{budgetSummary.totalSpent.toLocaleString()} จาก ฿{budgetSummary.budget.toLocaleString()}
                  </span>
                  <Link href="/activities" className="underline hover:text-white">
                    รายละเอียด
                  </Link>
                </div>
              </div>

              {/* Freshness Index Card */}
              <Link
                href="/expirations"
                className="rounded-2xl bg-white/15 hover:bg-white/20 backdrop-blur-md border border-white/20 p-3.5 space-y-2 transition block"
              >
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>ดัชนีความสดในตู้เย็น</span>
                  </div>
                  <span className="font-heading tabular-nums font-bold">
                    {freshnessPercent}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500"
                    style={{ width: `${freshnessPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-white/90">
                  <span>
                    สดใหม่ {freshItemsCount} จาก {totalItemsCount} รายการ
                  </span>
                  <span>แตะเพื่อดู →</span>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* 2. สถานะวันหมดอายุของทั้งบ้าน (3 Equal Rounded Status Cards — PDF Page 1) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
              สถานะวันหมดอายุของทั้งบ้าน
            </h2>
            <Link
              href="/expirations"
              className="text-xs font-medium text-muted hover:text-primary-600 transition"
            >
              แตะเพื่อดูรายการ →
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <Link
              href="/expirations"
              className="ds-card p-4 sm:p-5 flex flex-col items-center justify-center text-center gap-1.5 hover:border-rose-300 transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/12 border border-rose-500/20 flex items-center justify-center text-xl">
                😠
              </div>
              <span className="font-heading text-2xl sm:text-3xl font-bold text-foreground tabular-nums mt-0.5">
                {urgentConsumeCount}
              </span>
              <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                รีบทานด่วน
              </span>
              <span className="text-[10px] sm:text-[11px] text-muted">
                เหลือ ≤ 2 วัน / หมดอายุ
              </span>
            </Link>

            <Link
              href="/expirations"
              className="ds-card p-4 sm:p-5 flex flex-col items-center justify-center text-center gap-1.5 hover:border-amber-300 transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/12 border border-amber-500/20 flex items-center justify-center text-xl">
                😐
              </div>
              <span className="font-heading text-2xl sm:text-3xl font-bold text-foreground tabular-nums mt-0.5">
                {soon3To5Count}
              </span>
              <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                ใกล้หมดอายุ
              </span>
              <span className="text-[10px] sm:text-[11px] text-muted">
                เหลือ 3–5 วัน
              </span>
            </Link>

            <Link
              href="/fridges"
              className="ds-card p-4 sm:p-5 flex flex-col items-center justify-center text-center gap-1.5 hover:border-emerald-300 transition active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center text-xl">
                😊
              </div>
              <span className="font-heading text-2xl sm:text-3xl font-bold text-foreground tabular-nums mt-0.5">
                {freshItemsCount}
              </span>
              <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                สดใหม่
              </span>
              <span className="text-[10px] sm:text-[11px] text-muted">
                เก็บได้ &gt; 5 วัน
              </span>
            </Link>
          </div>
        </section>

        {/* 3. Two Smart Feature Cards (AI Vision OCR + Zero-Waste AI — PDF Page 1) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Link
            href="/receipts"
            className="ds-card p-4 sm:p-5 flex items-center justify-between gap-4 hover:border-primary-400/60 transition active:scale-[0.99] group"
          >
            <div className="space-y-1.5 min-w-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container border border-border text-[11px] font-semibold text-foreground">
                <span>🧾</span>
                <span>สแกนบิลอัตโนมัติ</span>
              </span>
              <h3 className="font-heading text-base font-bold text-foreground group-hover:text-primary-600 transition">
                สแกนใบเสร็จเข้าตู้
              </h3>
              <p className="text-xs text-muted truncate">
                ถ่ายภาพหรืออัปโหลดสลิป เพิ่มรายการได้ทันที
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-100/15 border border-primary-200 flex items-center justify-center text-2xl shrink-0">
              🧾
            </div>
          </Link>

          <Link
            href="/recipes"
            className="ds-card p-4 sm:p-5 flex items-center justify-between gap-4 bg-primary-50/35 dark:bg-primary-100/10 hover:border-primary-400/70 transition active:scale-[0.99] group"
          >
            <div className="space-y-1.5 min-w-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:text-primary-200 text-[11px] font-semibold">
                <Sparkles className="w-3 h-3" />
                <span>แนะนำเมนูอัจฉริยะ</span>
              </span>
              <h3 className="font-heading text-base font-bold text-foreground group-hover:text-primary-600 transition">
                สุ่มเมนูจากของในตู้
              </h3>
              <p className="text-xs text-muted truncate">
                คิดเมนูจากของใกล้หมดอายุ พร้อมตัดสต็อก
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-card border border-primary-200 flex items-center justify-center text-2xl shrink-0 shadow-xs">
              🥗
            </div>
          </Link>
        </section>

        {/* 4. รายการที่ควรรีบจัดการก่อนหมดอายุ + Inline "-1 หยิบใช้" Action (PDF Page 1) */}
        <section className="ds-card p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-heading font-semibold text-base sm:text-lg text-foreground flex items-center gap-2">
                <span className="text-rose-500">⏰</span>
                <span>รายการที่ควรรีบจัดการก่อนหมดอายุ</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                กดปุ่ม &quot;-1 หยิบใช้&quot; เพื่ออัปเดตจำนวนล่าสุดทันที
              </p>
            </div>
            <Link
              href="/fridges"
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 shrink-0 transition"
            >
              ดูทั้งหมด →
            </Link>
          </div>

          {loadingData ? (
            <div className="space-y-2.5">
              <SkeletonCard />
            </div>
          ) : urgentList.length === 0 ? (
            <div className="py-8 px-4 rounded-2xl bg-surface-container-low border border-border text-center space-y-1.5">
              <span className="text-2xl block">🥦</span>
              <p className="font-heading font-semibold text-sm text-foreground">
                วัตถุดิบทั้งหมดยังสดใหม่
              </p>
              <p className="text-xs text-muted">
                ไม่มีรายการที่ใกล้หมดอายุภายใน 5 วันนี้
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {urgentList.slice(0, 5).map((item) => {
                const isExpired = item.daysLeft < 0;
                const isUrgent = item.daysLeft <= 2;
                const fridgeName = (item.fridge_id && fridgeNameMap.get(item.fridge_id)) || 'ตู้เย็น';

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border bg-surface-container-low/70 hover:bg-card p-3 sm:p-3.5 flex items-center justify-between gap-3 transition"
                  >
                    <Link
                      href={item.fridge_id ? `/fridges?fridge=${item.fridge_id}` : '/fridges'}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <div className="w-11 h-11 rounded-xl bg-card border border-border flex items-center justify-center text-xl shrink-0 shadow-[var(--shadow-xs)]">
                        {item.image_url || getAutoEmoji(item.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-semibold text-sm text-foreground truncate">
                            {item.name}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isExpired || isUrgent
                                ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25'
                                : 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isExpired || isUrgent ? 'bg-rose-500' : 'bg-amber-500'
                              }`}
                            />
                            {formatExpiryShortBadge(item.daysLeft)}
                          </span>
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5">
                          {fridgeName} • เหลือ {item.quantity} {item.unit}
                        </p>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleQuickConsume(item)}
                      disabled={consumingItemId === item.id || Number(item.quantity) <= 0}
                      className="shrink-0 px-3.5 py-2 rounded-xl bg-card hover:bg-primary-600 text-foreground hover:text-white border border-border hover:border-primary-600 text-xs font-semibold shadow-[var(--shadow-xs)] active:scale-95 disabled:opacity-40 transition cursor-pointer"
                    >
                      {consumingItemId === item.id ? 'กำลังตัด...' : '-1 หยิบใช้'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Compartment Cards (ตู้เย็นของคุณ) */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
              <span>ตู้เย็นของคุณ</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container border border-border font-semibold text-xs text-muted tabular-nums">
                {fridges.length}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAddFridge(true)}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                + เพิ่มตู้เย็น
              </button>
              <Link
                href="/fridges"
                className="text-xs font-semibold text-muted hover:text-foreground flex items-center gap-0.5 cursor-pointer"
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
            <div className="p-8 rounded-[20px] border border-dashed border-border bg-card text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto">
                <Refrigerator className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-semibold text-sm text-foreground">
                ยังไม่มีตู้เย็นในครัวเรือนนี้
              </h3>
              <p className="text-xs text-muted max-w-xs mx-auto">
                สร้างตู้เย็นใบแรกของคุณเพื่อเริ่มจัดการอาหาร เตือนวันหมดอายุ และสแกนบิล
              </p>
              <button
                type="button"
                onClick={() => setShowAddFridge(true)}
                className="ds-btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs cursor-pointer"
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
                    className="ds-card p-5 flex flex-col justify-between gap-4 hover:border-primary-400/50 transition"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-xl shrink-0">
                            {f.icon || (isFreezer ? '❄️' : isBeverage ? '🍺' : '❄️')}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-heading font-semibold text-base text-foreground truncate">
                              {f.name}
                            </h3>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-muted px-2.5 py-1 rounded-full bg-surface-container border border-border tabular-nums">
                          {itemCount} รายการ
                        </span>
                      </div>

                      <p className="text-xs text-muted truncate mt-1">
                        {previewText}
                      </p>

                      <div className="mt-1">
                        {expCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span>มี {expCount} รายการใกล้หมดอายุ</span>
                          </span>
                        ) : itemCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                            <span>วัตถุดิบทั้งหมดยังสดใหม่</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                            <span>พร้อมเก็บวัตถุดิบ</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 pt-3 border-t border-border">
                      <Link
                        href={`/fridges?fridge=${f.id}`}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container border border-border text-xs font-semibold text-foreground transition text-center flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted" />
                        <span>ดูตู้เย็น</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleOpenAddProduct(f.id)}
                        className="ds-btn-primary flex-1 py-2.5 px-3 text-xs text-center flex items-center justify-center gap-1.5 cursor-pointer"
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

        {/* Recent Household Activities */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground">
              กิจกรรมล่าสุดในบ้าน
            </h2>
            <Link
              href="/activities"
              className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-0.5"
            >
              <span>ดูทั้งหมด</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="ds-card p-4 sm:p-5 divide-y divide-border">
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
                let iconClass = 'bg-primary-100 text-primary-700 dark:text-primary-300 border border-primary-600/20';

                if (act.action === 'item_added' || act.action === 'quantity_increased') {
                  actTitle = `เพิ่ม "${itemName}" ${amount} ${unit}`;
                  badgeNode = (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:text-primary-300 border border-primary-600/20">
                      +{amount} {unit}
                    </span>
                  );
                } else if (act.action === 'quantity_decreased') {
                  actTitle = `หยิบ "${itemName}" ออก ${amount} ${unit}`;
                  badgeNode = (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                      -{amount} {unit}
                    </span>
                  );
                  iconClass = 'bg-amber-500/12 text-amber-700 border border-amber-500/25';
                } else if (act.action === 'item_removed') {
                  actTitle = `ลบรายการ "${itemName}" ออกจากตู้`;
                  iconClass = 'bg-rose-500/12 text-rose-700 border border-rose-500/25';
                } else if (act.action === 'member_joined') {
                  actTitle = `${userName} เข้าร่วมครัวเรือน`;
                } else if (act.action === 'receipt_scanned') {
                  actTitle = `สแกนใบเสร็จเพิ่มวัตถุดิบ`;
                } else if (act.action === 'fridge_created') {
                  actTitle = `สร้างตู้เย็นใหม่`;
                } else if (act.action === 'item_updated') {
                  actTitle = `อัปเดตข้อมูล "${itemName}"`;
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
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${iconClass}`}
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
                        <span className="text-xs font-semibold text-foreground truncate">
                          {userName}
                        </span>
                        <span className="text-[11px] text-muted shrink-0 tabular-nums">
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

        {/* Zero-Waste Eco Tip Card */}
        <section className="p-4 sm:p-5 rounded-[20px] bg-primary-100/65 dark:bg-surface-container border border-primary-600/15 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-xl shrink-0">
            🌿
          </div>
          <div className="space-y-0.5">
            <span className="font-heading font-semibold text-xs sm:text-sm text-foreground block">
              เคล็ดลับบ้านประหยัด &amp; รักษ์โลก
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
          onSuccess={handleBudgetUpdated}
        />
      )}
    </MainLayout>
  );
}
