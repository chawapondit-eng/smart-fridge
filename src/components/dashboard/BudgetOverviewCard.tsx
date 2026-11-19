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
                  ภาพรวมงบประมาณ (Budget Overview)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="p-1 rounded-lg text-muted hover:text-primary-600 hover:bg-surface-container transition cursor-pointer"
                  title="กำหนดงบประมาณบ้าน"
                  aria-label="แก้ไขงบประมาณ"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted">
                งบค่าอาหารประจำสัปดาห์ของ &quot;{householdName}&quot;
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
            <span className="hidden sm:inline">ประวัติค่าใช้จ่าย</span>
            <span className="sm:hidden">ประวัติ</span>
          </button>
        </div>

        {/* 4 Core Numbers Row: เรียบง่าย เน้นตัวเลขสำคัญชัดเจน */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 p-4 rounded-2xl bg-surface-container-low border border-border/70">
          {/* 1. งบประมาณที่ตั้งไว้ */}
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-muted">งบประมาณทั้งหมด</span>
            <span className="font-heading font-extrabold text-xl sm:text-2xl text-foreground mt-0.5">
              ฿{budget.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="text-[10px] text-primary-600 hover:underline mt-0.5 text-left font-medium"
            >
              แก้ไขงบ
            </button>
          </div>

          {/* 2. ใช้จ่ายไปแล้ว */}
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-muted">ใช้จ่ายไปแล้ว</span>
            <span className="font-heading font-extrabold text-xl sm:text-2xl text-foreground mt-0.5">
              ฿{totalSpent.toLocaleString()}
            </span>
            <span className="text-[10px] text-muted mt-0.5">
              จาก {receiptCount} ใบเสร็จ/รายการ
            </span>
          </div>

          {/* 3. คงเหลือ */}
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-muted">คงเหลือ</span>
            <span
              className={`font-heading font-extrabold text-xl sm:text-2xl mt-0.5 ${
                isOverBudget
                  ? 'text-rose-500'
                  : isNearLimit
                  ? 'text-amber-500'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              ฿{remaining.toLocaleString()}
            </span>
            <span className="text-[10px] text-muted mt-0.5">
              {isOverBudget ? `(เกิน ฿${overBudgetAmount.toLocaleString()})` : 'พร้อมใช้จ่าย'}
            </span>
          </div>

          {/* 4. สัดส่วนที่ใช้ไป */}
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-muted">สัดส่วนที่ใช้ไป</span>
            <span
              className={`font-heading font-extrabold text-xl sm:text-2xl mt-0.5 ${
                isOverBudget
                  ? 'text-rose-500'
                  : isNearLimit
                  ? 'text-amber-500'
                  : 'text-primary-600'
              }`}
            >
              {percentUsed}%
            </span>
            <span className="text-[10px] text-muted mt-0.5">
              {isOverBudget ? 'เกินเป้าหมาย' : 'ของงบสัปดาห์นี้'}
            </span>
          </div>
        </div>

        {/* Progress Bar & Alert Banner */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted font-medium">ความคืบหน้าการใช้งบประมาณ:</span>
            <span className="font-bold text-foreground">
              ฿{totalSpent.toLocaleString()} / ฿{budget.toLocaleString()}
            </span>
          </div>

          {/* Solid Smooth Progress Bar */}
          <div className="w-full bg-surface-container rounded-full h-3 overflow-hidden p-0.5 border border-border/50">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${progressBarColor}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Dynamic Budget Alert Banner */}
          {isOverBudget ? (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-200 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              <div className="flex-1 font-medium">
                <strong>แจ้งเตือน: ใช้งบประมาณเกินเป้าหมายแล้ว!</strong> ใช้เกินไป ฿
                {overBudgetAmount.toLocaleString()} ({percentUsed}% ของงบที่ตั้งไว้)
              </div>
            </div>
          ) : isNearLimit ? (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1 font-medium">
                <strong>แจ้งเตือน: ใช้จ่ายใกล้เต็มงบแล้ว ({percentUsed}%)</strong> เหลือเงินใช้ได้อีก ฿
                {remaining.toLocaleString()} สำหรับสัปดาห์นี้
              </div>
            </div>
          ) : (
            <div className="p-2.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>การใช้จ่ายอยู่ในเกณฑ์ควบคุมได้ดีมาก (เหลือ ฿{remaining.toLocaleString()})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>ดูประวัติ</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
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
