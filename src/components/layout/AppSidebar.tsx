'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Refrigerator,
  Home,
  Receipt,
  Clock,
  History,
  Settings,
  Sparkles,
} from 'lucide-react';

interface AppSidebarProps {
  collapsed?: boolean;
}

export function AppSidebar({ collapsed = false }: AppSidebarProps) {
  const pathname = usePathname();

  const navigation = [
    { name: 'ภาพรวม', href: '/', icon: LayoutDashboard },
    { name: 'ตู้เย็น & คลัง', href: '/fridges', icon: Refrigerator },
    { name: 'เมนู AI กู้ชีพ', href: '/recipes', icon: Sparkles, badge: 'ใหม่' },
    { name: 'สแกนใบเสร็จ OCR', href: '/receipts', icon: Receipt },
    { name: 'วันหมดอายุ', href: '/expirations', icon: Clock },
    { name: 'ครัวเรือน & สมาชิก', href: '/household', icon: Home },
    { name: 'ประวัติการใช้งาน', href: '/activities', icon: History },
    { name: 'ตั้งค่า & โปรไฟล์', href: '/profile', icon: Settings },
  ];

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 z-30 shrink-0 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-border gap-3 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-primary-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-primary-500/20">
          <span className="material-symbols-outlined text-[24px]">kitchen</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <span className="font-heading font-bold text-lg tracking-tight text-foreground block truncate">
              CheckTuYen
            </span>
            <span className="text-[11px] text-primary-600 font-bold tracking-wide block">
              เช็คตู้เย็น • Smart Home
            </span>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-sm transition-all active:scale-[0.98] ${
                isActive
                  ? 'bg-primary-500 text-white font-bold shadow-md shadow-primary-500/25'
                  : 'text-on-surface-variant hover:text-foreground hover:bg-surface-container-low'
              }`}
              title={collapsed ? item.name : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-white' : 'text-on-surface-variant'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </div>
              {!collapsed && item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-primary-100 text-primary-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Eco motivation bottom pod */}
      {!collapsed && (
        <div className="p-4 m-3 rounded-2xl bg-surface-container-low border border-border/60">
          <div className="flex items-center gap-2 text-secondary-600">
            <span className="material-symbols-outlined text-[18px]">eco</span>
            <span className="text-xs font-bold font-heading">Zero-Waste Home</span>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
            ช่วยลดขยะอาหารและประหยัดค่าใช้จ่ายในบ้านอย่างชาญฉลาด 🌱
          </p>
        </div>
      )}
    </aside>
  );
}
