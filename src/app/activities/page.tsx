'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { SkeletonRow } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchWeeklyBudgetSummary, type WeeklyBudgetSummary } from '@/lib/budget';
import { EditBudgetModal } from '@/components/budget/EditBudgetModal';
import {
  History,
  Plus,
  Minus,
  Trash2,
  Refrigerator,
  UserPlus,
  Receipt,
  Edit,
  Edit2,
  Clock,
  Calendar,
  CalendarDays,
  Layers,
  Search,
  Filter,
} from 'lucide-react';
import type { ActivityLog } from '@/types/database';

interface LogWithUser extends ActivityLog {
  users?: {
    display_name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
  fridges?: {
    name: string;
    icon: string;
  } | null;
}

type TimeRange = 'all' | 'today' | 'week' | 'month' | 'year';

interface LogGroup {
  key: string;
  title: string;
  subtitle: string;
  date: Date;
  logs: LogWithUser[];
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชม. ที่แล้ว`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'เมื่อวานนี้';
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function formatTime(dateString: string): string {
  const d = new Date(dateString);
  return (
    d.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' น.'
  );
}

export default function ActivitiesPage() {
  const supabase = createClient();
  const { currentHousehold, authUser, refreshHouseholds } = useHousehold();

  const [logs, setLogs] = useState<LogWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditBudgetModal, setShowEditBudgetModal] = useState(false);
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

  // Filters
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    if (!currentHousehold?.id || !authUser?.id) return;
    setLoading(true);
    try {
      // 0. ตรวจสอบว่าผู้ใช้ยังอยู่ในครัวเรือนนี้
      const { data: memberCheck } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', currentHousehold.id)
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (!memberCheck) {
        setLogs([]);
        refreshHouseholds();
        return;
      }

      // 1. ดึงข้อมูลงบประมาณรายสัปดาห์และประวัติกิจกรรมพร้อมกัน
      const [summaryRes, logsRes] = await Promise.all([
        fetchWeeklyBudgetSummary(supabase, currentHousehold.id),
        supabase
          .from('activity_logs')
          .select('*')
          .eq('household_id', currentHousehold.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      setBudgetSummary(summaryRes);

      const { data: logRows, error } = logsRes;

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
          setLogs([]);
          return;
        }
        throw error;
      }
      if (!logRows || logRows.length === 0) {
        setLogs([]);
        return;
      }

      // 2. ดึงข้อมูล Users และ Fridges
      const userIds = Array.from(new Set(logRows.map((l) => l.user_id).filter(Boolean)));
      const fridgeIds = Array.from(new Set(logRows.map((l) => l.fridge_id).filter(Boolean)));

      const [userRes, fridgeRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('users').select('id, display_name, email, avatar_url').in('id', userIds)
          : Promise.resolve({ data: [] }),
        fridgeIds.length > 0
          ? supabase.from('fridges').select('id, name, icon').in('id', fridgeIds)
          : Promise.resolve({ data: [] }),
      ]);

      const userMap = new Map((userRes.data || []).map((u) => [u.id, u]));
      const fridgeMap = new Map((fridgeRes.data || []).map((f) => [f.id, f]));

      const combined: LogWithUser[] = logRows.map((l) => ({
        ...l,
        users: userMap.get(l.user_id) || null,
        fridges: l.fridge_id ? fridgeMap.get(l.fridge_id) || null : null,
      }));

      setLogs(combined);
    } catch (err) {
      console.error('Error fetching activity logs:', (err as { message?: string })?.message || err);
    } finally {
      setLoading(false);
    }
  }, [currentHousehold?.id, authUser?.id, refreshHouseholds, supabase]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Realtime subscription สำหรับประวัติกิจกรรม
  useEffect(() => {
    if (!currentHousehold?.id) return;

    const channel = supabase
      .channel('realtime_activities_page')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
        },
        () => {
          fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentHousehold?.id, fetchLogs, supabase]);

  // คำนวณจำนวนรายการในแต่ละช่วงเวลา (สำหรับแสดงตัวเลขบนแท็บ วัน/สัปดาห์/เดือน/ปี)
  const rangeCounts = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

    let today = 0;
    let week = 0;
    let month = 0;
    let year = 0;

    for (const log of logs) {
      const t = new Date(log.created_at).getTime();
      if (t >= todayStart) today++;
      if (t >= weekStart) week++;
      if (t >= monthStart) month++;
      if (t >= yearStart) year++;
    }

    return {
      all: logs.length,
      today,
      week,
      month,
      year,
    };
  }, [logs]);

  // กรองตามช่วงเวลา (TimeRange)
  const logsFilteredByTime = useMemo(() => {
    if (timeRange === 'all') return logs;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

    return logs.filter((log) => {
      const t = new Date(log.created_at).getTime();
      if (timeRange === 'today') return t >= todayStart;
      if (timeRange === 'week') return t >= weekStart;
      if (timeRange === 'month') return t >= monthStart;
      if (timeRange === 'year') return t >= yearStart;
      return true;
    });
  }, [logs, timeRange]);

  // กรองตามประเภทกิจกรรม และคำค้นหา
  const finalFilteredLogs = useMemo(() => {
    return logsFilteredByTime.filter((log) => {
      // 1. กรองประเภท
      if (filterAction !== 'all') {
        if (filterAction === 'quantity') {
          if (log.action !== 'quantity_increased' && log.action !== 'quantity_decreased') {
            return false;
          }
        } else if (filterAction === 'item_added') {
          if (log.action !== 'item_added' && log.action !== 'quantity_increased') {
            return false;
          }
        } else if (filterAction === 'item_decreased') {
          if (log.action !== 'quantity_decreased') {
            return false;
          }
        } else if (log.action !== filterAction) {
          return false;
        }
      }

      // 2. กรองคำค้นหา
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const details = log.details as Record<string, unknown> | null;
        const userName = (log.users?.display_name || details?.user_name || '').toString().toLowerCase();
        const itemName = (details?.item_name || details?.name || '').toString().toLowerCase();
        const fridgeName = (log.fridges?.name || '').toLowerCase();
        if (!userName.includes(q) && !itemName.includes(q) && !fridgeName.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [logsFilteredByTime, filterAction, search]);

  // สถิติสรุปตามช่วงเวลาที่เลือก
  const stats = useMemo(() => {
    let inCount = 0;
    let outCount = 0;
    const usersSet = new Set<string>();

    for (const log of finalFilteredLogs) {
      if (log.user_id) usersSet.add(log.user_id);
      if (log.action === 'quantity_increased' || log.action === 'item_added') {
        inCount++;
      } else if (log.action === 'quantity_decreased' || log.action === 'item_removed') {
        outCount++;
      }
    }

    return {
      total: finalFilteredLogs.length,
      inCount,
      outCount,
      activeUsers: usersSet.size,
    };
  }, [finalFilteredLogs]);

  // จัดกลุ่มประวัติตาม วันที่ (Grouping by Day)
  const groupedLogs = useMemo(() => {
    const groups: LogGroup[] = [];
    const map = new Map<string, LogGroup>();

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    for (const log of finalFilteredLogs) {
      const d = new Date(log.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (!map.has(key)) {
        let title = '';
        const subtitle = d.toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        if (key === todayKey) {
          title = 'วันนี้';
        } else if (key === yesterdayKey) {
          title = 'เมื่อวานนี้';
        } else {
          const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 7) {
            title = d.toLocaleDateString('th-TH', { weekday: 'long' });
          } else {
            title = d.toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          }
        }

        const group: LogGroup = {
          key,
          title,
          subtitle,
          date: d,
          logs: [],
        };
        map.set(key, group);
        groups.push(group);
      }

      map.get(key)!.logs.push(log);
    }

    return groups;
  }, [finalFilteredLogs]);

  function getActionMeta(action: string) {
    switch (action) {
      case 'item_added':
        return {
          icon: Plus,
          bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20',
          title: 'เพิ่มสินค้าลงตู้เย็น',
        };
      case 'quantity_increased':
        return {
          icon: Plus,
          bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20',
          title: 'เพิ่มจำนวนสินค้า',
        };
      case 'quantity_decreased':
        return {
          icon: Minus,
          bg: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20',
          title: 'หยิบสินค้าออก',
        };
      case 'item_removed':
        return {
          icon: Trash2,
          bg: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20',
          title: 'ลบรายการสินค้า',
        };
      case 'item_updated':
        return {
          icon: Edit,
          bg: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20',
          title: 'แก้ไขข้อมูลสินค้า',
        };
      case 'fridge_created':
        return {
          icon: Refrigerator,
          bg: 'bg-primary-50 text-primary-600 dark:bg-primary-950/40',
          title: 'สร้างตู้เย็นใหม่',
        };
      case 'member_joined':
        return {
          icon: UserPlus,
          bg: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20',
          title: 'สมาชิกใหม่เข้าร่วม',
        };
      case 'receipt_scanned':
        return {
          icon: Receipt,
          bg: 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20',
          title: 'สแกนใบเสร็จเข้าตู้',
        };
      default:
        return {
          icon: History,
          bg: 'bg-muted/10 text-muted',
          title: 'ทำรายการ',
        };
    }
  }

  const timeTabs: { id: TimeRange; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'all', label: 'ทั้งหมด', icon: Layers, count: rangeCounts.all },
    { id: 'today', label: 'วันนี้', icon: Clock, count: rangeCounts.today },
    { id: 'week', label: 'สัปดาห์นี้', icon: Calendar, count: rangeCounts.week },
    { id: 'month', label: 'เดือนนี้', icon: CalendarDays, count: rangeCounts.month },
    { id: 'year', label: 'ปีนี้', icon: History, count: rangeCounts.year },
  ];

  const budgetDonutRadius = 44;
  const budgetDonutCirc = 2 * Math.PI * budgetDonutRadius;
  const budgetPct = Math.min(100, Math.max(0, budgetSummary.percentUsed));
  const budgetStrokeDashoffset = budgetDonutCirc - (budgetPct / 100) * budgetDonutCirc;

  return (
    <MainLayout>
      <div className="space-y-5 animate-in fade-in duration-300 pb-12">
        {/* 1. Weekly Budget Intelligence Card (PDF Page 5 — Warm Orange) */}
        <section className="ds-card p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7">
            {/* Warm Orange SVG Circular Donut */}
            <div className="relative w-28 h-28 shrink-0 self-center sm:self-auto flex items-center justify-center">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
                <circle
                  cx="56"
                  cy="56"
                  r={budgetDonutRadius}
                  stroke="currentColor"
                  className="text-surface-container"
                  strokeWidth="12"
                  fill="transparent"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={budgetDonutRadius}
                  stroke={budgetSummary.isOverBudget ? '#e11d48' : '#ea580c'}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={budgetDonutCirc}
                  strokeDashoffset={budgetStrokeDashoffset}
                  fill="transparent"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-heading text-xl font-bold text-foreground tabular-nums leading-none">
                  {budgetSummary.percentUsed}%
                </span>
                <span className="text-[10px] text-muted font-medium mt-1">ใช้ไปแล้ว</span>
              </div>
            </div>

            {/* Budget Summary Info */}
            <div className="flex-1 min-w-0 space-y-2.5 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600">
                <span>🔥</span>
                <span>สรุปงบประมาณประจำสัปดาห์</span>
              </div>

              <div>
                <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground tabular-nums">
                  {budgetSummary.isOverBudget
                    ? `เกินงบ ฿${budgetSummary.overBudgetAmount.toLocaleString()}`
                    : `คงเหลือ ฿${budgetSummary.remaining.toLocaleString()}`}
                </h1>
                <p className="text-xs sm:text-sm text-muted mt-0.5">
                  ใช้จ่ายไปแล้ว ฿{budgetSummary.totalSpent.toLocaleString()} จากวงเงินที่ตั้งไว้ ฿{budgetSummary.budget.toLocaleString()} ต่อสัปดาห์
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                    budgetSummary.isOverBudget
                      ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                      : budgetSummary.isNearLimit
                      ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <span>
                    {budgetSummary.isOverBudget
                      ? '⚠️ ใช้จ่ายเกินวงเงินรายสัปดาห์'
                      : budgetSummary.isNearLimit
                      ? '⚡ ใกล้ถึงวงเงินงบประมาณแล้ว'
                      : '✨ คุมงบได้ดีเยี่ยม ไม่เกินวงเงิน'}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => setShowEditBudgetModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-surface-container-low hover:bg-primary-50 border border-border hover:border-primary-300 text-xs font-semibold text-foreground transition cursor-pointer"
                >
                  <Edit2 className="w-3 h-3 text-primary-600" />
                  <span>แก้ไขวงเงินงบ</span>
                </button>
              </div>
            </div>
          </div>

          {/* Weekly Receipt Spend Summary */}
          <div className="pt-4 border-t border-border">
            <div className="rounded-2xl bg-surface-container-low border border-border/80 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center text-lg shrink-0 shadow-[var(--shadow-xs)]">
                  🛒
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">ยอดใช้จ่ายจากใบเสร็จสัปดาห์นี้</p>
                  <p className="text-[11px] text-muted truncate">
                    บันทึกแล้ว {budgetSummary.receiptCount} ใบเสร็จ
                  </p>
                </div>
              </div>
              <p className="font-heading text-lg sm:text-xl font-bold text-foreground tabular-nums shrink-0">
                ฿{budgetSummary.totalSpent.toLocaleString()}
              </p>
            </div>
          </div>
        </section>

        {/* 2. Activity Logs Card (PDF Page 5 — Warm Orange) */}
        <section className="ds-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
                <span>🧾</span>
                <span>ประวัติกิจกรรมในบ้าน</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                บันทึกอัตโนมัติว่าใครซื้อของเข้าตู้ หรือหยิบอะไรไปใช้ ({stats.total} รายการ)
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              อัปเดตอัตโนมัติ
            </span>
          </div>

          {/* Time Range Selector Pills + Search/Action Filter */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {timeTabs.map((tab) => {
                const Icon = tab.icon;
                const active = timeRange === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimeRange(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-primary-600 text-white shadow-[0_2px_8px_-2px_rgba(234,88,12,0.35)]'
                        : 'bg-surface-container-low text-muted hover:text-foreground border border-border'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'bg-card text-muted'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="ds-input relative flex-1">
                <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่ออาหาร, สมาชิก, หรือตู้เย็น..."
                  className="w-full pl-10 pr-8 py-2 bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted shrink-0 hidden sm:block" />
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="ds-input w-full sm:w-auto px-3.5 py-2 text-xs font-medium text-foreground cursor-pointer"
                >
                  <option value="all">กิจกรรมทั้งหมด</option>
                  <option value="quantity">การปรับจำนวน (+ / -)</option>
                  <option value="item_added">เติมสินค้าเข้า (+)</option>
                  <option value="item_decreased">หยิบสินค้าออก (-)</option>
                  <option value="item_removed">ลบสินค้า</option>
                  <option value="member_joined">สมาชิกเข้าร่วม</option>
                </select>
              </div>
            </div>
          </div>

          {/* Grouped Timeline Content */}
          {loading ? (
            <div className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : groupedLogs.length === 0 ? (
            <EmptyState
              icon={<History className="w-7 h-7" />}
              title="ไม่พบประวัติกิจกรรมในช่วงเวลานี้"
              description={
                search || filterAction !== 'all'
                  ? 'ลองปรับคำค้นหาหรือเปลี่ยนตัวกรองกิจกรรม'
                  : 'ไม่มีรายการเคลื่อนไหวตามช่วงเวลาที่คุณเลือก'
              }
            />
          ) : (
            <div className="space-y-5">
              {groupedLogs.map((group) => (
                <div key={group.key} className="space-y-2">
                  {/* Day Group Subtitle */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary-600" />
                      <h3 className="font-heading text-xs sm:text-sm font-semibold text-foreground">
                        {group.title}
                      </h3>
                      <span className="text-[11px] text-muted">• {group.subtitle}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-muted">
                      {group.logs.length} รายการ
                    </span>
                  </div>

                  {/* Clean Pill Rows matching PDF Page 5 */}
                  <div className="space-y-2">
                    {group.logs.map((log) => {
                      const details = log.details as Record<string, unknown> | null;
                      const userName =
                        log.users?.display_name ||
                        (details?.user_name as string) ||
                        log.users?.email?.split('@')[0] ||
                        'สมาชิก';
                      const itemName =
                        (details?.item_name as string) || (details?.name as string) || 'สินค้า';
                      const unit = (details?.unit as string) || 'ชิ้น';
                      const amount =
                        details?.amount !== undefined
                          ? Number(details.amount)
                          : details?.quantity !== undefined
                          ? Number(details.quantity)
                          : undefined;
                      const change = details?.change as number | undefined;
                      const newQty =
                        details?.new_quantity !== undefined ? Number(details.new_quantity) : undefined;
                      const fridgeSuffix = log.fridges?.name ? ` (${log.fridges.name})` : '';

                      let actionTitle = '';
                      if (log.action === 'item_added') {
                        const qtyText = amount !== undefined ? ` ${amount} ${unit}` : '';
                        actionTitle = `เพิ่ม ${itemName}${qtyText} เข้าตู้${fridgeSuffix}`;
                      } else if (log.action === 'quantity_decreased') {
                        const absChange =
                          amount !== undefined ? Math.abs(amount) : change ? Math.abs(Number(change)) : 1;
                        actionTitle = `หยิบ ${itemName} ${absChange} ${unit}${
                          newQty !== undefined ? ` (เหลือ ${newQty} ${unit})` : ''
                        }${fridgeSuffix}`;
                      } else if (log.action === 'quantity_increased') {
                        const absChange =
                          amount !== undefined ? Math.abs(amount) : change ? Math.abs(Number(change)) : 1;
                        actionTitle = `เติม ${itemName} เพิ่ม ${absChange} ${unit}${fridgeSuffix}`;
                      } else if (log.action === 'item_removed') {
                        actionTitle = `ลบรายการ ${itemName} ออกจากตู้${fridgeSuffix}`;
                      } else if (log.action === 'item_updated') {
                        actionTitle = `แก้ไขข้อมูล ${itemName}${fridgeSuffix}`;
                      } else if (log.action === 'fridge_created') {
                        actionTitle = `สร้างตู้เย็นใหม่ "${details?.name || ''}"`;
                      } else if (log.action === 'member_joined') {
                        actionTitle = 'เข้าร่วมครัวเรือน';
                      } else {
                        actionTitle = getActionMeta(log.action).title;
                      }

                      return (
                        <div
                          key={log.id}
                          className="rounded-2xl bg-surface-container-low border border-border/70 px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-xs font-semibold text-foreground shrink-0">
                              <span>{log.users?.avatar_url && !log.users.avatar_url.startsWith('http') ? log.users.avatar_url : '👤'}</span>
                              <span>{userName}</span>
                            </span>
                            <span className="text-xs sm:text-sm text-foreground truncate">
                              {actionTitle}
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[11px] font-medium text-muted block">
                              {getRelativeTime(log.created_at)}
                            </span>
                            <span className="text-[10px] text-muted/80 hidden sm:block">
                              {formatTime(log.created_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Edit Budget Modal */}
      {currentHousehold && (
        <EditBudgetModal
          isOpen={showEditBudgetModal}
          onClose={() => setShowEditBudgetModal(false)}
          householdId={currentHousehold.id}
          currentBudget={budgetSummary.budget}
          onSuccess={(newBudget) => {
            setBudgetSummary((prev) => {
              const remaining = Math.max(0, newBudget - prev.totalSpent);
              const overBudgetAmount = Math.max(0, prev.totalSpent - newBudget);
              const percentUsed = newBudget > 0 ? Math.round((prev.totalSpent / newBudget) * 100) : 0;
              return {
                ...prev,
                budget: newBudget,
                remaining,
                overBudgetAmount,
                percentUsed,
                isOverBudget: prev.totalSpent > newBudget,
                isNearLimit: prev.totalSpent <= newBudget && percentUsed >= 80,
              };
            });
          }}
        />
      )}
    </MainLayout>
  );
}
