'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SkeletonRow } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuantityStepper } from '@/components/inventory/QuantityStepper';
import {
  Clock,
  Calendar,
  Search,
  Filter,
} from 'lucide-react';

interface ExpiryItemWithMeta {
  batchId: string;
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
  expiryDate: string;
  daysLeft: number;
  fridgeName: string;
  fridgeIcon: string;
}

export default function ExpirationPage() {
  const supabase = createClient();
  const { currentHousehold, fridges, authUser, refreshHouseholds } = useHousehold();

  const [batches, setBatches] = useState<ExpiryItemWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'expired' | 'today' | 'soon' | 'fresh'>('all');
  const [selectedFridgeId, setSelectedFridgeId] = useState<string>('all');

  const fetchBatches = useCallback(async () => {
    if (!currentHousehold?.id || !authUser?.id) return;
    setLoading(true);
    try {
      // ตรวจสอบว่าผู้ใช้ยังอยู่ในครัวเรือนนี้
      const { data: memberCheck } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', currentHousehold.id)
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (!memberCheck) {
        setBatches([]);
        refreshHouseholds();
        return;
      }

      // 1. ดึงรายการสินค้าทั้งหมดในครัวเรือนนี้
      const { data: itemRows, error: itemError } = await supabase
        .from('items')
        .select('id, name, unit, fridge_id')
        .eq('household_id', currentHousehold.id);

      if (itemError) {
        if (itemError.code === 'PGRST205' || itemError.message?.includes('schema cache')) {
          setBatches([]);
          return;
        }
        throw itemError;
      }
      if (!itemRows || itemRows.length === 0) {
        setBatches([]);
        return;
      }

      const itemIds = itemRows.map((i) => i.id);
      const itemMap = new Map(itemRows.map((i) => [i.id, i]));
      const fridgeMap = new Map(fridges.map((f) => [f.id, f]));

      // 2. ดึง batches ที่มีวันหมดอายุของสินค้าเหล่านี้
      const { data: batchRows, error: batchError } = await supabase
        .from('item_batches')
        .select('id, quantity, expiry_date, item_id')
        .in('item_id', itemIds)
        .not('expiry_date', 'is', null)
        .order('expiry_date', { ascending: true });

      if (batchError) throw batchError;

      if (batchRows) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const list: ExpiryItemWithMeta[] = batchRows
          .filter((b) => Number(b.quantity) > 0)
          .map((b) => {
            const it = itemMap.get(b.item_id);
            const fr = it ? fridgeMap.get(it.fridge_id) : null;
            const exp = new Date(b.expiry_date);
            exp.setHours(0, 0, 0, 0);
            const diffTime = exp.getTime() - today.getTime();
            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return {
              batchId: b.id,
              itemId: b.item_id,
              name: it?.name || 'สินค้า',
              unit: it?.unit || 'ชิ้น',
              quantity: Number(b.quantity),
              expiryDate: b.expiry_date,
              daysLeft,
              fridgeName: fr?.name || 'ตู้เย็น',
              fridgeIcon: fr?.icon || '❄️',
            };
          });

        setBatches(list);
      }
    } catch (err) {
      console.error('Error fetching expiry batches:', (err as { message?: string })?.message || err);
    } finally {
      setLoading(false);
    }
  }, [currentHousehold?.id, authUser?.id, refreshHouseholds, fridges, supabase]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Grouping counts
  const expiredCount = batches.filter(b => b.daysLeft < 0).length;
  const todayCount = batches.filter(b => b.daysLeft === 0).length;
  const soonCount = batches.filter(b => b.daysLeft > 0 && b.daysLeft <= 3).length;
  const freshCount = batches.filter(b => b.daysLeft > 3).length;

  const filtered = batches.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase());
    const matchFridge = selectedFridgeId === 'all' || fridges.find(f => f.name === b.fridgeName)?.id === selectedFridgeId;

    let matchTab = true;
    if (activeTab === 'expired') matchTab = b.daysLeft < 0;
    else if (activeTab === 'today') matchTab = b.daysLeft === 0;
    else if (activeTab === 'soon') matchTab = b.daysLeft > 0 && b.daysLeft <= 3;
    else if (activeTab === 'fresh') matchTab = b.daysLeft > 3;

    return matchSearch && matchFridge && matchTab;
  });

  return (
    <MainLayout>
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <span>จัดการวันหมดอายุ</span>
            <Clock className="w-6 h-6 text-primary-600" />
          </h1>
          <p className="text-sm text-muted mt-1">
            ติดตามและเรียงลำดับอาหารตามวันหมดอายุ เพื่อใช้วัตถุดิบได้ทันเวลา
          </p>
        </div>

        {/* 4 Summary Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setActiveTab('expired')}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              activeTab === 'expired'
                ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/40 shadow-sm'
                : 'border-border bg-card hover:border-border-light'
            }`}
          >
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block">
              หมดอายุแล้ว
            </span>
            <div className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">
              {expiredCount}
            </div>
          </button>

          <button
            onClick={() => setActiveTab('today')}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              activeTab === 'today'
                ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/40 shadow-sm'
                : 'border-border bg-card hover:border-border-light'
            }`}
          >
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 block">
              หมดอายุวันนี้
            </span>
            <div className="text-2xl font-black text-orange-700 dark:text-orange-300 mt-1">
              {todayCount}
            </div>
          </button>

          <button
            onClick={() => setActiveTab('soon')}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              activeTab === 'soon'
                ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/40 shadow-sm'
                : 'border-border bg-card hover:border-border-light'
            }`}
          >
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block">
              ใกล้หมด (1-3 วัน)
            </span>
            <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
              {soonCount}
            </div>
          </button>

          <button
            onClick={() => setActiveTab('fresh')}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              activeTab === 'fresh'
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 shadow-sm'
                : 'border-border bg-card hover:border-border-light'
            }`}
          >
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block">
              ยังสดใหม่ (&gt;3 วัน)
            </span>
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
              {freshCount}
            </div>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่ออาหาร..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted" />
            <select
              value={selectedFridgeId}
              onChange={(e) => setSelectedFridgeId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:outline-none focus:border-primary-500"
            >
              <option value="all">ตู้เย็นทั้งหมด</option>
              {fridges.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon} {f.name}
                </option>
              ))}
            </select>

            {activeTab !== 'all' && (
              <button
                onClick={() => setActiveTab('all')}
                className="text-xs text-primary-600 font-semibold hover:underline px-2"
              >
                ดูทั้งหมด ({batches.length})
              </button>
            )}
          </div>
        </div>

        {/* Expiration List */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : batches.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-7 h-7" />}
            title="ยังไม่มีการระบุวันหมดอายุ"
            description="เมื่อคุณเพิ่มสินค้าและระบุวันหมดอายุ ระบบจะรวบรวมและแจ้งเตือนให้คุณที่นี่"
          />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">
            ไม่พบรายการในหมวดนี้
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <div
                key={b.batchId}
                className="p-4 rounded-2xl border border-border bg-card shadow-sm hover:border-primary-500/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-950/40 text-primary-600 flex items-center justify-center font-bold text-base flex-shrink-0">
                    {b.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                      {b.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mt-0.5">
                      <span className="flex items-center gap-1">
                        <span>{b.fridgeIcon}</span>
                        <span>{b.fridgeName}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>วันหมดอายุ: {b.expiryDate}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-border">
                  {b.daysLeft < 0 ? (
                    <StatusBadge status="expired" label={`หมดอายุมาแล้ว ${Math.abs(b.daysLeft)} วัน`} />
                  ) : b.daysLeft === 0 ? (
                    <StatusBadge status="expiring_soon" label="หมดอายุวันนี้!" />
                  ) : b.daysLeft <= 3 ? (
                    <StatusBadge status="expiring_soon" label={`เหลืออีก ${b.daysLeft} วัน`} />
                  ) : (
                    <StatusBadge status="fresh" label={`เหลืออีก ${b.daysLeft} วัน`} />
                  )}

                  <QuantityStepper
                    itemId={b.itemId}
                    initialQuantity={b.quantity}
                    unit={b.unit}
                    onQuantityChange={() => {
                      fetchBatches();
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
