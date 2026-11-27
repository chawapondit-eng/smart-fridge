'use client';

import React from 'react';
import { X, Receipt, ShoppingBag } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-lg)] relative max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-base sm:text-lg text-foreground">
              ประวัติค่าใช้จ่ายวัตถุดิบ
            </h3>
            <p className="text-xs text-muted">
              {householdName} • รวมทั้งหมด {history.length} รายการ
            </p>
          </div>
        </div>

        {/* Summary Mini Bar */}
        <div className="p-4 rounded-2xl bg-surface-container border border-border flex items-center justify-between mb-4 shrink-0">
          <div>
            <span className="text-[11px] text-muted block">ยอดใช้จ่ายสัปดาห์นี้</span>
            <span className="font-heading font-bold text-lg text-foreground tabular-nums">
              ฿{weeklySpent.toLocaleString()}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-muted block">งบประมาณที่ตั้งไว้</span>
            <span className="font-heading font-bold text-lg text-primary-600 dark:text-primary-400 tabular-nums">
              ฿{totalBudget.toLocaleString()}
            </span>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-0">
          {history.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs space-y-2.5">
              <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center mx-auto text-muted">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <p className="font-semibold text-sm text-foreground">ยังไม่มีประวัติการบันทึกค่าใช้จ่าย</p>
              <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
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
                  className="p-3.5 rounded-2xl border border-border bg-surface-container-low hover:bg-card transition flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-surface-container text-foreground flex items-center justify-center shrink-0 text-base">
                        🏪
                      </div>
                      <div className="min-w-0">
                        <span className="font-heading font-semibold text-sm text-foreground block truncate">
                          {record.store_name}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted flex-wrap">
                          <span>{dateStr ? formatThaiDate(dateStr) : ''}</span>
                          {timeStr && <span>• {timeStr} น.</span>}
                          {record.user_name && <span>• โดย {record.user_name}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-heading font-bold text-sm text-primary-600 dark:text-primary-400 block tabular-nums">
                        ฿{record.total_price.toLocaleString()}
                      </span>
                      {record.items_count !== undefined && (
                        <span className="text-[10px] text-muted">
                          {record.items_count} รายการ
                        </span>
                      )}
                    </div>
                  </div>

                  {record.items && record.items.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-border/60">
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
            className="px-5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-foreground font-semibold text-xs transition cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
