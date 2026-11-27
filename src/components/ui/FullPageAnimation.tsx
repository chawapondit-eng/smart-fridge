'use client';

import React from 'react';

interface FullPageAnimationProps {
  type: 'login' | 'logout' | 'loading';
  title?: string;
  subtitle?: string;
}

export function FullPageAnimation({
  type,
  title,
  subtitle,
}: FullPageAnimationProps) {
  const isLogout = type === 'logout';
  const isLoading = type === 'loading';

  const defaultTitle = isLogout
    ? 'กำลังออกจากระบบ CheckTuYen...'
    : isLoading
    ? 'กำลังเปิดตู้เย็นของคุณ...'
    : 'ยินดีต้อนรับสู่ CheckTuYen...';

  const defaultSubtitle = isLogout
    ? 'ปิดประตูตู้เย็นและเคลียร์ข้อมูลเรียบร้อย แล้วพบกันใหม่นะ 👋'
    : isLoading
    ? 'กำลังซิงค์รายการวัตถุดิบและวันหมดอายุล่าสุด ❄️'
    : 'กำลังเปิดตู้เย็นและตรวจสอบความสดใหม่ ❄️';

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="relative flex flex-col items-center max-w-sm text-center">
        {/* Brand Pill */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary-100 border border-primary-600/20 text-primary-700 dark:text-primary-300 text-xs font-semibold mb-6">
          <span className="material-symbols-outlined text-[16px]">kitchen</span>
          <span>CheckTuYen • Smart Fridge</span>
        </div>

        {/* Animated Mascot Area */}
        <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full blur-xl animate-ping ${
              isLogout ? 'bg-rose-500/15' : 'bg-primary-600/15'
            }`}
          />
          <div
            className={`absolute inset-0 rounded-[22px] animate-pulse ${
              isLogout
                ? 'bg-rose-500/15'
                : 'bg-primary-100'
            }`}
          />

          <div
            className={`relative w-24 h-24 rounded-[22px] bg-card border shadow-[var(--shadow-lg)] flex flex-col items-center justify-center animate-bounce ${
              isLogout ? 'border-rose-500/30' : 'border-primary-600/25'
            }`}
          >
            <div className="text-4xl">
              {isLogout ? '🚪' : isLoading ? '❄️' : '🧊'}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isLogout ? 'bg-rose-500' : 'bg-primary-600'}`} />
              <span className={`w-3 h-1 rounded-full ${isLogout ? 'bg-rose-400/60' : 'bg-primary-400'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isLogout ? 'bg-rose-500' : 'bg-primary-600'}`} />
            </div>
          </div>

          <span className="absolute -top-2 -left-2 text-xl animate-pulse">🥦</span>
          <span className="absolute -top-1 -right-2 text-xl animate-pulse delay-100">🥛</span>
          <span className="absolute -bottom-2 -left-1 text-xl animate-pulse delay-200">🍎</span>
          <span className="absolute -bottom-1 -right-2 text-xl animate-pulse delay-300">🧀</span>
        </div>

        <h2 className="font-heading font-semibold text-xl sm:text-2xl text-foreground mb-2">
          {title || defaultTitle}
        </h2>

        <p className="text-xs sm:text-sm text-muted max-w-xs leading-relaxed mb-6">
          {subtitle || defaultSubtitle}
        </p>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary-700 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-primary-600 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
