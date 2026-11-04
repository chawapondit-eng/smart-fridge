'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { SkeletonRow } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  History,
  Plus,
  Minus,
  Trash2,
  Refrigerator,
  UserPlus,
  Receipt,
  Edit,
  Clock,
  Calendar,
  CalendarDays,
  Layers,
  Search,
  Users,
  ArrowUpRight,
  ArrowDownRight,
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

      // 1. ดึงประวัติกิจกรรม (สูงสุด 200 รายการเพื่อให้ดูย้อนหลัง สัปดาห์/เดือน/ปี ได้ครบถ้วน)
      const { data: logRows, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('household_id', currentHousehold.id)
        .order('created_at', { ascending: false })
        .limit(200);

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

  return (
    <MainLayout>
      <div className="space-y-6 animate-in fade-in duration-300 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              <span>ประวัติการใช้งาน</span>
              <History className="w-6 h-6 text-primary-600" />
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1">
              ตรวจสอบว่าใครหยิบอะไรเข้าหรือออกจากตู้เย็น จัดหมวดหมู่ตามช่วงเวลา
            </p>
          </div>
        </div>

        {/* 1. Time Range Selector Tabs (วัน / สัปดาห์ / เดือน / ปี) */}
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-card border border-border shadow-xs overflow-x-auto scrollbar-none">
          {timeTabs.map((tab) => {
            const Icon = tab.icon;
            const active = timeRange === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTimeRange(tab.id)}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap active:scale-[0.98] ${
                  active
                    ? 'bg-primary-600 text-white shadow-xs shadow-primary-600/30'
                    : 'text-muted hover:text-foreground hover:bg-muted/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-muted/15 text-muted'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 2. Quick Summary Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted">กิจกรรมในรอบนี้</p>
              <p className="text-xl sm:text-2xl font-extrabold text-foreground mt-1">
                {stats.total}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-600 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted">เติมของเข้า (+)</p>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1">
                +{stats.inCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted">หยิบของออก (-)</p>
              <p className="text-xl sm:text-2xl font-extrabold text-amber-600 mt-1">
                -{stats.outCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted">สมาชิกที่ทำรายการ</p>
              <p className="text-xl sm:text-2xl font-extrabold text-indigo-600 mt-1">
                {stats.activeUsers}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 3. Search and Action Filters Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl border border-border bg-card">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่ออาหาร, สมาชิก, หรือตู้เย็น..."
              className="w-full pl-10 pr-8 py-2 rounded-xl border border-border bg-background text-xs sm:text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary-500 transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted shrink-0 hidden sm:block" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-border bg-background text-xs sm:text-sm font-medium text-foreground focus:outline-none focus:border-primary-500"
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

        {/* 4. Grouped Timeline Content */}
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
          <div className="space-y-6">
            {groupedLogs.map((group) => (
              <div key={group.key} className="space-y-2.5">
                {/* Section Header (Day / Group Banner) */}
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                    <h2 className="text-sm sm:text-base font-bold text-foreground">
                      {group.title}
                    </h2>
                    <span className="text-xs text-muted font-normal">
                      • {group.subtitle}
                    </span>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-muted/15 text-muted">
                    {group.logs.length} รายการ
                  </span>
                </div>

                {/* Day Logs Container */}
                <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 shadow-xs divide-y divide-border/60">
                  {group.logs.map((log) => {
                    const meta = getActionMeta(log.action);
                    const Icon = meta.icon;
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

                    let actionTitle = '';
                    let actionBadge: React.ReactNode = null;

                    if (log.action === 'item_added') {
                      const qtyText = amount !== undefined ? `${amount} ${unit}` : '';
                      actionTitle = `เพิ่ม "${itemName}" ${qtyText ? `จำนวน ${qtyText}` : ''}`;
                      actionBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          +{amount ?? 1} {unit}
                        </span>
                      );
                    } else if (log.action === 'quantity_decreased') {
                      const absChange =
                        amount !== undefined ? Math.abs(amount) : change ? Math.abs(Number(change)) : 1;
                      actionTitle = `หยิบ "${itemName}" ออก ${absChange} ${unit}`;
                      actionBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          -{absChange} {unit}
                        </span>
                      );
                    } else if (log.action === 'quantity_increased') {
                      const absChange =
                        amount !== undefined ? Math.abs(amount) : change ? Math.abs(Number(change)) : 1;
                      actionTitle = `เติม "${itemName}" เพิ่ม ${absChange} ${unit}`;
                      actionBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          +{absChange} {unit}
                        </span>
                      );
                    } else if (log.action === 'item_removed') {
                      actionTitle = `ลบรายการ "${itemName}" ออกจากตู้เย็น`;
                      actionBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          ลบสินค้า
                        </span>
                      );
                    } else if (log.action === 'item_updated') {
                      actionTitle = `แก้ไขข้อมูล "${itemName}"`;
                    } else if (log.action === 'fridge_created') {
                      actionTitle = `สร้างตู้เย็นใหม่: "${details?.name || ''}"`;
                    } else if (log.action === 'member_joined') {
                      actionTitle = 'เข้าร่วมครัวเรือน';
                      actionBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          สมาชิกใหม่
                        </span>
                      );
                    } else {
                      actionTitle = meta.title;
                    }

                    return (
                      <div
                        key={log.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3.5 transition hover:bg-muted/5 rounded-xl px-1 sm:px-2"
                      >
                        {/* Action Icon */}
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${meta.bg}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Event Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
                            <div className="text-xs sm:text-sm text-foreground flex flex-wrap items-center gap-1.5">
                              {/* Member Pill */}
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-muted/15 font-bold text-foreground">
                                <div className="w-4 h-4 rounded-full bg-primary-200 dark:bg-primary-900 text-primary-800 dark:text-primary-200 flex items-center justify-center text-[10px] overflow-hidden">
                                  {log.users?.avatar_url?.startsWith('data:image') ||
                                  log.users?.avatar_url?.startsWith('http') ? (
                                    <img
                                      src={log.users.avatar_url}
                                      alt={userName}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : log.users?.avatar_url ? (
                                    <span>{log.users.avatar_url}</span>
                                  ) : (
                                    userName.charAt(0).toUpperCase()
                                  )}
                                </div>
                                <span className="text-xs">{userName}</span>
                              </div>

                              <span className="font-semibold text-foreground">
                                {actionTitle}
                              </span>

                              {actionBadge}

                              {newQty !== undefined &&
                                (log.action === 'quantity_decreased' ||
                                  log.action === 'quantity_increased') && (
                                  <span className="text-xs text-muted font-normal">
                                    (คงเหลือ {newQty} {unit})
                                  </span>
                                )}
                            </div>

                            {/* Clean Time Stamp */}
                            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 text-muted">
                              <span className="text-xs font-semibold text-foreground">
                                {formatTime(log.created_at)}
                              </span>
                              <span className="text-[11px] text-muted">
                                ({getRelativeTime(log.created_at)})
                              </span>
                            </div>
                          </div>

                          {/* Fridge Tag */}
                          {log.fridges && (
                            <div className="flex items-center gap-1 text-[11px] text-muted mt-1">
                              <span>{log.fridges.icon || '❄️'}</span>
                              <span>{log.fridges.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
