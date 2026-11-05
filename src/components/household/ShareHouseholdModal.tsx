'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Copy, Check, Share2, Users, QrCode } from 'lucide-react';
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
    navigator.clipboard.writeText(rawCode);
    setCopied(true);
    toast.success(`คัดลอกรหัสบ้าน ${displayCode} แล้ว!`);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    const shareText = `มาช่วยกันดูแลตู้เย็นและลดขยะอาหารที่บ้าน "${currentH.name}" บน CheckTuYen กัน!\n\nรหัสเข้าร่วมบ้าน: ${rawCode}\nเปิดใช้งานได้ที่: https://checktuyen.app/household`;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-muted hover:text-foreground hover:bg-muted/10 transition"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Mascot Icon */}
        <div className="w-16 h-16 rounded-3xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
          <span className="material-symbols-outlined text-[32px]">cottage</span>
        </div>

        {/* Title & Household Name */}
        <h3 className="font-heading font-extrabold text-lg text-foreground">
          รหัสแชร์ครัวเรือน
        </h3>
        <p className="text-xs text-muted mt-0.5">
          ตู้เย็น บ้านคุณ{household.name}
        </p>

        {/* Share Code Card */}
        <div className="my-5 p-4 rounded-2xl bg-surface-container-low border border-border/80 flex flex-col items-center justify-center gap-1.5 shadow-inner">
          <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
            รหัสเข้าร่วมตู้เย็น (Household Code)
          </span>
          <span className="font-heading font-extrabold text-2xl tracking-widest text-primary-600 select-all">
            {displayCode}
          </span>
          <span className="text-[10px] text-muted">
            ให้สมาชิกนำรหัสนี้ไปใส่ในหน้า &quot;จัดการบ้าน&quot; เพื่อเข้าถึงตู้เย็นร่วมกัน
          </span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-surface-container-high hover:bg-surface-container text-foreground font-bold text-xs sm:text-sm border border-border transition active:scale-95 shadow-xs"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-secondary-600" />
                <span className="text-secondary-600">คัดลอกแล้ว</span>
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
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs sm:text-sm transition active:scale-95 shadow-md shadow-primary-500/25"
          >
            <Share2 className="w-4 h-4" />
            <span>แชร์ให้คนในบ้าน</span>
          </button>
        </div>
      </div>
    </div>
  );
}
