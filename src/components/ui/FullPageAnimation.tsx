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
    <div className="fixed inset-0 z-[9999] bg-surface/95 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="relative flex flex-col items-center max-w-sm text-center">
        {/* Brand Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/25 text-primary-600 dark:text-primary-400 text-[11px] font-semibold mb-5">
          <span className="material-symbols-outlined text-[15px]">kitchen</span>
          <span>CheckTuYen • Smart Fridge</span>
        </div>

        {/* Animated Mascot Area */}
        <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
          {/* Pulsing ambient glow */}
          <div
            className={`absolute inset-0 rounded-full blur-xl animate-ping ${
              isLogout ? 'bg-rose-500/15' : 'bg-primary-500/20'
            }`}
          />
          <div
            className={`absolute inset-0 rounded-3xl animate-pulse ${
              isLogout
                ? 'bg-gradient-to-tr from-rose-500/20 to-amber-500/20'
                : 'bg-gradient-to-tr from-primary-500/25 to-secondary-500/25'
            }`}
          />

          {/* Fridge Mascot Box */}
          <div
            className={`relative w-24 h-24 rounded-3xl bg-surface-container-lowest border-2 shadow-2xl flex flex-col items-center justify-center animate-bounce ${
              isLogout ? 'border-rose-500/40' : 'border-primary-500/40'
            }`}
          >
            {/* Mascot Face & Icon */}
            <div className="text-4xl">
              {isLogout ? '🚪' : isLoading ? '❄️' : '🧊'}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isLogout ? 'bg-rose-500' : 'bg-primary-500'}`} />
              <span className={`w-3 h-1 rounded-full ${isLogout ? 'bg-rose-400/60' : 'bg-secondary-500/70'}`} />
              <span className={`w-1.5 h-1.5 rounded-full ${isLogout ? 'bg-rose-500' : 'bg-primary-500'}`} />
            </div>
          </div>

          {/* Floating Food Orbitals */}
          <span className="absolute -top-2 -left-2 text-xl animate-pulse">
            🥦
          </span>
          <span className="absolute -top-1 -right-2 text-xl animate-pulse delay-100">
            🥛
          </span>
          <span className="absolute -bottom-2 -left-1 text-xl animate-pulse delay-200">
            🍎
          </span>
          <span className="absolute -bottom-1 -right-2 text-xl animate-pulse delay-300">
            🧀
          </span>
        </div>

        {/* Title */}
        <h2 className="font-heading font-bold text-xl sm:text-2xl text-foreground mb-2">
          {title || defaultTitle}
        </h2>

        {/* Subtitle */}
        <p className="text-xs sm:text-sm text-muted max-w-xs leading-relaxed mb-6">
          {subtitle || defaultSubtitle}
        </p>

        {/* Staggered Loading Dots */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary-600 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-secondary-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

