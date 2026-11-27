'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

interface SmartHealthDonutCardProps {
  totalItems: number;
  freshItems: number;
  expiringSoonItems: number;
  expiredItems: number;
  fridgeCount: number;
}

export function SmartHealthDonutCard({
  totalItems,
  freshItems,
  expiringSoonItems,
  expiredItems,
  fridgeCount,
}: SmartHealthDonutCardProps) {
  const freshPercent =
    totalItems > 0
      ? Math.round((freshItems / totalItems) * 100)
      : 100;

  const statusLabel =
    totalItems === 0
      ? 'ยังไม่มีวัตถุดิบในตู้'
      : expiredItems > 0
      ? 'มีของหมดอายุควรเคลียร์'
      : expiringSoonItems > 0
      ? 'มีของใกล้หมดอายุควรใช้'
      : 'ยังสดใหม่พร้อมปรุง';

  const RADIUS = 68;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const freshShare = totalItems > 0 ? freshItems / totalItems : 1;
  const expiringShare = totalItems > 0 ? expiringSoonItems / totalItems : 0;
  const expiredShare = totalItems > 0 ? expiredItems / totalItems : 0;

  const freshStroke = freshShare * CIRCUMFERENCE;
  const expiringStroke = expiringShare * CIRCUMFERENCE;
  const expiredStroke = expiredShare * CIRCUMFERENCE;

  const freshOffset = 0;
  const expiringOffset = -freshStroke;
  const expiredOffset = -(freshStroke + expiringStroke);

  return (
    <section className="ds-card p-5 sm:p-6 flex flex-col justify-between gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading font-semibold text-base sm:text-lg text-foreground">
            ความสดใหม่ของวัตถุดิบ
          </h2>
          <p className="text-xs text-muted mt-0.5">
            ภาพรวมความสดใหม่และวันหมดอายุของวัตถุดิบทั้งหมดในบ้าน
          </p>
        </div>
        <Link
          href="/expirations"
          className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
          title="ดูรายละเอียดวันหมดอายุ"
        >
          <MoreHorizontal className="w-5 h-5" />
        </Link>
      </div>

      {/* Donut Chart Centerpiece */}
      <div className="flex flex-col items-center justify-center py-1">
        <div className="relative w-44 h-44 sm:w-48 sm:h-48 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r={RADIUS}
              className="text-surface-container stroke-current"
              strokeWidth="14"
              fill="transparent"
            />

            {/* Arc 1: สดใหม่ (Semantic Fresh Emerald #16a34a) */}
            {freshItems > 0 || totalItems === 0 ? (
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                stroke="#16a34a"
                strokeWidth="14"
                strokeDasharray={`${freshStroke} ${CIRCUMFERENCE}`}
                strokeDashoffset={freshOffset}
                strokeLinecap={totalItems === freshItems ? 'round' : 'butt'}
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            ) : null}

            {/* Arc 2: ใกล้หมดอายุ (Soft Warm Amber #D18E24) */}
            {expiringSoonItems > 0 && (
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                stroke="#D18E24"
                strokeWidth="14"
                strokeDasharray={`${expiringStroke} ${CIRCUMFERENCE}`}
                strokeDashoffset={expiringOffset}
                strokeLinecap="butt"
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            )}

            {/* Arc 3: หมดอายุ (Organic Terracotta Rose #C9524B) */}
            {expiredItems > 0 && (
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                stroke="#C9524B"
                strokeWidth="14"
                strokeDasharray={`${expiredStroke} ${CIRCUMFERENCE}`}
                strokeDashoffset={expiredOffset}
                strokeLinecap="butt"
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            )}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <span className="font-heading font-bold text-3xl sm:text-4xl text-foreground tracking-tight tabular-nums">
              {totalItems === 0 ? '100%' : `${freshPercent}%`}
            </span>
            <span
              className={`text-[11px] font-semibold mt-1 px-2.5 py-0.5 rounded-full ${
                expiredItems > 0
                  ? 'text-rose-700 dark:text-rose-300 bg-rose-500/12'
                  : expiringSoonItems > 0
                  ? 'text-amber-800 dark:text-amber-300 bg-amber-500/12'
                  : 'text-primary-700 dark:text-primary-300 bg-primary-100'
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Compact Status Chips in 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <Link
          href="/fridges"
          className="p-3 sm:p-3.5 rounded-2xl bg-surface-container-low hover:bg-surface-container border border-border flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-surface-container text-foreground flex items-center justify-center text-sm shrink-0">
              🎯
            </span>
            <span className="text-xs font-semibold text-foreground">ทั้งหมด</span>
          </div>
          <span className="font-heading font-bold text-base sm:text-lg text-foreground group-hover:text-primary-600 transition tabular-nums">
            {totalItems}
          </span>
        </Link>

        <Link
          href="/fridges"
          className="p-3 sm:p-3.5 rounded-2xl bg-primary-100/75 hover:bg-primary-100 border border-primary-600/20 flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-card text-primary-600 flex items-center justify-center text-sm shrink-0 shadow-[var(--shadow-xs)]">
              🥦
            </span>
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-200">
              ยังสดใหม่
            </span>
          </div>
          <span className="font-heading font-bold text-base sm:text-lg text-primary-700 dark:text-primary-200 tabular-nums">
            {freshItems}
          </span>
        </Link>

        <Link
          href="/expirations"
          className="p-3 sm:p-3.5 rounded-2xl bg-amber-500/8 hover:bg-amber-500/14 border border-amber-500/20 flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center text-sm shrink-0">
              ⌛
            </span>
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              ใกล้หมด
            </span>
          </div>
          <span className="font-heading font-bold text-base sm:text-lg text-amber-700 dark:text-amber-400 tabular-nums">
            {expiringSoonItems}
          </span>
        </Link>

        <Link
          href="/expirations"
          className="p-3 sm:p-3.5 rounded-2xl bg-rose-500/8 hover:bg-rose-500/14 border border-rose-500/20 flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-rose-500/15 text-rose-700 flex items-center justify-center text-sm shrink-0">
              ⚠️
            </span>
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              หมดอายุ
            </span>
          </div>
          <span className="font-heading font-bold text-base sm:text-lg text-rose-700 dark:text-rose-400 tabular-nums">
            {expiredItems}
          </span>
        </Link>
      </div>

      {/* Bottom Link */}
      <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
        <span className="text-muted flex items-center gap-1.5">
          <span>📦</span>
          <span>ข้อมูลสุขภาพวัตถุดิบในบ้าน (ใน {fridgeCount} ตู้เย็น)</span>
        </span>
        <Link
          href="/fridges"
          className="font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 transition cursor-pointer"
        >
          <span>ดูตู้เย็น</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
