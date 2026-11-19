'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from './AppSidebar';
import { AppTopbar } from './AppTopbar';
import { BottomNavigation } from './BottomNavigation';
import { useHousehold } from '@/contexts/HouseholdContext';
import { CreateHouseholdModal } from '@/components/household/CreateHouseholdModal';
import { FullPageAnimation } from '@/components/ui/FullPageAnimation';

const SIDEBAR_STORAGE_KEY = 'smart_fridge_sidebar_collapsed';

export function MainLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { households, loading, authUser } = useHousehold();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
    }
  }, []);

  function handleToggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      }
      return next;
    });
  }

  // ป้องกันการเข้าถึงหน้าส่วนตัวหลังจากออกจากระบบ (รวมถึงการกดปุ่ม Back)
  useEffect(() => {
    if (!loading && !authUser) {
      router.replace('/login');
    }
  }, [loading, authUser, router]);

  // ถ้ายังโหลดข้อมูล ให้แสดงหน้า Loading แบบเต็มหน้าจอพร้อม Animation ของ Smart Fridge
  if (loading) {
    return (
      <FullPageAnimation
        type="loading"
        title="กำลังเปิดตู้เย็น CheckTuYen..."
        subtitle="กำลังซิงค์ข้อมูลวัตถุดิบและวันหมดอายุในบ้านของคุณ ❄️"
      />
    );
  }

  // ถ้าไม่ได้เข้าสู่ระบบ ไม่แสดงเนื้อหาส่วนตัวใดๆ
  if (!authUser) {
    return (
      <FullPageAnimation
        type="logout"
        title="กำลังพาไปหน้าเข้าสู่ระบบ..."
        subtitle="กรุณาเข้าสู่ระบบเพื่อดูข้อมูลตู้เย็นของคุณ"
      />
    );
  }

  // หากล็อกอินแล้วแต่ยังไม่มีครัวเรือน แสดง Modal บังคับสร้าง/เข้าร่วม
  const showHouseholdModal = Boolean(authUser && households.length === 0);

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-x-hidden">
      {/* Desktop Collapsible Sidebar */}
      <AppSidebar collapsed={collapsed} onToggleCollapse={handleToggleSidebar} />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-24 md:pb-8">
        <AppTopbar />
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 xl:p-10 max-w-[1600px] w-full mx-auto transition-all">
          {children}
        </main>
      </div>

      {/* Mobile 5-Tab Bottom Navigation & Bottom Sheets */}
      <BottomNavigation />

      {/* Modal บังคับสร้างหรือเข้าร่วมครัวเรือนเมื่อยังไม่มี */}
      <CreateHouseholdModal isOpen={showHouseholdModal} />
    </div>
  );
}

