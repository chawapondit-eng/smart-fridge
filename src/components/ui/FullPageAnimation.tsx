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

  const defaultTitle = isLogout
    ? 'กำลังออกจากระบบ...'
    : 'ยินดีต้อนรับสู่ CheckTuYen...';

  const defaultSubtitle = isLogout
    ? 'บันทึกข้อมูลตู้เย็นเรียบร้อย แล้วพบกันใหม่นะ 👋'
    : 'กำลังเปิดตู้เย็นและตรวจสอบความสดใหม่ ❄️';

  return (
    <div className="fixed inset-0 z-[9999] bg-surface/95 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="relative flex flex-col items-center max-w-sm text-center">
        {/* Animated Mascot Area */}
        <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
          {/* Pulsing ambient glow */}
          <div className="absolute inset-0 rounded-full bg-primary-500/20 blur-xl animate-ping" />
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary-500/25 to-secondary-500/25 animate-pulse" />

          {/* Fridge Mascot Box */}
          <div className="relative w-24 h-24 rounded-3xl bg-surface-container-lowest border-2 border-primary-500/40 shadow-2xl flex flex-col items-center justify-center animate-bounce">
            {/* Mascot Face & Icon */}
            <div className="text-4xl">
              {isLogout ? '🚪' : '🧊'}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
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

