'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Refrigerator,
  Receipt,
  Clock,
  History,
  Settings,
  Sparkles,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Leaf,
} from 'lucide-react';

interface AppSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const pathname = usePathname();

  const navigation = [
    { name: 'ภาพรวม', href: '/', icon: LayoutDashboard },
    { name: 'ตู้เย็น & คลัง', href: '/fridges', icon: Refrigerator },
    { name: 'เมนู AI กู้ชีพ', href: '/recipes', icon: Sparkles, badge: 'AI' },
    { name: 'สแกนใบเสร็จ OCR', href: '/receipts', icon: Receipt },
    { name: 'วันหมดอายุ', href: '/expirations', icon: Clock },
    { name: 'ครัวเรือน & สมาชิก', href: '/household', icon: Home },
    { name: 'ประวัติการใช้งาน', href: '/activities', icon: History },
    { name: 'ตั้งค่า & โปรไฟล์', href: '/profile', icon: Settings },
  ];

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 z-30 shrink-0 sticky top-0 h-screen ${
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
          <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0 shadow-[0_2px_8px_-2px_rgba(234,88,12,0.4)]">
            <span className="material-symbols-outlined text-[22px]">kitchen</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <span className="font-heading font-semibold text-lg text-foreground block truncate leading-tight">
                CheckTuYen
              </span>
              <span className="text-[11px] text-primary-600 font-medium block">
                เช็คตู้เย็น • Smart Home
              </span>
            </div>
          )}
        </Link>

        {!collapsed && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-8 h-8 rounded-xl text-muted hover:text-foreground hover:bg-surface-container-low flex items-center justify-center transition shrink-0 cursor-pointer"
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
            className="w-10 h-10 rounded-xl text-muted hover:text-primary-600 hover:bg-primary-100/60 flex items-center justify-center transition cursor-pointer"
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
              } py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] ${
                isActive
                  ? 'bg-primary-600 text-white font-semibold shadow-[0_2px_8px_-2px_rgba(234,88,12,0.35)]'
                  : 'text-muted hover:text-foreground hover:bg-surface-container-low font-medium'
              }`}
              title={collapsed ? item.name : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    isActive ? 'text-white' : 'text-muted'
                  }`}
                />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </div>
              {!collapsed && item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-primary-100 text-primary-700 dark:text-primary-300'
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
        <div className="p-3.5 m-3 rounded-2xl bg-primary-100/80 dark:bg-surface-container border border-primary-600/15">
          <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
            <div className="w-6 h-6 rounded-lg bg-primary-600/15 flex items-center justify-center">
              <Leaf className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
            </div>
            <span className="text-xs font-semibold font-heading">Zero-Waste Home</span>
          </div>
          <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
            ลดขยะอาหารและประหยัดค่าใช้จ่ายในบ้าน ช่วยดูแลโลกอย่างยั่งยืน 🌱
          </p>
        </div>
      )}
    </aside>
  );
}
