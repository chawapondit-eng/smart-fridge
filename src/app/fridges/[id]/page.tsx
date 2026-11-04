'use client';

import React, { useState, useEffect, useCallback, use, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { createClient } from '@/lib/supabase/client';
import { QuantityStepper } from '@/components/inventory/QuantityStepper';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { AddProductModal } from '@/components/inventory/AddProductModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SkeletonRow } from '@/components/ui/LoadingSkeleton';
import { EditProductModal, getAutoEmoji } from '@/components/inventory/EditProductModal';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Plus,
  Receipt,
  Search,
  Calendar,
  Trash2,
  Edit2,
  Package,
} from 'lucide-react';
import type { Item, ItemBatch } from '@/types/database';

interface ItemWithBatches extends Item {
  item_batches?: ItemBatch[];
}

function FridgeDetailContent({ fridgeId }: { fridgeId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { fridges, currentHousehold, authUser, user } = useHousehold();

  const currentFridge = fridges.find((f) => f.id === fridgeId);

  const [items, setItems] = useState<ItemWithBatches[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemWithBatches | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!fridgeId) return;
    setLoading(true);
    try {
      // ตรวจสอบสิทธิ์ว่าผู้ใช้ยังอยู่ในครัวเรือนของตู้เย็นนี้หรือไม่
      if (authUser?.id) {
        const { data: fridgeData } = await supabase
          .from('fridges')
          .select('household_id')
          .eq('id', fridgeId)
          .maybeSingle();

        if (fridgeData?.household_id) {
          const { data: memberCheck } = await supabase
            .from('household_members')
            .select('user_id')
            .eq('household_id', fridgeData.household_id)
            .eq('user_id', authUser.id)
            .maybeSingle();

          if (!memberCheck) {
            setItems([]);
            toast.error('คุณไม่ได้เป็นสมาชิกของครัวเรือนนี้แล้ว');
            router.push('/');
            return;
          }
        }
      }

      // 1. ดึงรายการสินค้าในตู้เย็นนี้โดยตรง
      const { data: itemRows, error: itemError } = await supabase
        .from('items')
        .select('*')
        .eq('fridge_id', fridgeId)
        .order('created_at', { ascending: false });

      if (itemError) {
        if (itemError.code === 'PGRST205' || itemError.message?.includes('schema cache')) {
          setItems([]);
          return;
        }
        throw itemError;
      }

      if (!itemRows || itemRows.length === 0) {
        setItems([]);
        return;
      }

      // 2. ดึง batches ของสินค้าเหล่านี้อย่างปลอดภัย
      const itemIds = itemRows.map((i) => i.id);
      const batchMap = new Map<string, ItemBatch[]>();

      try {
        const { data: batchRows } = await supabase
          .from('item_batches')
          .select('*')
          .in('item_id', itemIds);

        if (batchRows) {
          for (const b of batchRows as ItemBatch[]) {
            const arr = batchMap.get(b.item_id) || [];
            arr.push(b);
            batchMap.set(b.item_id, arr);
          }
        }
      } catch (bErr) {
        console.warn('item_batches fetch skipped/failed:', bErr);
      }

      const combined: ItemWithBatches[] = itemRows.map((i) => ({
        ...i,
        item_batches: batchMap.get(i.id) || [],
      }));

      setItems(combined);
    } catch (err) {
      console.error('Error fetching fridge items:', (err as { message?: string })?.message || err);
    } finally {
      setLoading(false);
    }
  }, [fridgeId, authUser?.id, router, supabase]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleDeleteItemConfirm() {
    if (!deletingItem || !currentHousehold?.id || !authUser?.id) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', deletingItem.id);

      if (error) throw error;

      try {
        const currentUserName = user?.display_name || authUser?.email?.split('@')[0] || 'สมาชิก';
        await supabase.from('activity_logs').insert({
          household_id: currentHousehold.id,
          fridge_id: fridgeId,
          item_id: deletingItem.id,
          user_id: authUser.id,
          action: 'item_removed',
          details: {
            user_name: currentUserName,
            item_name: deletingItem.name,
            quantity: deletingItem.quantity,
            unit: deletingItem.unit,
          },
        });
      } catch {
        // ignore
      }

      toast.success(`ลบ "${deletingItem.name}" แล้ว`);
      setDeletingItem(null);
      fetchItems();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ลบสินค้าไม่สำเร็จ';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      selectedStatus === 'all'
        ? true
        : selectedStatus === 'out'
        ? Number(item.quantity) === 0
        : selectedStatus === 'low'
        ? Number(item.quantity) > 0 && Number(item.quantity) <= 1
        : Number(item.quantity) > 1;

    return matchSearch && matchStatus;
  });

  return (
    <MainLayout>
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Top Breadcrumb & Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/fridges')}
            className="p-2 rounded-xl border border-border bg-card hover:bg-muted/10 text-muted hover:text-foreground transition"
            title="กลับไปหน้ารายการตู้เย็น"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{currentFridge?.icon || '❄️'}</span>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {currentFridge?.name || 'ตู้เย็น'}
              </h1>
            </div>
            <p className="text-xs text-muted mt-0.5">
              อาหารและของสดทั้งหมด {items.length} รายการ
            </p>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่ออาหารในตู้นี้..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
            />
          </div>

          {/* Quick Buttons */}
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              onClick={() => setShowAddProduct(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] shadow-sm shadow-primary-600/25 transition"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มสินค้า</span>
            </button>
            <Link
              href="/receipts"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-medium text-sm text-foreground bg-card hover:bg-muted/10 border border-border transition"
            >
              <Receipt className="w-4 h-4 text-primary-600" />
              <span className="hidden sm:inline">สแกนใบเสร็จ</span>
            </Link>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-card border border-border p-1 text-xs">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                selectedStatus === 'all'
                  ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 font-semibold'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              ทั้งหมด ({items.length})
            </button>
            <button
              onClick={() => setSelectedStatus('in_stock')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                selectedStatus === 'in_stock'
                  ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 font-semibold'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              มีของ ({items.filter((i) => Number(i.quantity) > 1).length})
            </button>
            <button
              onClick={() => setSelectedStatus('low')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                selectedStatus === 'low'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 font-semibold'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              ใกล้หมด ({items.filter((i) => Number(i.quantity) === 1).length})
            </button>
            <button
              onClick={() => setSelectedStatus('out')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                selectedStatus === 'out'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              หมดแล้ว ({items.filter((i) => Number(i.quantity) === 0).length})
            </button>
          </div>
        </div>

        {/* Inventory List */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="w-7 h-7" />}
            title="ยังไม่มีสินค้าในตู้เย็นนี้"
            description="กดปุ่ม 'เพิ่มสินค้า' เพื่อใส่ของสด เครื่องดื่ม หรืออาหารชิ้นแรก"
            action={{
              label: 'เพิ่มสินค้าแรก',
              icon: <Plus className="w-4 h-4" />,
              onClick: () => setShowAddProduct(true),
            }}
          />
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">
            ไม่พบสินค้าที่ตรงกับเงื่อนไขการค้นหา
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredItems.map((item) => {
              const qty = Number(item.quantity);
              // วันหมดอายุเร็วสุดจาก Batches
              const earliestBatch = item.item_batches?.find((b) => b.expiry_date);
              const expiryDate = earliestBatch?.expiry_date;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border bg-card shadow-sm hover:border-primary-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    qty === 0 ? 'opacity-65 border-border/60' : 'border-border'
                  }`}
                >
                  {/* Left: Product Info */}
                  <div
                    className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer group"
                    onClick={() => setEditingItem(item)}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-950/40 text-primary-600 flex items-center justify-center text-base font-bold flex-shrink-0 shadow-inner overflow-hidden border border-primary-500/15 group-hover:border-primary-500/40 group-hover:scale-105 transition">
                      {item.image_url?.startsWith('data:image') || item.image_url?.startsWith('http') ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">{item.image_url || getAutoEmoji(item.name)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-foreground truncate group-hover:text-primary-600 transition">
                          {item.name}
                        </h3>
                        {qty === 0 ? (
                          <StatusBadge status="out_of_stock" />
                        ) : qty <= 1 ? (
                          <StatusBadge status="low_stock" />
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mt-1">
                        {expiryDate ? (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <Calendar className="w-3 h-3" />
                            <span>หมดอายุ: {expiryDate}</span>
                          </span>
                        ) : (
                          <span>ไม่มีวันหมดอายุ</span>
                        )}

                        {item.notes && (
                          <span className="truncate max-w-xs text-muted-light">
                            • {item.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quantity Stepper & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-border">
                    {/* Stepper (+ / -) */}
                    <QuantityStepper
                      itemId={item.id}
                      itemName={item.name}
                      fridgeId={fridgeId}
                      initialQuantity={qty}
                      unit={item.unit}
                      onQuantityChange={(newQty) => {
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id ? { ...it, quantity: newQty } : it
                          )
                        );
                      }}
                    />

                    {/* Edit Item Button */}
                    <button
                      onClick={() => setEditingItem(item)}
                      className="p-2 rounded-xl text-muted hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition"
                      title="แก้ไขข้อมูลและรูปภาพสินค้า"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Delete Item Button */}
                    <button
                      onClick={() => setDeletingItem(item)}
                      className="p-2 rounded-xl text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      title="ลบสินค้านี้"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Product Modal */}
      <EditProductModal
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        onSuccess={fetchItems}
      />

      {/* Add Product Modal */}
      <AddProductModal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        defaultFridgeId={fridgeId}
        onSuccess={fetchItems}
      />

      {/* Delete Item Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingItem)}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDeleteItemConfirm}
        title="ยืนยันการลบสินค้า"
        description={`คุณแน่ใจหรือไม่ว่าต้องการลบ "${deletingItem?.name}" ออกจากตู้เย็น?`}
        confirmLabel="ลบสินค้า"
        isDanger
        loading={deleting}
      />
    </MainLayout>
  );
}

export default function FridgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-3 border-primary-600/20 border-t-primary-600 rounded-full animate-spin" />
        </div>
      }
    >
      <FridgeDetailContent fridgeId={resolvedParams.id} />
    </Suspense>
  );
}
