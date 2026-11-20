'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, MoreHorizontal, ArrowRight } from 'lucide-react';

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
  // คำนวณเปอร์เซ็นต์ความสดใหม่ (Freshness Score)
  const freshPercent =
    totalItems > 0
      ? Math.round((freshItems / totalItems) * 100)
      : 100;

  // ข้อความประเมินสุขภาพวัตถุดิบ
  const statusLabel =
    totalItems === 0
      ? 'ยังไม่มีวัตถุดิบในตู้'
      : expiredItems > 0
      ? 'มีของหมดอายุควรเคลียร์'
      : expiringSoonItems > 0
      ? 'มีของใกล้หมดอายุควรใช้'
      : 'ยังสดใหม่พร้อมปรุง';

  // คำนวณ SVG Arc Lengths
  // Radius = 68, Circumference = 2 * PI * 68 = 427.2566
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
    <section className="p-5 sm:p-6 rounded-3xl bg-surface-container-lowest border border-border shadow-xs flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading font-bold text-base sm:text-lg text-foreground">
            ความสดใหม่ของวัตถุดิบ
          </h2>
          <p className="text-xs text-muted mt-0.5">
            ภาพรวมความสดใหม่และวันหมดอายุของวัตถุดิบทั้งหมดในบ้าน
          </p>
        </div>
        <Link
          href="/expirations"
          className="p-1.5 rounded-xl text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
          title="ดูรายละเอียดวันหมดอายุ"
        >
          <MoreHorizontal className="w-5 h-5" />
        </Link>
      </div>

      {/* Donut Chart Centerpiece matching Image 2 */}
      <div className="flex flex-col items-center justify-center py-2">
        <div className="relative w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 160 160">
            {/* Background track */}
            <circle
              cx="80"
              cy="80"
              r={RADIUS}
              className="text-surface-container stroke-current"
              strokeWidth="14"
              fill="transparent"
            />

            {/* Arc 1: สดใหม่ (Green / Emerald) */}
            {freshItems > 0 || totalItems === 0 ? (
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                stroke="#10b981"
                strokeWidth="14"
                strokeDasharray={`${freshStroke} ${CIRCUMFERENCE}`}
                strokeDashoffset={freshOffset}
                strokeLinecap={totalItems === freshItems ? 'round' : 'butt'}
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            ) : null}

            {/* Arc 2: ใกล้หมดอายุ (Amber / Yellow) */}
            {expiringSoonItems > 0 && (
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                stroke="#f59e0b"
                strokeWidth="14"
                strokeDasharray={`${expiringStroke} ${CIRCUMFERENCE}`}
                strokeDashoffset={expiringOffset}
                strokeLinecap="butt"
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            )}

            {/* Arc 3: หมดอายุ (Rose / Pink-Red) */}
            {expiredItems > 0 && (
              <circle
                cx="80"
                cy="80"
                r={RADIUS}
                stroke="#f43f5e"
                strokeWidth="14"
                strokeDasharray={`${expiredStroke} ${CIRCUMFERENCE}`}
                strokeDashoffset={expiredOffset}
                strokeLinecap="butt"
                fill="transparent"
                className="transition-all duration-700 ease-out"
              />
            )}
          </svg>

          {/* Center Text inside Donut */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <span className="font-heading font-extrabold text-3xl sm:text-4xl text-foreground tracking-tight">
              {totalItems === 0 ? '100%' : `${freshPercent}%`}
            </span>
            <span
              className={`text-xs font-semibold mt-1 px-2 py-0.5 rounded-full ${
                expiredItems > 0
                  ? 'text-rose-500 bg-rose-500/10'
                  : expiringSoonItems > 0
                  ? 'text-amber-500 bg-amber-500/10'
                  : 'text-emerald-500 bg-emerald-500/10'
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Compact Status Chips in 2x2 Grid matching Image 2 (NO square cards) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {/* ทั้งหมด */}
        <Link
          href="/fridges"
          className="p-3 sm:p-3.5 rounded-2xl bg-surface-container-low hover:bg-surface-container border border-border/80 flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-primary-500/15 text-primary-600 flex items-center justify-center text-sm shrink-0">
              🎯
            </span>
            <span className="text-xs font-bold text-foreground">ทั้งหมด</span>
          </div>
          <span className="font-heading font-extrabold text-base sm:text-lg text-foreground group-hover:text-primary-600 transition">
            {totalItems}
          </span>
        </Link>

        {/* ยังสดใหม่ */}
        <Link
          href="/fridges"
          className="p-3 sm:p-3.5 rounded-2xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center text-sm shrink-0">
              🥦
            </span>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              ยังสดใหม่
            </span>
          </div>
          <span className="font-heading font-extrabold text-base sm:text-lg text-emerald-600 dark:text-emerald-400">
            {freshItems}
          </span>
        </Link>

        {/* ใกล้หมด */}
        <Link
          href="/expirations"
          className="p-3 sm:p-3.5 rounded-2xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center text-sm shrink-0">
              ⌛
            </span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
              ใกล้หมด
            </span>
          </div>
          <span className="font-heading font-extrabold text-base sm:text-lg text-amber-600 dark:text-amber-400">
            {expiringSoonItems}
          </span>
        </Link>

        {/* หมดอายุ */}
        <Link
          href="/expirations"
          className="p-3 sm:p-3.5 rounded-2xl bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 flex items-center justify-between transition cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-rose-500/15 text-rose-600 flex items-center justify-center text-sm shrink-0">
              ⚠️
            </span>
            <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
              หมดอายุ
            </span>
          </div>
          <span className="font-heading font-extrabold text-base sm:text-lg text-rose-600 dark:text-rose-400">
            {expiredItems}
          </span>
        </Link>
      </div>

      {/* Bottom Link matching Image 2 */}
      <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
        <span className="text-muted flex items-center gap-1.5">
          <span>📦</span>
          <span>ข้อมูลสุขภาพวัตถุดิบในบ้าน (ใน {fridgeCount} ตู้เย็น)</span>
        </span>
        <Link
          href="/fridges"
          className="font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 transition cursor-pointer"
        >
          <span>ดูตู้เย็น</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
