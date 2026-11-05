'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
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
        } else {
          toast.error(error.message || 'เข้าสู่ระบบไม่สำเร็จ');
        }
        setLoading(false);
        return;
      }

      if (data?.user) {
        setShowAnimation(true);
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 1200);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      toast.error(message);
      setLoading(false);
    }
  }



  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between antialiased">
      {/* Full-Page Loading/Success Animation Overlay */}
      {showAnimation && (
        <FullPageAnimation
          type="login"
          title="กำลังเข้าสู่ระบบ CheckTuYen..."
          subtitle="เปิดตู้เย็นและตรวจสอบวัตถุดิบในบ้านของคุณ ❄️"
        />
      )}

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
            <h1 className="font-heading font-bold text-base text-on-surface">
              CheckTuYen
            </h1>
          </div>

          {/* Clean spacer */}
          <div className="w-10" />
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
            <h2 className="font-heading text-xl sm:text-2xl font-extrabold text-on-surface tracking-tight">
              เข้าสู่ระบบเพื่อเริ่มต้นการใช้งาน CheckTuYen
            </h2>
          </div>

          <p className="text-xs text-on-surface-variant mt-2 leading-relaxed max-w-xs">
            จัดการตู้เย็น ลดขยะอาหาร และประหยัดค่าใช้จ่ายในบ้านของคุณ
          </p>
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
              disabled={loading || showAnimation}
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

          {/* Sign Up Link Placed Directly Under Sign In Button */}
          <div className="pt-3 text-center border-t border-border/50">
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
        </form>
      </main>
    </div>
  );
}
