'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Home, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setLoading(true);
    try {
      // ตรวจสอบว่า identifier เป็น email หรือไม่
      let email = identifier.trim();
      if (!email.includes('@')) {
        // หากกรอกเบอร์โทรหรือชื่อผู้ใช้ ให้ลองแปลงเป็น email format สำหรับ supabase
        email = `${email.replace(/[^0-9a-zA-Z]/g, '')}@smartfridge.app`;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        } else {
          toast.error(error.message || 'เข้าสู่ระบบไม่สำเร็จ');
        }
        return;
      }

      if (data?.user) {
        toast.success('ยินดีต้อนรับกลับมา! 🎉');
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  // ทดลองใช้งานเป็นบ้านตัวอย่าง (Guest / Demo mode)
  async function handleGuestDemo() {
    setDemoLoading(true);
    try {
      const demoEmail = 'guest.demo@checktuyen.app';
      const demoPass = 'demo123456';

      let { data, error } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPass,
      });

      if (error) {
        // ถ้ายังไม่มี demo account ให้สมัครให้อัตโนมัติ
        const signUpRes = await supabase.auth.signUp({
          email: demoEmail,
          password: demoPass,
          options: {
            data: { display_name: 'ผู้ทดลองใช้งาน 🏡' },
          },
        });
        if (signUpRes.data?.user) {
          toast.success('เข้าสู่โหมดทดลองใช้งานเรียบร้อย!');
          router.push('/');
          router.refresh();
          return;
        } else {
          throw error;
        }
      }

      if (data?.user) {
        toast.success('เข้าสู่โหมดทดลองใช้งานเรียบร้อย!');
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      toast.error('ไม่สามารถเปิดบ้านตัวอย่างได้ในขณะนี้');
    } finally {
      setDemoLoading(false);
    }
  }

  // เข้าสู่ระบบด้วย OAuth
  async function handleOAuth(provider: 'google' | 'apple') {
    try {
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/`,
        },
      });
    } catch {
      toast.error(`เข้าสู่ระบบด้วย ${provider} ไม่สำเร็จ`);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between antialiased">
      {/* Top Header */}
      <header className="w-full pt-safe bg-surface/85 backdrop-blur-xl border-b border-border/60 shadow-[0_1px_8px_rgba(120,113,108,0.04)] sticky top-0 z-30">
        <div className="max-w-md mx-auto h-16 px-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            type="button"
            className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-low transition"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-600 text-[22px]">kitchen</span>
            <h1 className="font-heading font-bold text-base text-on-surface">เข้าสู่ระบบ</h1>
          </div>

          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-600 to-primary-400 flex items-center justify-center text-white shadow-sm">
            <span className="material-symbols-outlined text-[18px]">person</span>
          </div>
        </div>
      </header>

      {/* Main Content Form */}
      <main className="flex-1 flex flex-col justify-center px-4 py-8 max-w-md w-full mx-auto pb-safe">
        {/* Brand Mascot & Header */}
        <div className="flex flex-col items-center text-center mt-1 mb-6">
          {/* Playful Fridge Mascot */}
          <div className="relative w-20 h-20 mb-3 flex items-center justify-center">
            <div className="absolute inset-0 bg-primary-100 rounded-3xl scale-110 opacity-70 animate-pulse" />
            <div className="relative w-16 h-16 rounded-2xl bg-surface-container-lowest shadow-md flex items-center justify-center border border-primary-200">
              <span
                className="material-symbols-outlined text-primary-600 text-[38px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                kitchen
              </span>
              <span className="material-symbols-outlined text-secondary-600 absolute -top-1.5 -right-1.5 text-[22px] bg-white rounded-full p-0.5 shadow-sm">
                eco
              </span>
            </div>
          </div>

          {/* Title & Tagline */}
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-2xl font-extrabold text-on-surface tracking-tight">
              CheckTuYen
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-primary-100 font-bold text-[11px] text-primary-800">
              เช็คตู้เย็น
            </span>
          </div>

          <div className="mt-2 space-y-1">
            <h3 className="font-heading font-semibold text-base text-on-surface flex items-center justify-center gap-1.5">
              <span>ยินดีต้อนรับกลับมา!</span>
              <span>👋</span>
            </h3>
            <p className="text-xs text-on-surface-variant leading-relaxed max-w-xs">
              เข้าสู่ระบบเพื่อจัดการตู้เย็น ลดขยะอาหาร และประหยัดค่าใช้จ่ายในบ้าน
            </p>
          </div>
        </div>

        {/* Ambient Photo Collage Strip */}
        <div className="grid grid-cols-3 gap-2 mb-6 rounded-2xl overflow-hidden shadow-xs bg-surface-container-lowest p-1.5 border border-border">
          <div className="h-16 rounded-xl overflow-hidden relative">
            <img
              className="w-full h-full object-cover"
              alt="ผักสดในตู้เย็น"
              src="https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&q=80"
            />
          </div>
          <div className="h-16 rounded-xl overflow-hidden relative">
            <img
              className="w-full h-full object-cover"
              alt="กล่องถนอมอาหารในครัว"
              src="https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?w=300&q=80"
            />
          </div>
          <div className="h-16 rounded-xl overflow-hidden relative">
            <img
              className="w-full h-full object-cover"
              alt="ผลไม้สดพร้อมทาน"
              src="https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=300&q=80"
            />
          </div>
        </div>

        {/* Sign In Form Card */}
        <form
          onSubmit={handleLogin}
          className="bg-surface-container-lowest rounded-3xl p-5 sm:p-6 shadow-sm border border-border space-y-4"
        >
          {/* Email or Phone Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-on-surface" htmlFor="identifier">
              อีเมล หรือ เบอร์โทรศัพท์
            </label>
            <div className="relative flex items-center bg-surface-container-low rounded-2xl px-3.5 py-2.5 transition focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-500/30 border border-border/80">
              <Mail className="w-4 h-4 text-on-surface-variant mr-2.5 shrink-0" />
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="name@email.com หรือ 081-xxx-xxxx"
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-muted outline-none"
                required
              />
            </div>
          </div>

          {/* Password Input with Toggle */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-on-surface" htmlFor="password">
              รหัสผ่าน
            </label>
            <div className="relative flex items-center bg-surface-container-low rounded-2xl px-3.5 py-2.5 transition focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-500/30 border border-border/80">
              <Lock className="w-4 h-4 text-on-surface-variant mr-2.5 shrink-0" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านของคุณ"
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-muted outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted hover:text-primary-600 transition p-1"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Helper Row: Remember Me & Forgot Password */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-border"
              />
              <span className="text-xs text-on-surface-variant">จดจำฉันไว้ในระบบ</span>
            </label>
            <button
              type="button"
              onClick={() => toast('กรุณาติดต่อผู้ดูแลบ้านหรือลงทะเบียนใหม่', { icon: 'ℹ️' })}
              className="text-xs font-bold text-primary-600 hover:underline"
            >
              ลืมรหัสผ่าน?
            </button>
          </div>

          {/* Primary Sign In Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary-500/25 active:scale-[0.98] transition-all disabled:opacity-60"
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
        </form>

        {/* Household Guest / Demo Pill */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleGuestDemo}
            disabled={demoLoading}
            className="w-full py-3 px-4 rounded-2xl bg-surface-container-low hover:bg-surface-container border border-border flex items-center justify-between text-left active:scale-[0.99] transition-all shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">cottage</span>
              </div>
              <div>
                <p className="font-heading font-bold text-xs text-on-surface">
                  ทดลองใช้งานเป็นบ้านตัวอย่าง
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  สำรวจตู้เย็นตัวอย่างทันที ไม่ต้องสมัคร
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-primary-600 text-[20px]">
              chevron_right
            </span>
          </button>
        </div>

        {/* Social Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="w-full h-px bg-border" />
          <span className="absolute px-3 bg-surface text-xs text-muted font-medium">
            หรือเข้าสู่ระบบด้วย
          </span>
        </div>

        {/* Social Login Channels */}
        <div className="grid grid-cols-3 gap-3">
          {/* LINE Login */}
          <button
            type="button"
            onClick={() => toast('LINE Login รองรับเร็วๆ นี้!', { icon: '💬' })}
            className="flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl bg-surface-container-lowest border border-border shadow-xs hover:bg-surface-container-low active:scale-95 transition"
          >
            <div className="w-9 h-9 rounded-full bg-[#06C755] flex items-center justify-center shadow-xs mb-1 text-white">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 5.92 2 10.76c0 3.12 1.88 5.86 4.7 7.28-.21.78-.76 2.82-.87 3.25-.13.54.2.53.42.38.17-.11 2.37-1.61 3.33-2.27.79.12 1.6.18 2.42.18 5.52 0 10-3.92 10-8.76S17.52 2 12 2z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-on-surface">LINE</span>
          </button>

          {/* Google Login */}
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            className="flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl bg-surface-container-lowest border border-border shadow-xs hover:bg-surface-container-low active:scale-95 transition"
          >
            <div className="w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center shadow-xs mb-1">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.86c2.26-2.09 3.685-5.17 3.685-9.09z" fill="#4285F4" />
                <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.25 21.3 7.31 24 12 24z" fill="#34A853" />
                <path d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.27C.46 8.24 0 10.06 0 12s.46 3.76 1.27 5.38l4-3.09z" fill="#FBBC05" />
                <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.09c.95-2.85 3.6-4.96 6.73-4.96z" fill="#EA4335" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-on-surface">Google</span>
          </button>

          {/* Apple ID Login */}
          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            className="flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl bg-surface-container-lowest border border-border shadow-xs hover:bg-surface-container-low active:scale-95 transition"
          >
            <div className="w-9 h-9 rounded-full bg-stone-900 flex items-center justify-center shadow-xs mb-1 text-white">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 170 170">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.08-7.7-7.94-12.04-14.58-6.19-9.46-11.08-20.2-14.67-32.22-3.59-12.02-5.39-23.27-5.39-33.74 0-14.12 3.5-25.96 10.5-35.53 7-9.56 16.03-14.48 27.09-14.75 4.81 0 10.15 1.25 16.03 3.75 5.88 2.5 9.77 3.84 11.66 4.02 2.37-.36 6.55-1.84 12.55-4.44 6-2.6 11.22-3.8 15.66-3.6 11.75.59 21.05 4.97 27.91 13.14-10.42 6.33-15.5 15.11-15.26 26.35.24 8.78 3.52 16.05 9.85 21.8 6.33 5.75 13.88 9.07 22.65 9.97-2.3 7.07-5.2 14.15-8.71 21.25zM119.22 31.84c0-7.3 2.6-14.18 7.79-20.64 5.2-6.46 11.62-10.74 19.27-12.84.42 2.12.63 4.1.63 5.92 0 7.37-2.67 14.36-8.01 20.97-5.34 6.61-11.89 10.73-19.68 12.35-.4-1.95-.6-3.82-.6-5.76z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-on-surface">Apple</span>
          </button>
        </div>

        {/* Sign Up Prompt Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-on-surface-variant">
            ยังไม่มีบัญชีใช่ไหม?
            <Link
              href="/register"
              className="font-bold text-primary-600 hover:underline ml-1.5"
            >
              สมัครสมาชิกใหม่
            </Link>
          </p>
        </div>

        {/* Zero-Waste Motivation Badge */}
        <div className="mt-6 flex items-center justify-center gap-2 py-2 px-3.5 rounded-full bg-surface-container-low max-w-fit mx-auto shadow-xs border border-border">
          <span className="material-symbols-outlined text-secondary-600 text-[18px]">compost</span>
          <span className="text-[11px] text-on-surface-variant">
            ช่วยโลกประหยัดอาหารไปแล้วกว่า 12,450 มื้อในเดือนนี้ 🥬
          </span>
        </div>
      </main>
    </div>
  );
}
