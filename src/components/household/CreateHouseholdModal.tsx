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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-[22px] border border-border bg-card p-6 sm:p-8 shadow-[var(--shadow-lg)] relative animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-4">
          <Home className="w-6 h-6" />
        </div>

        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {mode === 'create' ? 'สร้างครัวเรือนใหม่ 🏡' : 'เข้าร่วมครัวเรือนด้วยรหัสคำเชิญ 🔑'}
        </h2>
        <p className="text-xs sm:text-sm text-muted mt-1 leading-relaxed">
          {mode === 'create'
            ? 'เริ่มต้นสร้างพื้นที่สำหรับจัดการตู้เย็นร่วมกับคนในบ้าน'
            : 'กรอกรหัส Invite Code ที่ได้รับจากหัวหน้าครัวเรือน'}
        </p>

        {/* Tab Toggle */}
        <div className="flex rounded-xl bg-surface-container p-1 mt-5 border border-border">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'create'
                ? 'bg-card text-foreground shadow-[var(--shadow-xs)]'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>สร้างครัวเรือนใหม่</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'join'
                ? 'bg-card text-foreground shadow-[var(--shadow-xs)]'
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
                className="ds-input w-full px-3.5 py-2.5 text-sm"
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
                className="ds-input w-full px-3.5 py-2.5 text-sm uppercase tracking-widest font-mono"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="ds-btn-primary w-full py-3 px-4 text-sm disabled:opacity-60 flex items-center justify-center gap-2 mt-2 cursor-pointer"
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
