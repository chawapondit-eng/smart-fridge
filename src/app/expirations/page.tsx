'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SkeletonRow } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuantityStepper } from '@/components/inventory/QuantityStepper';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';
import {
  Clock,
  Calendar,
  Search,
  Filter,
} from 'lucide-react';
import {
  getDaysUntilExpiry,
  formatThaiDate,
  formatExpiryLabel,
  normalizeDateString,
} from '@/lib/date';

interface ExpiryItemWithMeta {
  batchId: string;
  itemId: string;
  fridgeId: string;
  name: string;
  emoji: string;
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

      const { data: itemRows, error: itemError } = await supabase
        .from('items')
        .select('id, name, unit, fridge_id, image_url, quantity')
        .eq('household_id', currentHousehold.id)
        .gt('quantity', 0);

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

      const { data: batchRows, error: batchError } = await supabase
        .from('item_batches')
        .select('id, quantity, expiry_date, item_id')
        .in('item_id', itemIds)
        .not('expiry_date', 'is', null)
        .order('expiry_date', { ascending: true });

      if (batchError) throw batchError;

      if (batchRows) {
        const list: ExpiryItemWithMeta[] = batchRows
          .filter((b) => {
            const it = itemMap.get(b.item_id);
            return Boolean(it) && Number(it?.quantity ?? 0) > 0 && Number(b.quantity) > 0 && Boolean(normalizeDateString(b.expiry_date));
          })
          .map((b) => {
            const it = itemMap.get(b.item_id)!;
            const fr = fridgeMap.get(it.fridge_id);
            const cleanDate = normalizeDateString(b.expiry_date)!;
            const daysLeft = getDaysUntilExpiry(cleanDate) ?? 0;
            const itemName = it.name || 'สินค้า';
            const img = it.image_url;
            const emoji = img && !img.startsWith('http') && !img.startsWith('data:')
              ? img
              : getAutoEmoji(itemName);

            return {
              batchId: b.id,
              itemId: b.item_id,
              fridgeId: it.fridge_id || '',
              name: itemName,
              emoji,
              unit: it.unit || 'ชิ้น',
              quantity: Math.min(Number(b.quantity), Number(it.quantity)),
              expiryDate: cleanDate,
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

  const expiredCount = batches.filter(b => b.daysLeft < 0).length;
  const todayCount = batches.filter(b => b.daysLeft === 0).length;
  const soonCount = batches.filter(b => b.daysLeft > 0 && b.daysLeft <= 3).length;
  const freshCount = batches.filter(b => b.daysLeft > 3).length;

  const filtered = batches.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase());
    const matchFridge = selectedFridgeId === 'all' || b.fridgeId === selectedFridgeId;

    let matchTab = true;
    if (activeTab === 'expired') matchTab = b.daysLeft < 0;
    else if (activeTab === 'today') matchTab = b.daysLeft === 0;
    else if (activeTab === 'soon') matchTab = b.daysLeft > 0 && b.daysLeft <= 3;
    else if (activeTab === 'fresh') matchTab = b.daysLeft > 3;

    return matchSearch && matchFridge && matchTab;
  });

  return (
    <MainLayout>
      <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="font-heading text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <span>จัดการวันหมดอายุ</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1">
              ติดตามและเรียงลำดับอาหารตามวันหมดอายุ เพื่อใช้วัตถุดิบได้ทันเวลา
            </p>
          </div>
          {activeTab !== 'all' && (
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className="self-start sm:self-auto px-3.5 py-1.5 rounded-full bg-primary-100 text-primary-700 dark:text-primary-200 text-xs font-semibold border border-primary-600/20 hover:bg-primary-200/70 transition cursor-pointer"
            >
              ดูทั้งหมด ({batches.length}) ✕
            </button>
          )}
        </div>

        {/* 4 Summary Filter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'expired' ? 'all' : 'expired')}
            className={`p-4 rounded-[20px] border text-left transition-all cursor-pointer shadow-[var(--shadow-xs)] ${
              activeTab === 'expired'
                ? 'border-rose-500 bg-rose-500/12 ring-2 ring-rose-500/20'
                : 'border-border bg-card hover:bg-surface-container-low'
            }`}
          >
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block">
              หมดอายุแล้ว
            </span>
            <div className="font-heading text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1 tabular-nums">
              {expiredCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'today' ? 'all' : 'today')}
            className={`p-4 rounded-[20px] border text-left transition-all cursor-pointer shadow-[var(--shadow-xs)] ${
              activeTab === 'today'
                ? 'border-amber-600 bg-amber-500/15 ring-2 ring-amber-500/20'
                : 'border-border bg-card hover:bg-surface-container-low'
            }`}
          >
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 block">
              หมดอายุวันนี้
            </span>
            <div className="font-heading text-2xl font-bold text-amber-800 dark:text-amber-200 mt-1 tabular-nums">
              {todayCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'soon' ? 'all' : 'soon')}
            className={`p-4 rounded-[20px] border text-left transition-all cursor-pointer shadow-[var(--shadow-xs)] ${
              activeTab === 'soon'
                ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20'
                : 'border-border bg-card hover:bg-surface-container-low'
            }`}
          >
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block">
              ใกล้หมด (1-3 วัน)
            </span>
            <div className="font-heading text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
              {soonCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'fresh' ? 'all' : 'fresh')}
            className={`p-4 rounded-[20px] border text-left transition-all cursor-pointer shadow-[var(--shadow-xs)] ${
              activeTab === 'fresh'
                ? 'border-primary-600 bg-primary-100 ring-2 ring-primary-600/20'
                : 'border-border bg-card hover:bg-surface-container-low'
            }`}
          >
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-300 block">
              ยังสดใหม่ (&gt;3 วัน)
            </span>
            <div className="font-heading text-2xl font-bold text-primary-700 dark:text-primary-200 mt-1 tabular-nums">
              {freshCount}
            </div>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="ds-input relative flex-1 max-w-md shadow-[var(--shadow-xs)]">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่ออาหาร..."
              className="w-full pl-10 pr-4 py-2.5 bg-transparent text-sm text-foreground outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted" />
            <select
              value={selectedFridgeId}
              onChange={(e) => setSelectedFridgeId(e.target.value)}
              className="ds-input px-3.5 py-2 text-xs font-semibold text-foreground cursor-pointer"
            >
              <option value="all">ตู้เย็นทั้งหมด</option>
              {fridges.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon} {f.name}
                </option>
              ))}
            </select>
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
          <div className="ds-card py-12 text-center text-sm text-muted">
            ไม่พบรายการในหมวดนี้
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filtered.map((b) => (
              <div
                key={b.batchId}
                className="ds-card p-4 hover:border-primary-400/50 transition flex flex-col justify-between gap-3.5"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-surface-container border border-border flex items-center justify-center text-2xl shrink-0">
                    <span>{b.emoji}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-sm sm:text-base font-semibold text-foreground truncate">
                      {b.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mt-0.5">
                      <span className="flex items-center gap-1">
                        <span>{b.fridgeIcon}</span>
                        <span>{b.fridgeName}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>หมดอายุ: {formatThaiDate(b.expiryDate)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  {b.daysLeft < 0 ? (
                    <StatusBadge status="expired" label={formatExpiryLabel(b.daysLeft)} />
                  ) : b.daysLeft === 0 ? (
                    <StatusBadge status="expiring_soon" label={formatExpiryLabel(b.daysLeft)} />
                  ) : b.daysLeft <= 3 ? (
                    <StatusBadge status="expiring_soon" label={formatExpiryLabel(b.daysLeft)} />
                  ) : (
                    <StatusBadge status="fresh" label={formatExpiryLabel(b.daysLeft)} />
                  )}

                  <QuantityStepper
                    itemId={b.itemId}
                    itemName={b.name}
                    fridgeId={b.fridgeId}
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
