'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, User, Leaf } from 'lucide-react';

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
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between antialiased relative overflow-hidden">
      {/* Subtle organic background accents */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary-100/70 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-surface-container/90 blur-3xl" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full pt-safe bg-card/85 backdrop-blur-xl border-b border-border sticky top-0">
        <div className="max-w-5xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              type="button"
              className="w-9 h-9 rounded-xl border border-border bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-foreground transition cursor-pointer"
              aria-label="ย้อนกลับ"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">kitchen</span>
              </div>
              <span className="font-heading font-semibold text-base text-foreground">CheckTuYen</span>
            </div>
          </div>

          <Link
            href="/login"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200/70 transition"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      {/* Main Content Form */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-4 py-8 max-w-md w-full mx-auto pb-safe">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-100 border border-primary-600/20 text-primary-700 dark:text-primary-300 text-xs font-semibold mb-3">
            <Leaf className="w-3.5 h-3.5 text-primary-600" />
            <span>เริ่มต้นดูแลครัวของคุณ</span>
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold text-foreground">
            สมัครสมาชิก CheckTuYen
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-1.5">
            ร่วมลดขยะอาหาร จัดระเบียบตู้เย็น และแชร์กับสมาชิกในบ้าน
          </p>
        </div>

        <form
          onSubmit={handleRegister}
          className="bg-card rounded-[22px] p-6 sm:p-7 shadow-[var(--shadow-md)] border border-border space-y-4"
        >
          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground" htmlFor="displayName">
              ชื่อของคุณ / ชื่อเล่น
            </label>
            <div className="ds-input relative flex items-center px-3.5 py-2.5">
              <User className="w-4 h-4 text-muted mr-2.5 shrink-0" />
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="เช่น แม่, นนท์, บี"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground" htmlFor="email">
              อีเมล
            </label>
            <div className="ds-input relative flex items-center px-3.5 py-2.5">
              <Mail className="w-4 h-4 text-muted mr-2.5 shrink-0" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground" htmlFor="password">
              รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)
            </label>
            <div className="ds-input relative flex items-center px-3.5 py-2.5">
              <Lock className="w-4 h-4 text-muted mr-2.5 shrink-0" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ตั้งรหัสผ่านของคุณ"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none"
                required
                minLength={6}
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

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground" htmlFor="confirmPassword">
              ยืนยันรหัสผ่านอีกครั้ง
            </label>
            <div className="ds-input relative flex items-center px-3.5 py-2.5">
              <Lock className="w-4 h-4 text-muted mr-2.5 shrink-0" />
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/70 outline-none"
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
                className="w-4 h-4 mt-0.5 rounded accent-primary-600 border-border cursor-pointer"
              />
              <span className="text-xs text-muted leading-relaxed">
                ฉันยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว
              </span>
            </label>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="ds-btn-primary w-full h-12 text-sm flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
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

          <div className="pt-4 text-center border-t border-border">
            <p className="text-xs text-muted">
              มีบัญชีผู้ใช้อยู่แล้วใช่ไหม?
              <Link
                href="/login"
                className="font-semibold text-primary-600 hover:text-primary-700 hover:underline ml-1.5"
              >
                เข้าสู่ระบบที่นี่
              </Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
