'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Refrigerator,
  Receipt,
  Sparkles,
  Wallet,
} from 'lucide-react';

const mobileTabs = [
  { href: '/', label: 'ภาพรวม', icon: Home, exact: true },
  { href: '/fridges', label: 'ตู้เย็น', icon: Refrigerator, exact: false },
  { href: '/receipts', label: 'สแกนใบเสร็จ', icon: Receipt, exact: false },
  { href: '/recipes', label: 'สุ่มเมนู AI', icon: Sparkles, exact: false },
  { href: '/activities', label: 'งบประมาณ', icon: Wallet, exact: false },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="เมนูหลักมือถือ"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe bg-card/95 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(37,37,37,0.06)]"
    >
      <div className="grid grid-cols-5 items-center h-16 px-1.5 gap-1 max-w-lg mx-auto">
        {mobileTabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-2xl transition-all active:scale-95 ${
                isActive
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-100/20 dark:text-primary-300 font-semibold shadow-[0_1px_4px_rgba(234,88,12,0.12)]'
                  : 'text-muted hover:text-foreground hover:bg-surface-container-low/60'
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] ${
                  isActive ? 'stroke-[2.25] text-primary-600 dark:text-primary-300' : ''
                }`}
              />
              <span className="text-[10px] leading-tight truncate max-w-full">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
