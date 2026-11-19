'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useTheme } from '@/components/providers/ThemeProvider';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import {
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  KeyRound,
  Bell,
  Share2,
  Users,
} from 'lucide-react';
import { FullPageAnimation } from '@/components/ui/FullPageAnimation';
import { ShareHouseholdModal } from '@/components/household/ShareHouseholdModal';
import { addDaysFromBangkokToday } from '@/lib/date';

interface AppTopbarProps {
  onToggleSidebar?: () => void;
}

export function AppTopbar({}: AppTopbarProps) {
  const router = useRouter();
  const supabase = createClient();
  const { currentHousehold, households, setCurrentHousehold, user, authUser } = useHousehold();
  const { resolvedTheme, setTheme } = useTheme();

  const [expiringCount, setExpiringCount] = useState<number>(0);
  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // ดึงจำนวนของที่ใกล้หมดอายุในครัวเรือนนี้
  useEffect(() => {
    if (!currentHousehold?.id) return;
    async function checkExpiring() {
      try {
        const { data: itemRows } = await supabase
          .from('items')
          .select('id')
          .eq('household_id', currentHousehold!.id);

        if (itemRows && itemRows.length > 0) {
          const itemIds = itemRows.map((i) => i.id);
          const in3Days = addDaysFromBangkokToday(3);

          const { count } = await supabase
            .from('item_batches')
            .select('*', { count: 'exact', head: true })
            .in('item_id', itemIds)
            .lte('expiry_date', in3Days)
            .gt('quantity', 0);

          setExpiringCount(count || 0);
        } else {
          setExpiringCount(0);
        }
      } catch {
        // ignore
      }
    }
    checkExpiring();
  }, [currentHousehold?.id, supabase]);

  async function handleLogout() {
    setShowLogoutAnimation(true);
    try {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('smart-fridge-current-household');
      }
      setTimeout(() => {
        toast.success('ออกจากระบบเรียบร้อย');
        if (typeof window !== 'undefined') {
          window.location.replace('/login');
        } else {
          router.replace('/login');
          router.refresh();
        }
      }, 1100);
    } catch {
      setShowLogoutAnimation(false);
      toast.error('ออกจากระบบไม่สำเร็จ');
    }
  }

  const displayName = user?.display_name || authUser?.email?.split('@')[0] || 'ผู้ใช้งาน';

  return (
    <>
      {showLogoutAnimation && (
        <FullPageAnimation
          type="logout"
          title="กำลังออกจากระบบ CheckTuYen..."
          subtitle="ปิดตู้เย็นเรียบร้อย แล้วพบกันใหม่นะ 👋"
        />
      )}

      <header className="h-16 border-b border-border bg-card/85 backdrop-blur-xl sticky top-0 z-20 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shadow-[0_1px_8px_rgba(120,113,108,0.04)]">
        {/* Left: Brand logo on mobile + Household Selector */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Logo Brand */}
          <div className="flex items-center gap-2 md:hidden shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-600 to-primary-400 text-white flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[20px]">kitchen</span>
            </div>
            <span className="font-heading font-bold text-base tracking-tight text-foreground hidden xs:inline">
              CheckTuYen
            </span>
          </div>

          {/* Household Management & Sharing Cluster matching Section 2 */}
          {households.length > 0 && currentHousehold && (
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              {/* Household Name & Switcher Dropdown */}
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface-container-low hover:bg-surface-container text-xs sm:text-sm font-semibold text-foreground transition active:scale-95 shadow-xs"
                  title="สลับครัวเรือนหรือจัดการบ้าน"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary-600">cottage</span>
                  <span className="truncate max-w-[100px] sm:max-w-[150px]">
                    {currentHousehold.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted ml-0.5" />
                </button>

                <div className="absolute top-full left-0 mt-1 w-64 rounded-2xl border border-border bg-card shadow-xl p-1.5 hidden group-hover:block z-30 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[11px] font-bold text-muted uppercase tracking-wider">
                    ครัวเรือนของคุณ ({households.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {households.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => setCurrentHousehold(h)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition ${
                          h.id === currentHousehold.id
                            ? 'bg-primary-50 text-primary-700 font-bold'
                            : 'text-foreground hover:bg-surface-container-low'
                        }`}
                      >
                        <span className="truncate">{h.name}</span>
                        <span className="text-[10px] text-muted px-1.5 py-0.5 rounded-full bg-muted/15 shrink-0">
                          {h.id === currentHousehold.id ? 'ใช้งานอยู่' : h.role === 'owner' ? 'เจ้าของ' : 'สมาชิก'}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 mt-1.5 border-t border-border space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowShareModal(true)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 flex items-center gap-2 transition"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>แชร์รหัสเข้าบ้าน</span>
                    </button>
                    <Link
                      href="/household"
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-muted hover:text-foreground hover:bg-surface-container-low flex items-center gap-2 transition"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>จัดการสมาชิกในบ้าน</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Notification, Theme Toggle, Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Expiring Soon Notification Bell */}
          <Link
            href="/expirations"
            className="relative w-10 h-10 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition active:scale-95 shadow-xs"
            title="แจ้งเตือนวันหมดอายุ"
          >
            <Bell className="w-4 h-4" />
            {expiringCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-tertiary-500 text-white font-bold text-[10px] shadow-sm animate-pulse">
                {expiringCount}
              </span>
            )}
          </Link>

          {/* Theme Toggle Button */}
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-full bg-surface-container-low hover:bg-surface-container text-muted hover:text-foreground flex items-center justify-center transition active:scale-95 shadow-xs"
            title={`เปลี่ยนเป็น ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-stone-600" />
            )}
          </button>

          {/* Profile Avatar Link */}
          <Link
            href="/profile"
            className="flex items-center gap-2 p-1 rounded-full hover:bg-surface-container-low transition active:scale-95"
            title="โปรไฟล์"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-600 to-primary-400 text-white flex items-center justify-center font-bold text-xs shadow-xs overflow-hidden">
              {user?.avatar_url?.startsWith('data:image') || user?.avatar_url?.startsWith('http') ? (
                <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
              ) : user?.avatar_url ? (
                <span className="text-sm">{user.avatar_url}</span>
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <span className="hidden lg:inline text-xs font-semibold text-foreground max-w-[100px] truncate">
              {displayName}
            </span>
          </Link>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-full text-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center transition active:scale-95"
            title="ออกจากระบบ"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Share Household Modal */}
      <ShareHouseholdModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        household={currentHousehold}
      />
    </>
  );
}
