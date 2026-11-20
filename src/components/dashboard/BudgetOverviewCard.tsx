'use client';

import React, { useState } from 'react';
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Receipt,
  ArrowRight,
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
    receiptCount,
    isOverBudget,
    isNearLimit,
    overBudgetAmount,
    history,
  } = summary;

  // กำหนดสีของแถบความคืบหน้า (Progress Bar)
  const progressBarColor = isOverBudget
    ? 'bg-rose-500'
    : isNearLimit
    ? 'bg-amber-500'
    : 'bg-primary-500';

  const progressPercent = Math.min(100, Math.max(0, percentUsed));

  return (
    <>
      <section className="p-5 sm:p-6 rounded-3xl bg-surface-container-lowest border border-border shadow-xs flex flex-col gap-5">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-bold text-base sm:text-lg text-foreground">
                  ภาพรวมงบประมาณ
                </h2>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="p-1 rounded-lg text-muted hover:text-primary-600 hover:bg-surface-container transition cursor-pointer"
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

          {/* Action: ดูประวัติค่าใช้จ่าย */}
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high border border-border text-foreground text-xs font-semibold transition active:scale-95 cursor-pointer shrink-0"
          >
            <Receipt className="w-3.5 h-3.5 text-primary-600" />
            <span>ประวัติ</span>
          </button>
        </div>

        {/* 3 Core Numbers: จัดวางสมดุลในแนวระนาบเดียวกันทั้ง 3 คอลัมน์ */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface-container-low border border-border/70">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            {/* แถวที่ 1: หัวข้อทั้ง 3 คอลัมน์ (ความสูงเท่ากัน ยึดแนวระนาบเดียวกัน) */}
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

            {/* แถวที่ 2: ตัวเลขทั้ง 3 คอลัมน์ (อยู่บนเส้นบรรทัดและระนาบเดียวกัน 100% ขนาดตัวเลขเท่ากัน) */}
            <div className="flex items-center justify-center min-w-0 px-0.5">
              <span className="font-heading font-extrabold text-base sm:text-xl text-foreground truncate tracking-tight">
                ฿{budget.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-center min-w-0 px-0.5">
              <span className="font-heading font-extrabold text-base sm:text-xl text-foreground truncate tracking-tight">
                ฿{totalSpent.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-center min-w-0 px-0.5">
              <span
                className={`font-heading font-extrabold text-base sm:text-xl truncate tracking-tight ${
                  isOverBudget
                    ? 'text-rose-500'
                    : isNearLimit
                    ? 'text-amber-500'
                    : 'text-emerald-500 dark:text-emerald-400 font-black'
                }`}
              >
                ฿{remaining.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar (สะอาด เรียบง่าย ไม่แสดงตัวเลขซ้ำ) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-medium">สัดส่วนการใช้เงิน</span>
            <span className="font-bold text-foreground">{percentUsed}%</span>
          </div>

          {/* Solid Smooth Progress Bar */}
          <div className="w-full bg-surface-container rounded-full h-2.5 overflow-hidden p-0.5 border border-border/50">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${progressBarColor}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Dynamic Budget Alert Banner (แสดงเฉพาะเมื่อใกล้หมดหรือเกินงบเท่านั้น ไม่แสดงข้อความซ้ำซาก) */}
          {isOverBudget ? (
            <div className="mt-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              <span>
                <strong>แจ้งเตือน:</strong> ใช้งบประมาณเกินไป ฿{overBudgetAmount.toLocaleString()} ({percentUsed}%)
              </span>
            </div>
          ) : isNearLimit ? (
            <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>แจ้งเตือน:</strong> ใช้จ่ายใกล้เต็มงบแล้ว ({percentUsed}%)
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Edit Budget Modal */}
      <EditBudgetModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        householdId={householdId}
        currentBudget={budget}
        onSuccess={(newBudget) => {
          onBudgetUpdated(newBudget);
        }}
      />

      {/* Expense History Modal */}
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
