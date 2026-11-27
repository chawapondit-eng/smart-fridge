'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useTheme } from '@/components/providers/ThemeProvider';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import {
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Bell,
  Share2,
  Users,
  X,
  CheckCheck,
  User,
  Clock,
  ArrowRight,
  Home,
  Copy,
  Check,
  ChefHat,
} from 'lucide-react';
import { FullPageAnimation } from '@/components/ui/FullPageAnimation';
import { ShareHouseholdModal } from '@/components/household/ShareHouseholdModal';
import { getAutoEmoji } from '@/components/inventory/EditProductModal';
import {
  addDaysFromBangkokToday,
  getDaysUntilExpiry,
  normalizeDateString,
  formatExpiryShortBadge,
} from '@/lib/date';

interface AppTopbarProps {
  onToggleSidebar?: () => void;
}

interface NotificationItem {
  batchId: string;
  itemId: string;
  fridgeId: string;
  name: string;
  emoji: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  daysLeft: number;
  fridgeName: string;
}

export function AppTopbar({}: AppTopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { currentHousehold, households, fridges, setCurrentHousehold, user, authUser } = useHousehold();
  const { resolvedTheme, setTheme } = useTheme();

  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const [showHouseholdMenu, setShowHouseholdMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const householdRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Load persisted read notification keys per household
  useEffect(() => {
    if (!currentHousehold?.id || typeof window === 'undefined') {
      setReadIds([]);
      return;
    }
    try {
      const saved = localStorage.getItem(`smart_fridge_read_notifs_${currentHousehold.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setReadIds(parsed);
      } else {
        setReadIds([]);
      }
    } catch {
      setReadIds([]);
    }
  }, [currentHousehold?.id]);

  // Fetch expiring & expired items for Notification Bell
  const checkExpiring = useCallback(async () => {
    if (!currentHousehold?.id) {
      setAlerts([]);
      return;
    }
    try {
      const { data: itemRows } = await supabase
        .from('items')
        .select('id, name, unit, quantity, image_url, fridge_id')
        .eq('household_id', currentHousehold.id)
        .gt('quantity', 0);

      if (!itemRows || itemRows.length === 0) {
        setAlerts([]);
        return;
      }

      const itemIds = itemRows.map((i) => i.id);
      const itemMap = new Map(itemRows.map((i) => [i.id, i]));
      const fridgeMap = new Map(fridges.map((f) => [f.id, f]));
      const in3Days = addDaysFromBangkokToday(3);

      const { data: batchRows } = await supabase
        .from('item_batches')
        .select('id, item_id, quantity, expiry_date')
        .in('item_id', itemIds)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', in3Days)
        .gt('quantity', 0)
        .order('expiry_date', { ascending: true });

      if (!batchRows) {
        setAlerts([]);
        return;
      }

      const list: NotificationItem[] = [];
      const seenItemIds = new Set<string>();

      for (const b of batchRows) {
        const it = itemMap.get(b.item_id);
        if (!it || seenItemIds.has(b.item_id)) continue;
        const cleanDate = normalizeDateString(b.expiry_date);
        if (!cleanDate) continue;
        const daysLeft = getDaysUntilExpiry(cleanDate);
        if (daysLeft === null || daysLeft > 3) continue;

        seenItemIds.add(b.item_id);
        const fr = fridgeMap.get(it.fridge_id);
        list.push({
          batchId: b.id,
          itemId: it.id,
          fridgeId: it.fridge_id,
          name: it.name,
          emoji: it.image_url && !it.image_url.startsWith('http') && !it.image_url.startsWith('data:')
            ? it.image_url
            : getAutoEmoji(it.name),
          quantity: Number(it.quantity),
          unit: it.unit || 'ชิ้น',
          expiryDate: cleanDate,
          daysLeft,
          fridgeName: fr?.name || 'ตู้เย็น',
        });
      }

      list.sort((a, b) => a.daysLeft - b.daysLeft);
      setAlerts(list);
    } catch {
      // ignore
    }
  }, [currentHousehold?.id, fridges, supabase]);

  useEffect(() => {
    checkExpiring();
  }, [checkExpiring]);

  // Close popovers on outside click / Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifPopover(false);
      }
      if (householdRef.current && !householdRef.current.contains(target)) {
        setShowHouseholdMenu(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowNotifPopover(false);
        setShowHouseholdMenu(false);
        setShowProfileMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  function markAllAsRead() {
    if (!currentHousehold?.id) return;
    const allKeys = alerts.map((a) => `${a.batchId}_${a.expiryDate}`);
    setReadIds(allKeys);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`smart_fridge_read_notifs_${currentHousehold.id}`, JSON.stringify(allKeys));
    }
  }

  function markOneAsRead(alert: NotificationItem) {
    if (!currentHousehold?.id) return;
    const key = `${alert.batchId}_${alert.expiryDate}`;
    if (readIds.includes(key)) return;
    const next = [...readIds, key];
    setReadIds(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`smart_fridge_read_notifs_${currentHousehold.id}`, JSON.stringify(next));
    }
  }

  const unreadAlerts = alerts.filter((a) => !readIds.includes(`${a.batchId}_${a.expiryDate}`));
  const unreadCount = unreadAlerts.length;

  async function handleLogout() {
    setShowProfileMenu(false);
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
  const rawHouseholdId = currentHousehold?.id || '';
  const rawInviteCode = rawHouseholdId
    ? rawHouseholdId.startsWith('#TY-')
      ? rawHouseholdId
      : `TY-${rawHouseholdId.slice(0, 6).toUpperCase()}`
    : '';
  const displayInviteCode = rawInviteCode ? `# ${rawInviteCode.replace(/^#/, '')}` : '';

  async function handleQuickCopyCode(e: React.MouseEvent) {
    e.stopPropagation();
    if (!rawInviteCode) return;
    try {
      await navigator.clipboard.writeText(rawInviteCode);
      setCopiedInvite(true);
      toast.success(`คัดลอกรหัสเข้าบ้าน ${rawInviteCode} แล้ว`);
      setTimeout(() => setCopiedInvite(false), 1800);
    } catch {
      toast.error('ไม่สามารถคัดลอกรหัสได้');
    }
  }

  const pageHeader = (() => {
    if (pathname === '/') {
      return {
        title: 'ภาพรวม • เช็คตู้เย็น',
        subtitle: 'สรุปวัตถุดิบ วันหมดอายุ และงบประมาณในบ้าน',
      };
    }
    if (pathname.startsWith('/fridges')) {
      return {
        title: 'ตู้เย็นของบ้าน • คลังวัตถุดิบ',
        subtitle: 'จัดการจำนวนและตรวจสอบวันหมดอายุในทุกตู้',
      };
    }
    if (pathname.startsWith('/receipts')) {
      return {
        title: 'สแกนใบเสร็จอัจฉริยะ',
        subtitle: 'ถ่ายหรืออัปโหลดใบเสร็จเพื่อเพิ่มของและบันทึกงบ',
      };
    }
    if (pathname.startsWith('/recipes')) {
      return {
        title: 'สุ่มเมนู AI',
        subtitle: 'คิดเมนูจากวัตถุดิบในตู้โดยเน้นของใกล้หมดอายุก่อน',
      };
    }
    if (pathname.startsWith('/activities')) {
      return {
        title: 'งบประมาณ & ประวัติในบ้าน',
        subtitle: 'ติดตามค่าใช้จ่ายและรายการเข้า-ออกตู้เย็น',
      };
    }
    if (pathname.startsWith('/expirations')) {
      return {
        title: 'จัดการวันหมดอายุ',
        subtitle: 'ติดตามวัตถุดิบใกล้หมดอายุและจัดการสต็อกทันเวลา',
      };
    }
    if (pathname.startsWith('/household')) {
      return {
        title: 'จัดการบ้าน & สมาชิก',
        subtitle: 'กำหนดสิทธิ์ รหัสเชิญ และตู้เย็นร่วมกันในบ้าน',
      };
    }
    if (pathname.startsWith('/profile')) {
      return {
        title: 'โปรไฟล์ & ตั้งค่า',
        subtitle: 'ปรับแต่งบัญชีผู้ใช้ ธีมสี และข้อมูลส่วนตัว',
      };
    }
    return {
      title: 'CheckTuYen • เช็คตู้เย็น',
      subtitle: 'ระบบจัดการตู้เย็นและวัตถุดิบภายในบ้าน',
    };
  })();

  return (
    <>
      {showLogoutAnimation && (
        <FullPageAnimation
          type="logout"
          title="กำลังออกจากระบบ CheckTuYen..."
          subtitle="ปิดตู้เย็นเรียบร้อย แล้วพบกันใหม่นะ 👋"
        />
      )}

      <header className="h-16 border-b border-border bg-card/95 backdrop-blur-xl sticky top-0 z-30 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shadow-[var(--shadow-xs)]">
        {/* Left: PDF-style Brand Badge + Dynamic Route Title & Subtitle */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Link href="/" className="shrink-0">
            <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-[0_2px_8px_rgba(234,88,12,0.3)]">
              <span className="material-symbols-outlined text-[20px]">kitchen</span>
            </div>
          </Link>
          <div className="min-w-0">
            <h1 className="font-heading font-semibold text-sm sm:text-base tracking-tight text-foreground truncate leading-tight">
              {pageHeader.title}
            </h1>
            <p className="text-[11px] text-muted truncate hidden sm:block">
              {pageHeader.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Household Switcher / #Code Pill, Bell Popover, Theme Toggle, Profile Pill */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {households.length > 0 && currentHousehold && (
            <div className="relative" ref={householdRef}>
              <div className="inline-flex items-center rounded-full border border-border bg-surface-container-low shadow-[var(--shadow-xs)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setShowHouseholdMenu((prev) => !prev);
                    setShowNotifPopover(false);
                    setShowProfileMenu(false);
                  }}
                  aria-expanded={showHouseholdMenu}
                  className="flex items-center gap-1.5 pl-2.5 sm:pl-3 pr-1.5 py-1.5 hover:bg-surface-container text-xs font-semibold text-foreground transition cursor-pointer"
                  title={`สลับครัวเรือน (${currentHousehold.name})`}
                >
                  <Home className="w-3.5 h-3.5 text-primary-600 shrink-0 hidden xs:inline-block" />
                  <span className="truncate max-w-[82px] sm:max-w-[130px] font-heading">
                    {displayInviteCode || currentHousehold.name}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 text-muted transition-transform duration-200 ${
                      showHouseholdMenu ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {rawInviteCode && (
                  <button
                    type="button"
                    onClick={handleQuickCopyCode}
                    className="pr-2.5 pl-1 py-1.5 text-muted hover:text-primary-600 border-l border-border/70 transition cursor-pointer hidden sm:inline-flex items-center"
                    title={`คัดลอกรหัสเชิญ ${rawInviteCode}`}
                    aria-label="คัดลอกรหัสเชิญเข้าบ้าน"
                  >
                    {copiedInvite ? (
                      <Check className="w-3.5 h-3.5 text-primary-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {showHouseholdMenu && (
                <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 w-64 rounded-[20px] border border-border bg-card shadow-[var(--shadow-lg)] p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider">
                    ครัวเรือนของคุณ ({households.length})
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {households.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          setCurrentHousehold(h);
                          setShowHouseholdMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                          h.id === currentHousehold.id
                            ? 'bg-primary-100 text-primary-700 dark:text-primary-300 font-semibold'
                            : 'text-foreground hover:bg-surface-container-low'
                        }`}
                      >
                        <span className="truncate">{h.name}</span>
                        <span className="text-[10px] text-muted px-2 py-0.5 rounded-full bg-surface-container shrink-0">
                          {h.id === currentHousehold.id ? 'ใช้งานอยู่' : h.role === 'owner' ? 'เจ้าของ' : 'สมาชิก'}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 mt-2 border-t border-border space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowHouseholdMenu(false);
                        setShowShareModal(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-primary-600 hover:bg-primary-100/70 flex items-center gap-2 transition cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>แชร์รหัสเข้าบ้าน</span>
                    </button>
                    <Link
                      href="/household"
                      onClick={() => setShowHouseholdMenu(false)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-container-low flex items-center gap-2 transition"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>จัดการสมาชิกในบ้าน</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notification Bell & PDF Page 6 Dropdown Popover */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                const nextState = !showNotifPopover;
                setShowNotifPopover(nextState);
                setShowHouseholdMenu(false);
                setShowProfileMenu(false);
                if (nextState) checkExpiring();
              }}
              aria-expanded={showNotifPopover}
              aria-label="แจ้งเตือนวันหมดอายุ"
              title="แจ้งเตือนวันหมดอายุ"
              className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition active:scale-95 cursor-pointer ${
                showNotifPopover
                  ? 'bg-primary-100 border-primary-600/30 text-primary-700'
                  : 'bg-surface-container-low hover:bg-surface-container border-border text-foreground'
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-bold text-[10px] ring-2 ring-card shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifPopover && (
              <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[70px] sm:top-full sm:mt-2 sm:w-[400px] rounded-[24px] border border-border bg-card shadow-[var(--shadow-lg)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-4 py-3.5 border-b border-border flex items-center justify-between gap-2 bg-card">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">🔔</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-heading font-semibold text-sm text-foreground truncate">
                          แจ้งเตือนวัตถุดิบใกล้หมดอายุ
                        </h3>
                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:text-primary-300 text-[10px] font-bold shrink-0">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted truncate">
                        ตรวจสอบและนำไปปรุงอาหารก่อนหมดอายุ
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold text-primary-600 hover:bg-primary-100/70 flex items-center gap-1 transition cursor-pointer"
                        title="ทำเครื่องหมายว่าอ่านแล้วทั้งหมด"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">อ่านแล้ว</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNotifPopover(false)}
                      className="w-8 h-8 rounded-full text-muted hover:text-foreground hover:bg-surface-container-low flex items-center justify-center transition cursor-pointer"
                      aria-label="ปิดหน้าต่างแจ้งเตือน"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Alert Cards */}
                <div className="max-h-72 overflow-y-auto p-3 space-y-2 bg-background/60">
                  {alerts.length === 0 ? (
                    <div className="py-9 px-4 text-center space-y-2 bg-card rounded-2xl border border-border">
                      <div className="w-11 h-11 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto text-xl">
                        🥦
                      </div>
                      <p className="font-heading font-semibold text-sm text-foreground">
                        ยังไม่มีวัตถุดิบใกล้หมดอายุ
                      </p>
                      <p className="text-xs text-muted">
                        วัตถุดิบในตู้เย็นของคุณยังสดใหม่พร้อมปรุงทั้งหมด
                      </p>
                    </div>
                  ) : (
                    alerts.map((alert) => {
                      const isExpired = alert.daysLeft < 0;
                      const isUrgent = alert.daysLeft <= 2;
                      const isUnread = !readIds.includes(`${alert.batchId}_${alert.expiryDate}`);

                      return (
                        <Link
                          key={alert.batchId}
                          href={alert.fridgeId ? `/fridges?fridge=${alert.fridgeId}` : '/expirations'}
                          onClick={() => {
                            markOneAsRead(alert);
                            setShowNotifPopover(false);
                          }}
                          className={`flex items-center justify-between gap-2.5 p-3 rounded-2xl border transition hover:border-primary-300 ${
                            isUnread
                              ? 'bg-primary-50/40 dark:bg-primary-100/15 border-primary-200'
                              : 'bg-card border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-surface-container-low border border-border flex items-center justify-center text-lg shrink-0 relative">
                              <span>{alert.emoji}</span>
                              {isUnread && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary-600 ring-2 ring-card" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-heading font-semibold text-xs sm:text-sm text-foreground truncate">
                                {alert.name}
                              </p>
                              <p className="text-[11px] text-muted truncate">
                                {alert.fridgeName} • คงเหลือ {alert.quantity} {alert.unit}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                              isExpired || isUrgent
                                ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25'
                                : 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isExpired || isUrgent ? 'bg-rose-500' : 'bg-amber-500'}`} />
                            {formatExpiryShortBadge(alert.daysLeft)}
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>

                {/* Footer CTA matching PDF Page 6 */}
                <div className="p-3 border-t border-border bg-card space-y-2">
                  <Link
                    href="/recipes"
                    onClick={() => setShowNotifPopover(false)}
                    className="ds-btn-primary w-full py-2.5 px-4 text-xs flex items-center justify-center gap-2 shadow-[0_3px_10px_-2px_rgba(234,88,12,0.38)]"
                  >
                    <ChefHat className="w-4 h-4" />
                    <span>ไปหน้าสุ่มเมนูเคลียร์ของใกล้หมดอายุ</span>
                  </Link>
                  <Link
                    href="/expirations"
                    onClick={() => setShowNotifPopover(false)}
                    className="w-full py-1 text-[11px] font-semibold text-muted hover:text-primary-600 flex items-center justify-center gap-1 transition"
                  >
                    <Clock className="w-3 h-3" />
                    <span>จัดการวันหมดอายุทั้งหมด</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface-container-low hover:bg-surface-container border border-border text-muted hover:text-foreground flex items-center justify-center transition active:scale-95 cursor-pointer"
            title={`เปลี่ยนเป็น ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="สลับโหมดสี"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* Profile Menu Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu((prev) => !prev);
                setShowNotifPopover(false);
                setShowHouseholdMenu(false);
              }}
              aria-expanded={showProfileMenu}
              className="flex items-center gap-1.5 sm:gap-2 pl-1 pr-2 sm:pr-2.5 py-1 rounded-full border border-border bg-surface-container-low hover:bg-surface-container transition active:scale-95 cursor-pointer"
              title="เมนูบัญชีผู้ใช้"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                {user?.avatar_url?.startsWith('data:image') || user?.avatar_url?.startsWith('http') ? (
                  <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                ) : user?.avatar_url ? (
                  <span className="text-sm">{user.avatar_url}</span>
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
              <span className="hidden md:inline text-xs font-semibold text-foreground max-w-[100px] truncate">
                {displayName}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted hidden sm:block transition-transform duration-200 ${
                  showProfileMenu ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showProfileMenu && (
              <div className="absolute top-full right-0 mt-2 w-60 rounded-[20px] border border-border bg-card shadow-[var(--shadow-lg)] p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2.5 border-b border-border mb-1.5">
                  <p className="font-heading font-semibold text-sm text-foreground truncate">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-muted truncate">
                    {authUser?.email || 'สมาชิก CheckTuYen'}
                  </p>
                </div>

                <Link
                  href="/profile"
                  onClick={() => setShowProfileMenu(false)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-surface-container-low flex items-center gap-2.5 transition"
                >
                  <User className="w-4 h-4 text-primary-600" />
                  <span>โปรไฟล์ &amp; ตั้งค่า</span>
                </Link>

                <Link
                  href="/household"
                  onClick={() => setShowProfileMenu(false)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-surface-container-low flex items-center gap-2.5 transition"
                >
                  <Users className="w-4 h-4 text-primary-600" />
                  <span>จัดการบ้าน &amp; สมาชิก</span>
                </Link>

                <div className="pt-1.5 mt-1.5 border-t border-border">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-500/10 flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>
              </div>
            )}
          </div>
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
