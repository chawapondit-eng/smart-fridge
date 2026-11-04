'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Refrigerator, Receipt, Sparkles } from 'lucide-react';

export function BottomNavigation() {
  const pathname = usePathname();

  const items = [
    { name: 'ภาพรวม', href: '/', icon: LayoutDashboard },
    { name: 'ตู้เย็น & คลัง', href: '/fridges', icon: Refrigerator },
    { name: 'สแกนสลิป', href: '/receipts', icon: Receipt },
    { name: 'เมนู AI', href: '/recipes', icon: Sparkles },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe bg-surface/90 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(120,113,108,0.08)]">
      <div className="flex justify-around items-center h-16 px-2">
        {items.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 min-w-[72px] py-1.5 px-3 rounded-2xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-primary-500 text-white font-bold shadow-md shadow-primary-500/25'
                  : 'text-on-surface-variant hover:text-foreground'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              <span className="text-[11px] tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
