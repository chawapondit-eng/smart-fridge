'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, User, CheckCircle } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    if (!displayName.trim() || !email.trim() || !password) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (password.length < 6) {
      toast.error('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    if (!agreeTerms) {
      toast.error('กรุณายอมรับเงื่อนไขการใช้งาน');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
          },
        },
      });

      if (error) {
        toast.error(error.message || 'การสมัครสมาชิกล้มเหลว');
        return;
      }

      if (data?.user) {
        // บันทึกข้อมูล profile ในตาราง public.users
        try {
          await supabase.from('users').upsert({
            id: data.user.id,
            email: email.trim(),
            display_name: displayName.trim(),
          });
        } catch {
          // ignore
        }

        if (data.session) {
          toast.success('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ CheckTuYen');
          router.replace('/');
          router.refresh();
        } else {
          toast.success('สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชีแล้วเข้าสู่ระบบ');
          router.replace('/login');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      toast.error(message);
    } finally {
      setLoading(false);
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
            <h1 className="font-heading font-bold text-base text-on-surface">สร้างบัญชีใหม่</h1>
          </div>

          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-600 to-primary-400 flex items-center justify-center text-white shadow-sm">
            <span className="material-symbols-outlined text-[18px]">person_add</span>
          </div>
        </div>
      </header>

      {/* Main Content Form */}
      <main className="flex-1 flex flex-col justify-center px-4 py-8 max-w-md w-full mx-auto pb-safe">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-bold mb-2">
            <span className="material-symbols-outlined text-[15px]">eco</span>
            <span>เริ่มต้นดูแลครัวของคุณ</span>
          </div>
          <h2 className="font-heading text-2xl font-bold text-on-surface">
            สมัครสมาชิก CheckTuYen
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            ร่วมลดขยะอาหาร จัดระเบียบตู้เย็น และแชร์กับสมาชิกในบ้าน
          </p>
        </div>

        <form
          onSubmit={handleRegister}
          className="bg-surface-container-lowest rounded-3xl p-5 sm:p-6 shadow-sm border border-border space-y-4"
        >
          {/* Display Name Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-on-surface" htmlFor="displayName">
              ชื่อของคุณ / ชื่อเล่น
            </label>
            <div className="relative flex items-center bg-surface-container-low rounded-2xl px-3.5 py-2.5 transition focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-500/30 border border-border/80">
              <User className="w-4 h-4 text-on-surface-variant mr-2.5 shrink-0" />
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="เช่น แม่, นนท์, บี"
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-muted outline-none"
                required
              />
            </div>
          </div>

          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-on-surface" htmlFor="email">
              อีเมล
            </label>
            <div className="relative flex items-center bg-surface-container-low rounded-2xl px-3.5 py-2.5 transition focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-500/30 border border-border/80">
              <Mail className="w-4 h-4 text-on-surface-variant mr-2.5 shrink-0" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-muted outline-none"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-on-surface" htmlFor="password">
              รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)
            </label>
            <div className="relative flex items-center bg-surface-container-low rounded-2xl px-3.5 py-2.5 transition focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-500/30 border border-border/80">
              <Lock className="w-4 h-4 text-on-surface-variant mr-2.5 shrink-0" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ตั้งรหัสผ่านของคุณ"
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-muted outline-none"
                required
                minLength={6}
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

          {/* Confirm Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-on-surface" htmlFor="confirmPassword">
              ยืนยันรหัสผ่านอีกครั้ง
            </label>
            <div className="relative flex items-center bg-surface-container-low rounded-2xl px-3.5 py-2.5 transition focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-500/30 border border-border/80">
              <Lock className="w-4 h-4 text-on-surface-variant mr-2.5 shrink-0" />
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง"
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-muted outline-none"
                required
                minLength={6}
              />
            </div>
          </div>

          {/* Agree Terms */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500 border-border"
              />
              <span className="text-xs text-on-surface-variant leading-relaxed">
                ฉันยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว
              </span>
            </label>
          </div>

          {/* Submit Button */}
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
                  <span>สร้างบัญชีผู้ใช้</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Login Prompt Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-on-surface-variant">
            มีบัญชีผู้ใช้อยู่แล้วใช่ไหม?
            <Link
              href="/login"
              className="font-bold text-primary-600 hover:underline ml-1.5"
            >
              เข้าสู่ระบบที่นี่
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
