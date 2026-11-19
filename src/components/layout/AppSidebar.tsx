'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Home,
  Receipt,
  Clock,
  History,
  Settings,
  Sparkles,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface AppSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const pathname = usePathname();

  const navigation = [
    { name: 'แดชบอร์ด', href: '/', icon: LayoutDashboard },
    { name: 'ไดอารี่ & ตู้เย็น', href: '/fridges', icon: CalendarDays },
    { name: 'เมนู AI กู้ชีพ', href: '/recipes', icon: Sparkles, badge: 'AI' },
    { name: 'สแกนใบเสร็จ OCR', href: '/receipts', icon: Receipt },
    { name: 'ข้อมูลเชิงลึก', href: '/insights', icon: BarChart3 },
    { name: 'วันหมดอายุ', href: '/expirations', icon: Clock },
    { name: 'ครัวเรือน & สมาชิก', href: '/household', icon: Home },
    { name: 'ประวัติการใช้งาน', href: '/activities', icon: History },
    { name: 'บัญชี & ตั้งค่า', href: '/profile', icon: Settings },
  ];

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-border bg-white dark:bg-card transition-all duration-300 z-30 shrink-0 sticky top-0 h-screen ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header + Collapse Toggle */}
      <div
        className={`h-16 flex items-center border-b border-border shrink-0 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-600 to-primary-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-primary-500/20">
            <span className="material-symbols-outlined text-[24px]">kitchen</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <span className="font-heading font-bold text-lg text-foreground block truncate">
                CheckTuYen
              </span>
              <span className="text-[11px] text-primary-600 font-semibold block">
                เช็คตู้เย็น • Smart Home
              </span>
            </div>
          )}
        </Link>

        {!collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-8 h-8 rounded-xl text-muted hover:text-foreground hover:bg-stone-100 dark:hover:bg-surface-container-low flex items-center justify-center transition shrink-0"
            title="ย่อแถบเมนู"
            aria-label="ย่อแถบเมนู"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && onToggleCollapse && (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-10 h-10 rounded-xl text-muted hover:text-primary-600 hover:bg-stone-100 dark:hover:bg-surface-container-low flex items-center justify-center transition"
            title="ขยายแถบเมนู"
            aria-label="ขยายแถบเมนู"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
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
              className={`flex items-center ${
                collapsed ? 'justify-center px-0' : 'justify-between px-3.5'
              } py-2.5 rounded-2xl text-sm transition-all active:scale-[0.98] ${
                isActive
                  ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold shadow-md shadow-primary-500/20'
                  : 'text-stone-600 dark:text-on-surface-variant hover:text-foreground hover:bg-stone-100 dark:hover:bg-surface-container-low'
              }`}
              title={collapsed ? item.name : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-white' : 'text-stone-500 dark:text-on-surface-variant'
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

      {/* Eco Zero-Waste Pod */}
      {!collapsed && (
        <div className="p-3.5 m-3 rounded-2xl bg-orange-50/70 dark:bg-surface-container-low border border-orange-100 dark:border-border/60">
          <div className="flex items-center gap-2 text-primary-700 dark:text-secondary-600">
            <span className="material-symbols-outlined text-[18px]">eco</span>
            <span className="text-xs font-bold font-heading">Zero-Waste Home</span>
          </div>
          <p className="text-[11px] text-stone-600 dark:text-on-surface-variant mt-1 leading-relaxed">
            ช่วยลดขยะอาหารและประหยัดค่าใช้จ่ายในบ้านอย่างชาญฉลาด 🌱
          </p>
        </div>
      )}
    </aside>
  );
}
