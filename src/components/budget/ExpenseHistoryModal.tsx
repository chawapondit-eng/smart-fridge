'use client';

import React from 'react';
import { X, Receipt, ShoppingBag, Calendar, Store, ArrowUpRight, DollarSign } from 'lucide-react';
import type { ExpenseRecord } from '@/lib/budget';
import { formatThaiDate } from '@/lib/date';

interface ExpenseHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  householdName: string;
  history: ExpenseRecord[];
  weeklySpent: number;
  totalBudget: number;
}

export function ExpenseHistoryModal({
  isOpen,
  onClose,
  householdName,
  history,
  weeklySpent,
  totalBudget,
}: ExpenseHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl relative max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-muted hover:text-foreground hover:bg-muted/10 transition cursor-pointer"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-base sm:text-lg text-foreground">
              ประวัติค่าใช้จ่ายวัตถุดิบ
            </h3>
            <p className="text-xs text-muted">
              {householdName} • รวมทั้งหมด {history.length} รายการ
            </p>
          </div>
        </div>

        {/* Summary Mini Bar */}
        <div className="p-3.5 rounded-2xl bg-surface-container-low border border-border flex items-center justify-between mb-4 shrink-0">
          <div>
            <span className="text-[11px] text-muted block">ยอดใช้จ่ายสัปดาห์นี้</span>
            <span className="font-heading font-bold text-base text-foreground">
              ฿{weeklySpent.toLocaleString()}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-muted block">งบประมาณที่ตั้งไว้</span>
            <span className="font-heading font-bold text-base text-primary-600">
              ฿{totalBudget.toLocaleString()}
            </span>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-0 divide-y divide-border/50">
          {history.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto text-muted/60" />
              <p className="font-semibold text-foreground">ยังไม่มีประวัติการบันทึกค่าใช้จ่าย</p>
              <p className="text-[11px] text-muted">
                เมื่อคุณสแกนใบเสร็จด้วย AI ยอดใช้จ่ายและรายการสินค้าจะถูกบันทึกที่นี่โดยอัตโนมัติ
              </p>
            </div>
          ) : (
            history.map((record) => {
              const dateStr = record.created_at ? record.created_at.split('T')[0] : '';
              const timeStr = record.created_at
                ? new Date(record.created_at).toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              return (
                <div
                  key={record.id}
                  className="pt-2.5 first:pt-0 flex flex-col gap-1.5 p-3 rounded-2xl hover:bg-surface-container-low transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-surface-container text-foreground flex items-center justify-center shrink-0 text-sm">
                        🏪
                      </div>
                      <div className="min-w-0">
                        <span className="font-heading font-bold text-sm text-foreground block truncate">
                          {record.store_name}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                          <span>{dateStr ? formatThaiDate(dateStr) : ''}</span>
                          {timeStr && <span>• {timeStr} น.</span>}
                          {record.user_name && <span>• โดย {record.user_name}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-heading font-bold text-sm text-primary-600 dark:text-primary-400 block">
                        ฿{record.total_price.toLocaleString()}
                      </span>
                      {record.items_count !== undefined && (
                        <span className="text-[10px] text-muted">
                          {record.items_count} รายการ
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Item preview chips if available */}
                  {record.items && record.items.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                      {record.items.slice(0, 4).map((it, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-lg bg-surface-container text-[10px] text-muted font-medium whitespace-nowrap"
                        >
                          {it.name} {it.price ? `(฿${it.price})` : ''}
                        </span>
                      ))}
                      {record.items.length > 4 && (
                        <span className="text-[10px] text-muted">
                          +{record.items.length - 4} อื่นๆ
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-border mt-3 text-right shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-foreground font-semibold text-xs transition cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
