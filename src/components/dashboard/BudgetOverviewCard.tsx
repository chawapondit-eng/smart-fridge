'use client';

import React, { useState } from 'react';
import {
  Wallet,
  AlertTriangle,
  Edit2,
  Receipt,
  ShieldAlert,
} from 'lucide-react';
import type { WeeklyBudgetSummary } from '@/lib/budget';
import { EditBudgetModal } from '@/components/budget/EditBudgetModal';
import { ExpenseHistoryModal } from '@/components/budget/ExpenseHistoryModal';

interface BudgetOverviewCardProps {
  summary: WeeklyBudgetSummary;
  householdId: string;
  householdName: string;
  onBudgetUpdated: (newBudget: number) => void;
}

export function BudgetOverviewCard({
  summary,
  householdId,
  householdName,
  onBudgetUpdated,
}: BudgetOverviewCardProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const {
    budget,
    totalSpent,
    remaining,
    percentUsed,
    isOverBudget,
    isNearLimit,
    overBudgetAmount,
    history,
  } = summary;

  const progressBarColor = isOverBudget
    ? 'bg-rose-500'
    : isNearLimit
    ? 'bg-amber-500'
    : 'bg-primary-600';

  const progressPercent = Math.min(100, Math.max(0, percentUsed));

  return (
    <>
      <section className="ds-card p-5 sm:p-6 flex flex-col justify-between gap-5">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-heading font-semibold text-base sm:text-lg text-foreground">
                  ภาพรวมงบประมาณ
                </h2>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="p-1.5 rounded-lg text-muted hover:text-primary-600 hover:bg-primary-100/70 transition cursor-pointer"
                  title="แก้ไขงบประมาณ"
                  aria-label="แก้ไขงบประมาณ"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted">
                งบค่าอาหารประจำสัปดาห์
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-foreground text-xs font-semibold transition active:scale-95 cursor-pointer shrink-0"
          >
            <Receipt className="w-3.5 h-3.5 text-primary-600" />
            <span>ประวัติ</span>
          </button>
        </div>

        {/* 3 Core Numbers */}
        <div className="p-4 rounded-2xl bg-surface-container-low border border-border">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div className="flex items-end justify-center min-h-[30px] sm:min-h-[24px] pb-1 px-0.5">
              <span className="text-[11px] sm:text-xs font-medium text-muted leading-tight">
                งบประมาณทั้งหมด
              </span>
            </div>
            <div className="flex items-end justify-center min-h-[30px] sm:min-h-[24px] pb-1 px-0.5">
              <span className="text-[11px] sm:text-xs font-medium text-muted leading-tight">
                ใช้จ่ายไปแล้ว
              </span>
            </div>
            <div className="flex items-end justify-center min-h-[30px] sm:min-h-[24px] pb-1 px-0.5">
              <span className="text-[11px] sm:text-xs font-medium text-muted leading-tight">
                คงเหลือ
              </span>
            </div>

            <div className="flex items-center justify-center min-w-0 px-0.5">
              <span className="font-heading font-bold text-base sm:text-xl text-foreground truncate tabular-nums">
                ฿{budget.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-center min-w-0 px-0.5">
              <span className="font-heading font-bold text-base sm:text-xl text-foreground truncate tabular-nums">
                ฿{totalSpent.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-center min-w-0 px-0.5">
              <span
                className={`font-heading font-bold text-base sm:text-xl truncate tabular-nums ${
                  isOverBudget
                    ? 'text-rose-600 dark:text-rose-400'
                    : isNearLimit
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-primary-600 dark:text-primary-400'
                }`}
              >
                ฿{remaining.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-medium">สัดส่วนการใช้เงิน</span>
            <span className="font-semibold text-foreground tabular-nums">{percentUsed}%</span>
          </div>

          <div className="w-full bg-surface-container rounded-full h-2.5 overflow-hidden p-0.5 border border-border">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${progressBarColor}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {isOverBudget ? (
            <div className="mt-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              <span>
                <strong>แจ้งเตือน:</strong> ใช้งบประมาณเกินไป ฿{overBudgetAmount.toLocaleString()} ({percentUsed}%)
              </span>
            </div>
          ) : isNearLimit ? (
            <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>แจ้งเตือน:</strong> ใช้จ่ายใกล้เต็มงบแล้ว ({percentUsed}%)
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <EditBudgetModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        householdId={householdId}
        currentBudget={budget}
        onSuccess={(newBudget) => {
          onBudgetUpdated(newBudget);
        }}
      />

      <ExpenseHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        householdName={householdName}
        history={history}
        weeklySpent={totalSpent}
        totalBudget={budget}
      />
    </>
  );
}
