'use client';

import React, { useState, type ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppTopbar } from './AppTopbar';
import { BottomNavigation } from './BottomNavigation';
import { useHousehold } from '@/contexts/HouseholdContext';
import { CreateHouseholdModal } from '@/components/household/CreateHouseholdModal';

export function MainLayout({ children }: { children: ReactNode }) {
  const { households, loading, authUser } = useHousehold();
  const [collapsed] = useState(false);

  // ถ้ายังโหลดข้อมูล ให้แสดง splash loader
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary-600/20 border-t-primary-600 rounded-full animate-spin" />
          <span className="text-xs text-muted font-medium">กำลังโหลดข้อมูล...</span>
        </div>
      </div>
    );
  }

  // หากล็อกอินแล้วแต่ยังไม่มีครัวเรือน แสดง Modal บังคับสร้าง/เข้าร่วม
  const showHouseholdModal = Boolean(authUser && households.length === 0);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop Sidebar */}
      <AppSidebar collapsed={collapsed} />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        <AppTopbar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />

      {/* Modal บังคับสร้างหรือเข้าร่วมครัวเรือนเมื่อยังไม่มี */}
      <CreateHouseholdModal isOpen={showHouseholdModal} />
    </div>
  );
}

