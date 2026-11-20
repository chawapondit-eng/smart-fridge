'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Refrigerator,
  Plus,
  Users,
  User,
  X,
  Receipt,
  Clock,
  History,
  Settings,
  Camera,
  PlusCircle,
  Search,
  Barcode,
  ShoppingBag,
  Sparkles,
  Utensils,
  ChevronRight,
} from 'lucide-react';
import { AddProductModal } from '@/components/inventory/AddProductModal';
import { FridgeModal } from '@/components/fridge/FridgeModal';

export function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  const [showQuickSheet, setShowQuickSheet] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddFridge, setShowAddFridge] = useState(false);

  function openQuickAdd() {
    setShowQuickSheet(false);
    setShowAddProduct(true);
  }

  function navigateFromSheet(href: string) {
    setShowQuickSheet(false);
    router.push(href);
  }

  return (
    <>
      {/* Mobile 5-Tab Fixed Bottom Navigation matching UI.pdf */}
      <nav
        aria-label="เมนูหลักมือถือ"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe bg-white/95 dark:bg-card/95 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(37,37,37,0.06)]"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1 max-w-lg mx-auto">
          {/* 1. Home (หน้าหลัก) */}
          <Link
            href="/"
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-all active:scale-95 ${
              pathname === '/'
                ? 'text-primary-600 font-bold'
                : 'text-on-surface-variant hover:text-foreground'
            }`}
          >
            <Home
              className={`w-5 h-5 ${pathname === '/' ? 'stroke-[2.5] text-primary-600' : ''}`}
            />
            <span className="text-[10px] leading-tight">หน้าหลัก</span>
          </Link>

          {/* 2. My Fridges (ตู้เย็นของฉัน) */}
          <Link
            href="/fridges"
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-all active:scale-95 ${
              pathname.startsWith('/fridges')
                ? 'text-primary-600 font-bold'
                : 'text-on-surface-variant hover:text-foreground'
            }`}
          >
            <Refrigerator
              className={`w-5 h-5 ${pathname.startsWith('/fridges') ? 'stroke-[2.5] text-primary-600' : ''}`}
            />
            <span className="text-[10px] leading-tight">ตู้เย็นของฉัน</span>
          </Link>

          {/* 3. Center Prominent Plus Button (Floating Action) */}
          <div className="flex flex-col items-center justify-center -mt-5">
            <button
              type="button"
              onClick={() => setShowQuickSheet(true)}
              aria-label="เมนูลัดเพิ่มรายการ"
              className="w-13 h-13 rounded-full bg-gradient-to-tr from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/35 ring-4 ring-white dark:ring-card flex items-center justify-center active:scale-90 transition-transform"
            >
              <Plus className="w-6 h-6 stroke-[2.75]" />
            </button>
            <span className="text-[10px] font-bold text-primary-600 mt-0.5 leading-tight">
              เพิ่ม
            </span>
          </div>

          {/* 4. Household Management (จัดการคนภายในบ้าน) */}
          <Link
            href="/household"
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-all active:scale-95 ${
              pathname.startsWith('/household')
                ? 'text-primary-600 font-bold'
                : 'text-on-surface-variant hover:text-foreground'
            }`}
          >
            <Users
              className={`w-5 h-5 ${pathname.startsWith('/household') ? 'stroke-[2.5] text-primary-600' : ''}`}
            />
            <span className="text-[10px] leading-tight truncate max-w-[58px]">จัดการบ้าน</span>
          </Link>

          {/* 5. Account / Profile (บัญชี & ตั้งค่า) */}
          <Link
            href="/profile"
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-all active:scale-95 ${
              pathname.startsWith('/profile')
                ? 'text-primary-600 font-bold'
                : 'text-on-surface-variant hover:text-foreground'
            }`}
          >
            <User
              className={`w-5 h-5 ${pathname.startsWith('/profile') ? 'stroke-[2.5] text-primary-600' : ''}`}
            />
            <span className="text-[10px] leading-tight">บัญชี</span>
          </Link>
        </div>
      </nav>

      {/* Quick Action Bottom Sheet (+ Button) matching UI.pdf Page 4 */}
      {showQuickSheet && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end animate-in fade-in duration-150"
          onClick={() => setShowQuickSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[32px] bg-white dark:bg-card border-t border-border p-6 pb-safe shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200"
          >
            <div className="w-12 h-1.5 rounded-full bg-stone-300 dark:bg-stone-700 mx-auto" />

            {/* Header with Close */}
            <div className="flex items-center justify-between pt-1">
              <h3 className="font-heading font-bold text-base sm:text-lg text-foreground">
                เพิ่มวัตถุดิบ
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickSheet(false)}
                className="w-8 h-8 rounded-full bg-stone-100 dark:bg-surface-container-low flex items-center justify-center text-muted hover:text-foreground transition cursor-pointer"
                aria-label="ปิด"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Only 2 Equal Action Cards (สแกนใบเสร็จ และ บันทึกด่วน) */}
            <div className="grid grid-cols-2 gap-3.5 pb-3">
              {/* 1. สแกนใบเสร็จ */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/receipts')}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 transition active:scale-95 text-center cursor-pointer group shadow-xs"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Receipt className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <span className="font-heading font-bold text-sm text-foreground block">
                    สแกนใบเสร็จ
                  </span>
                  <span className="text-[11px] text-muted block">
                    นำเข้าอัตโนมัติด้วย AI
                  </span>
                </div>
              </button>

              {/* 2. บันทึกด่วน */}
              <button
                type="button"
                onClick={openQuickAdd}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-primary-500/10 hover:bg-primary-500/15 border border-primary-500/25 transition active:scale-95 text-center cursor-pointer group shadow-xs"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <span className="font-heading font-bold text-sm text-foreground block">
                    บันทึกด่วน
                  </span>
                  <span className="text-[11px] text-muted block">
                    กรอกข้อมูลด้วยตนเอง
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Add Product Modal */}
      <AddProductModal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        onSuccess={() => router.refresh()}
      />

      <FridgeModal
        isOpen={showAddFridge}
        onClose={() => setShowAddFridge(false)}
      />
    </>
  );
}
