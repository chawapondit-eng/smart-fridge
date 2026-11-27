'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Refrigerator,
  Receipt,
  Sparkles,
  Leaf,
} from 'lucide-react';
import { FullPageAnimation } from '@/components/ui/FullPageAnimation';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setLoading(true);
    try {
      let email = identifier.trim();
      if (!email.includes('@')) {
        email = `${email.replace(/[^0-9a-zA-Z]/g, '')}@smartfridge.app`;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('กรุณายืนยันอีเมลในกล่องจดหมายของคุณก่อนเข้าสู่ระบบ');
        } else if (error.message.toLowerCase().includes('fetch')) {
          toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือลองใหม่อีกครั้ง');
        } else {
          toast.error(error.message || 'เข้าสู่ระบบไม่สำเร็จ');
        }
        setLoading(false);
        return;
      }

      if (data?.user) {
        setShowAnimation(true);
        setTimeout(() => {
          router.replace('/');
          router.refresh();
        }, 1100);
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      const message = raw.toLowerCase().includes('fetch')
        ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
        : raw || 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      toast.error(message);
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const email = identifier.trim();
    if (!email || !email.includes('@')) {
      toast('กรุณากรอกอีเมลของคุณในช่องด้านบนก่อน แล้วกด "ลืมรหัสผ่าน?" อีกครั้ง', { icon: 'ℹ️' });
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
      });
      if (error) throw error;
      toast.success(`ส่งลิงก์รีเซ็ตรหัสผ่านไปยัง ${email} เรียบร้อยแล้ว`);
    } catch {
      toast.error('ไม่สามารถส่งอีเมลรีเซ็ตรหัสผ่านได้ในขณะนี้ กรุณาลองใหม่');
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between antialiased relative overflow-hidden">
      {/* Subtle organic background accents */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary-100/70 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-surface-container/90 blur-3xl" />
      </div>

      {showAnimation && (
        <FullPageAnimation
          type="login"
          title="กำลังเข้าสู่ระบบ CheckTuYen..."
          subtitle="เปิดตู้เย็นและตรวจสอบวัตถุดิบในบ้านของคุณ ❄️"
        />
      )}

      {/* Minimal Unified Header */}
      <header className="relative z-10 w-full pt-safe bg-card/85 backdrop-blur-xl border-b border-border">
        <div className="max-w-5xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-[0_2px_6px_rgba(234,88,12,0.3)]">
              <span className="material-symbols-outlined text-[20px]">kitchen</span>
            </div>
            <div>
              <h1 className="font-heading font-semibold text-base text-foreground leading-tight">
                CheckTuYen
              </h1>
              <span className="text-[11px] text-primary-600 font-medium block">
                Smart Kitchen &amp; Fridge
              </span>
            </div>
          </div>

          <Link
            href="/register"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200/70 transition"
          >
            สมัครสมาชิกใหม่
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12 pb-safe">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Desktop Left Showcase Panel (Soft Green & Warm Beige SaaS Panel) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-between p-8 rounded-[24px] bg-primary-100/80 dark:bg-card border border-border shadow-[var(--shadow-sm)] min-h-[500px]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-border text-primary-700 dark:text-primary-300 text-xs font-semibold">
                <Leaf className="w-3.5 h-3.5 text-primary-600" />
                <span>ผู้ช่วยจัดการตู้เย็นในบ้าน</span>
              </div>
              <h2 className="font-heading text-3xl font-semibold text-foreground leading-snug">
                ดูแลวัตถุดิบในบ้านให้สดใหม่ และประหยัดงบทุกสัปดาห์
              </h2>
              <p className="text-sm text-muted leading-relaxed">
                ระบบจัดการตู้เย็นอัจฉริยะสำหรับครัวเรือน แจ้งเตือนก่อนหมดอายุ พร้อม AI อ่านใบเสร็จและแนะนำเมนูอาหารจากของที่มีอยู่จริง
              </p>
            </div>

            <div className="space-y-3 my-6">
              <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3.5 shadow-[var(--shadow-xs)]">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                  <Refrigerator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground">
                    จัดการหลายตู้เย็น &amp; แชร์ในครอบครัว
                  </h3>
                  <p className="text-xs text-muted">
                    อัปเดตสต็อกและติดตามวันหมดอายุแบบเรียลไทม์ร่วมกัน
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3.5 shadow-[var(--shadow-xs)]">
                <div className="w-10 h-10 rounded-xl bg-surface-container text-primary-600 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground">
                    สแกนใบเสร็จอัจฉริยะ
                  </h3>
                  <p className="text-xs text-muted">
                    ถ่ายภาพสลิปเพื่อนำเข้าวัตถุดิบและบันทึกงบอาหารอัตโนมัติ
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3.5 shadow-[var(--shadow-xs)]">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground">
                    AI ช่วยคิดเมนูลดขยะอาหาร
                  </h3>
                  <p className="text-xs text-muted">
                    ให้ความสำคัญกับวัตถุดิบที่ใกล้หมดอายุก่อนทุกมื้อ
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-primary-600/15 flex items-center justify-between text-xs text-muted">
              <span>ระบบจัดการครัวเรือนอัจฉริยะ</span>
              <span className="font-semibold text-primary-700 dark:text-primary-300">ใช้งานร่วมกันได้ทั้งบ้าน</span>
            </div>
          </div>

          {/* Right Sign In Form Card */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto">
            {/* Compact Header above Card */}
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left mb-6">
              <div className="w-14 h-14 rounded-2xl bg-primary-100 border border-primary-600/20 flex items-center justify-center mb-3.5 shadow-[var(--shadow-xs)] lg:hidden">
                <span className="material-symbols-outlined text-primary-600 text-[30px]">kitchen</span>
              </div>
              <h2 className="font-heading text-2xl sm:text-3xl font-semibold text-foreground">
                ยินดีต้อนรับกลับมา
              </h2>
              <p className="text-xs sm:text-sm text-muted mt-1.5 leading-relaxed">
                เข้าสู่ระบบเพื่อจัดการตู้เย็น วัตถุดิบ และงบประมาณในบ้านของคุณ
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              className="bg-card rounded-[22px] p-6 sm:p-7 shadow-[var(--shadow-md)] border border-border space-y-4"
            >
              {/* Email or Username Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground" htmlFor="identifier">
                  อีเมล หรือ ชื่อผู้ใช้
                </label>
                <div className="ds-input relative flex items-center px-3.5 py-2.5">
                  <Mail className="w-4 h-4 text-muted mr-2.5 shrink-0" />
                  <input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="name@email.com หรือ ชื่อผู้ใช้"
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground" htmlFor="password">
                  รหัสผ่าน
                </label>
                <div className="ds-input relative flex items-center px-3.5 py-2.5">
                  <Lock className="w-4 h-4 text-muted mr-2.5 shrink-0" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านของคุณ"
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted hover:text-primary-600 transition p-1 cursor-pointer"
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary-600 border-border cursor-pointer"
                  />
                  <span className="text-xs text-muted">จดจำฉันไว้ในระบบ</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline cursor-pointer"
                >
                  ลืมรหัสผ่าน?
                </button>
              </div>

              {/* Primary Sign In Action */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || showAnimation}
                  className="ds-btn-primary w-full h-12 text-sm flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>เข้าสู่ระบบ</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Sign Up Prompt */}
              <div className="pt-4 text-center border-t border-border">
                <p className="text-xs text-muted">
                  ยังไม่มีบัญชีใช่ไหม?
                  <Link
                    href="/register"
                    className="font-semibold text-primary-600 hover:text-primary-700 hover:underline ml-1.5"
                  >
                    สมัครสมาชิกใหม่
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
