'use client';

import React, { useState } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { Home, KeyRound, Plus, ArrowRight } from 'lucide-react';

interface CreateHouseholdModalProps {
  isOpen: boolean;
}

export function CreateHouseholdModal({ isOpen }: CreateHouseholdModalProps) {
  const { createHousehold, joinHousehold } = useHousehold();

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === 'create') {
        const trimmed = householdName.trim();
        if (!trimmed) return;
        // Auto-detect: ถ้าเผลอนำรหัสคำเชิญมากรอกในช่องชื่อบ้าน ให้เปลี่ยนเป็นการเข้าร่วมบ้านอัตโนมัติ
        if (
          trimmed.toUpperCase().startsWith('#TY-') ||
          trimmed.toUpperCase().startsWith('TY-') ||
          trimmed.toUpperCase().startsWith('HH-') ||
          trimmed.toUpperCase().startsWith('FRIDGE-') ||
          trimmed.toUpperCase().startsWith('HOME-')
        ) {
          await joinHousehold(trimmed);
          return;
        }
        await createHousehold(trimmed);
      } else {
        if (!inviteCode.trim()) return;
        await joinHousehold(inviteCode);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 flex items-center justify-center mb-4 shadow-inner">
          <Home className="w-6 h-6" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {mode === 'create' ? 'สร้างครัวเรือนใหม่ 🏡' : 'เข้าร่วมครัวเรือนด้วยรหัสคำเชิญ 🔑'}
        </h2>
        <p className="text-xs sm:text-sm text-muted mt-1 leading-relaxed">
          {mode === 'create'
            ? 'เริ่มต้นสร้างพื้นที่สำหรับจัดการตู้เย็นร่วมกับคนในบ้าน'
            : 'กรอกรหัส Invite Code ที่ได้รับจากหัวหน้าครัวเรือน'}
        </p>

        {/* Tab Toggle */}
        <div className="flex rounded-xl bg-muted/10 p-1 mt-5 border border-border">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'create'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>สร้างครัวเรือนใหม่</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'join'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>มีรหัสคำเชิญ</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-5">
          {mode === 'create' ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                ชื่อครัวเรือน
              </label>
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="เช่น บ้านสุขสันต์, คอนโดสุขุมวิท"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                รหัสคำเชิญ (Invite Code)
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="เช่น HOME-ABCD-1234"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground uppercase tracking-widest font-mono focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60 shadow-md shadow-primary-600/20 transition flex items-center justify-center gap-2 mt-2"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'create' ? 'สร้างครัวเรือน' : 'เข้าร่วมตอนนี้'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

