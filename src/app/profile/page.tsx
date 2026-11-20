'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useTheme } from '@/components/providers/ThemeProvider';
import { createClient } from '@/lib/supabase/client';
import { FullPageAnimation } from '@/components/ui/FullPageAnimation';
import toast from 'react-hot-toast';
import {
  User,
  Mail,
  Sun,
  Moon,
  Home,
  LogOut,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Smile,
} from 'lucide-react';

const PROFILE_AVATARS = [
  '🐱', '🐶', '🦊', '🐰', '🐼', '🐨', '🦁', '🐯', '🐻', '🐸',
  '👨‍🍳', '👩‍🍳', '🧑‍🍳', '👦', '👧', '🧔', '🧙‍♂️', '🦸', '👸', '🤴',
  '🍕', '🍔', '🍣', '🍩', '🥑', '🍓', '🍰', '🍦', '☕', '🧃',
  '⚡', '🚀', '🌟', '🎮', '👑', '💎', '🌿', '🌸', '❄️', '🔥'
];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, authUser, currentHousehold, households, setCurrentHousehold, refreshUser } = useHousehold();
  const { resolvedTheme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);

  useEffect(() => {
    if (user?.display_name) {
      setDisplayName(user.display_name);
    } else if (authUser?.email) {
      setDisplayName(authUser.email.split('@')[0]);
    }

    if (user?.avatar_url) {
      setAvatarUrl(user.avatar_url);
    } else if (authUser?.id && typeof window !== 'undefined') {
      const cached = localStorage.getItem(`user_avatar_${authUser.id}`);
      if (cached) setAvatarUrl(cached);
    }
  }, [user, authUser]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!authUser?.id || !displayName.trim()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id: authUser.id,
        display_name: displayName.trim(),
        avatar_url: avatarUrl || null,
        email: authUser.email || '',
        updated_at: new Date().toISOString(),
      };

      let { error } = await supabase.from('users').upsert(payload);

      // ถ้าตารางไม่มีคอลัมน์ avatar_url ให้ลอง update เฉพาะ display_name
      if (error && error.message?.includes('avatar_url')) {
        delete payload.avatar_url;
        const retry = await supabase.from('users').upsert(payload);
        error = retry.error;
      }

      if (error) throw error;

      // บันทึกลง localStorage สำรองไว้
      if (typeof window !== 'undefined') {
        if (avatarUrl) {
          localStorage.setItem(`user_avatar_${authUser.id}`, avatarUrl);
        } else {
          localStorage.removeItem(`user_avatar_${authUser.id}`);
        }
      }

      await refreshUser();
      toast.success('บันทึกรูปโปรไฟล์และข้อมูลเรียบร้อย');
    } catch (err: unknown) {
      console.error('Save profile error:', err);
      const msg = err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setShowLogoutAnimation(true);
    try {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('smart-fridge-current-household');
      }
      setTimeout(() => {
        toast.success('ออกจากระบบเรียบร้อยแล้ว');
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

  const isDataUrl = avatarUrl?.startsWith('data:image') || avatarUrl?.startsWith('http');

  return (
    <MainLayout>
      {showLogoutAnimation && (
        <FullPageAnimation
          type="logout"
          title="กำลังออกจากระบบ CheckTuYen..."
          subtitle="ปิดประตูตู้เย็นและเคลียร์ข้อมูลเรียบร้อย แล้วพบกันใหม่นะ 👋"
        />
      )}
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            โปรไฟล์ &amp; ตั้งค่า ⚙️
          </h1>
          <p className="text-sm text-muted mt-1">
            จัดการข้อมูลบัญชีผู้ใช้ รูปโปรไฟล์ และรูปแบบการแสดงผลของระบบ
          </p>
        </div>

        {/* Account Info & Avatar Form */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
          {/* Avatar Preview & Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-border">
            {/* Avatar Circle */}
            <div className="relative self-center sm:self-auto">
              <div className="w-20 h-20 rounded-2xl bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 font-extrabold text-3xl flex items-center justify-center border-2 border-primary-500/30 overflow-hidden shadow-md">
                {isDataUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : avatarUrl ? (
                  <span className="text-4xl">{avatarUrl}</span>
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            <div className="space-y-1 text-center sm:text-left flex-1">
              <h2 className="text-lg font-bold text-foreground">
                {displayName}
              </h2>
              <span className="text-xs text-muted block">
                {authUser?.email}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600">
                <Shield className="w-3 h-3" />
                <span>บัญชีผู้ใช้ที่ยืนยันแล้ว</span>
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Avatar Emoji Selection Box */}
            <div className="p-4 rounded-xl border border-border bg-muted/5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5 text-primary-600" />
                  <span>เลือก Emoji รูปโปรไฟล์</span>
                </label>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl('');
                      toast.success('รีเซ็ตกลับเป็นตัวอักษรชื่อ');
                    }}
                    className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>ลบ Emoji</span>
                  </button>
                )}
              </div>

              {/* Quick Preset Avatars Grid */}
              <div>
                <span className="text-xs text-muted block mb-2 font-medium">
                  แตะเลือก Emoji เพื่อใช้เป็นรูปโปรไฟล์ของคุณ:
                </span>
                <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-h-36 overflow-y-auto p-1.5 rounded-xl bg-card border border-border">
                  {PROFILE_AVATARS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatarUrl(emoji)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-muted/20 hover:scale-110 active:scale-95 transition ${
                        avatarUrl === emoji ? 'bg-primary-100 dark:bg-primary-900/50 ring-2 ring-primary-500' : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                ชื่อที่แสดง (Display Name) <span className="text-rose-500">*</span>
              </label>
              <div className="relative rounded-xl border border-border bg-background focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 transition-all">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-transparent text-sm text-foreground focus:outline-none rounded-xl"
                />
              </div>
            </div>

            {/* Email (Readonly) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                อีเมล (ไม่สามารถแก้ไขได้)
              </label>
              <div className="relative rounded-xl border border-border bg-muted/10">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={authUser?.email || ''}
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 bg-transparent text-sm text-muted cursor-not-allowed rounded-xl"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60 shadow-sm shadow-primary-600/20 transition"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Preferences */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-600" />
            <span>การแสดงผล (Theme Mode)</span>
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-4 rounded-xl border text-left flex items-center gap-3 transition ${
                resolvedTheme === 'light'
                  ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/30'
                  : 'border-border bg-background hover:bg-muted/10'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground block">Light Mode</span>
                <span className="text-[11px] text-muted">สีสว่าง สดชื่น สบายตา</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-xl border text-left flex items-center gap-3 transition ${
                resolvedTheme === 'dark'
                  ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/30'
                  : 'border-border bg-background hover:bg-muted/10'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Moon className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground block">Dark Mode</span>
                <span className="text-[11px] text-muted">มืดนุ่มนวล ถนอมสายตา</span>
              </div>
            </button>
          </div>
        </div>

        {/* Household Switcher */}
        {households.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Home className="w-4 h-4 text-primary-600" />
              <span>ครัวเรือนที่คุณสังกัด</span>
            </h3>

            <div className="space-y-2">
              {households.map((h) => (
                <div
                  key={h.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between ${
                    h.id === currentHousehold?.id
                      ? 'border-primary-500 bg-primary-50/40 dark:bg-primary-950/30'
                      : 'border-border bg-background'
                  }`}
                >
                  <div>
                    <span className="text-sm font-semibold text-foreground block">
                      {h.name}
                    </span>
                    <span className="text-xs text-muted">
                      บทบาท: {h.role === 'owner' ? 'เจ้าของครัวเรือน' : 'สมาชิก'}
                    </span>
                  </div>

                  {h.id !== currentHousehold?.id && (
                    <button
                      onClick={() => {
                        setCurrentHousehold(h);
                        toast.success(`สลับไปที่ "${h.name}" แล้ว`);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/10 transition"
                    >
                      สลับ
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logout Section */}
        <div className="rounded-2xl border border-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20 p-6 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-rose-700 dark:text-rose-300">
              ออกจากระบบ
            </h3>
            <p className="text-xs text-muted mt-0.5">
              คุณสามารถกลับเข้าสู่ระบบได้ตลอดเวลาด้วยอีเมลและรหัสผ่านเดิม
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.98] transition shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
