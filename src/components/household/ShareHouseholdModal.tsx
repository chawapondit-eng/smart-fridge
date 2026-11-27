'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Copy, Check, Share2 } from 'lucide-react';
import type { Household } from '@/types/database';

interface ShareHouseholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  household: Household | null;
}

export function ShareHouseholdModal({
  isOpen,
  onClose,
  household,
}: ShareHouseholdModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !household) return null;

  const currentH = household;
  const rawCode = currentH.id;
  const displayCode = rawCode.startsWith('#TY-')
    ? rawCode
    : `#TY-${rawCode.slice(0, 6).toUpperCase()}`;

  function handleCopy() {
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    toast.success(`คัดลอกรหัสบ้าน ${displayCode} แล้ว!`);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    const appUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/household`
        : '/household';
    const shareText = `มาช่วยกันดูแลตู้เย็นและลดขยะอาหารที่บ้าน "${currentH.name}" บน CheckTuYen กัน!\n\nรหัสเข้าร่วมบ้าน: ${displayCode}\nเข้าร่วมได้ที่: ${appUrl}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `เข้าร่วมตู้เย็น ${currentH.name}`,
          text: shareText,
        });
        toast.success('แชร์รหัสบ้านเรียบร้อยแล้ว');
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success('คัดลอกข้อความคำเชิญสำหรับส่งต่อแล้ว!');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-lg)] relative animate-in zoom-in-95 duration-200 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center mx-auto mb-3 border border-primary-600/15">
          <span className="material-symbols-outlined text-[30px]">cottage</span>
        </div>

        <h3 className="font-heading font-semibold text-lg text-foreground">
          รหัสแชร์ครัวเรือน
        </h3>
        <p className="text-xs text-muted mt-0.5">
          {currentH.name}
        </p>

        <div className="my-5 p-4 rounded-2xl bg-surface-container border border-border flex flex-col items-center justify-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            รหัสเข้าร่วมตู้เย็น (Household Code)
          </span>
          <span className="font-sans font-bold text-2xl tracking-widest text-primary-600 dark:text-primary-400 select-all">
            {displayCode}
          </span>
          <span className="text-[11px] text-muted leading-relaxed">
            ให้สมาชิกนำรหัสนี้ไปใส่ในหน้า &quot;จัดการบ้าน&quot; เพื่อเข้าถึงตู้เย็นร่วมกัน
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-low hover:bg-surface-container text-foreground font-semibold text-xs sm:text-sm border border-border transition active:scale-95 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-primary-600" />
                <span className="text-primary-600">คัดลอกแล้ว</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-muted" />
                <span>คัดลอกรหัส</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="ds-btn-primary flex items-center justify-center gap-2 py-3 px-4 text-xs sm:text-sm cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>แชร์ให้คนในบ้าน</span>
          </button>
        </div>
      </div>
    </div>
  );
}
