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

      {/* Quick Action Bottom Sheet (+ Button) matching UI.pdf Page 3 */}
      {showQuickSheet && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end animate-in fade-in duration-150"
          onClick={() => setShowQuickSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[32px] bg-white dark:bg-card border-t border-border p-5 pb-safe shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200"
          >
            <div className="w-10 h-1 rounded-full bg-stone-200 mx-auto" />

            {/* Top AI Chef Banner matching UI.pdf */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-400 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">
                  👨‍🍳
                </span>
                <div>
                  <h4 className="font-heading font-bold text-xs sm:text-sm">Ask AI Chef 🥕</h4>
                  <p className="text-[11px] text-white/90">พร้อมแนะนำเมนูและวิเคราะห์ของในตู้</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateFromSheet('/recipes')}
                className="px-3 py-1 rounded-full bg-white text-primary-600 font-bold text-xs shadow-xs active:scale-95 transition shrink-0"
              >
                ลองเลย →
              </button>
            </div>

            {/* Header with Close */}
            <div className="flex items-center justify-between pt-1">
              <h3 className="font-heading font-bold text-sm sm:text-base text-foreground">
                การดำเนินการด่วน (Quick Actions)
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickSheet(false)}
                className="w-7 h-7 rounded-full bg-stone-100 dark:bg-surface-container-low flex items-center justify-center text-muted hover:text-foreground"
                aria-label="ปิด"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 8 Action Tiles (2 Rows x 4 Columns) matching UI.pdf Page 3 */}
            <div className="grid grid-cols-4 gap-2.5 pb-2">
              {/* 1. Camera / Food Scan */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/receipts')}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-orange-50/80 hover:bg-orange-100/80 border border-orange-100 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  สแกนอาหาร
                </span>
              </button>

              {/* 2. Barcode */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/receipts')}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200/60 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-stone-700 text-white flex items-center justify-center shadow-xs">
                  <Barcode className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  สแกนบาร์โค้ด
                </span>
              </button>

              {/* 3. Search */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/fridges?search=true')}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200/60 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-stone-700 text-white flex items-center justify-center shadow-xs">
                  <Search className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  ค้นหาอาหาร
                </span>
              </button>

              {/* 4. Quick Add */}
              <button
                type="button"
                onClick={openQuickAdd}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-100 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  บันทึกด่วน
                </span>
              </button>

              {/* 5. Receipt OCR */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/receipts')}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200/60 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  สแกนใบเสร็จ
                </span>
              </button>

              {/* 6. AI Recipes */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/recipes')}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-amber-50/80 hover:bg-amber-100/80 border border-amber-100 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  สุ่มเมนู AI
                </span>
              </button>

              {/* 7. Shopping List */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/fridges')}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200/60 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-xs">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  รายการซื้อของ
                </span>
              </button>

              {/* 8. Expirations */}
              <button
                type="button"
                onClick={() => navigateFromSheet('/expirations')}
                className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-rose-50/80 hover:bg-rose-100/80 border border-rose-100 transition active:scale-95"
              >
                <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center line-clamp-1">
                  วันหมดอายุ
                </span>
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
