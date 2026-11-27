'use client';

import React, { useState, useEffect } from 'react';
import { useHousehold } from '@/contexts/HouseholdContext';
import { X, Refrigerator } from 'lucide-react';
import type { Fridge } from '@/types/database';

interface FridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fridge?: Fridge | null;
}

const ICONS = ['❄️', '🧊', '🥦', '🥩', '🥤', '🍰', '🧁', '🍦', '🍶', '🍺', '⚡', '🍱'];

export function FridgeModal({ isOpen, onClose, fridge }: FridgeModalProps) {
  const { createFridge, updateFridge } = useHousehold();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('❄️');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fridge) {
      setName(fridge.name);
      setIcon(fridge.icon || '❄️');
    } else {
      setName('');
      setIcon('❄️');
    }
  }, [fridge, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      if (fridge) {
        await updateFridge(fridge.id, name, icon);
      } else {
        await createFridge(name, icon);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-[22px] border border-border bg-card p-6 shadow-[var(--shadow-lg)] relative animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center">
            <Refrigerator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {fridge ? 'แก้ไขข้อมูลตู้เย็น' : 'เพิ่มตู้เย็นใหม่'}
            </h3>
            <p className="text-xs text-muted">
              กำหนดชื่อและไอคอนประจำตู้เย็น
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              ชื่อตู้เย็น
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ตู้เย็นครัวใหญ่, ตู้แช่แข็ง, ตู้เย็นชั้น 2"
              required
              className="ds-input w-full px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              เลือกไอคอน
            </label>
            <div className="grid grid-cols-6 gap-2">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`h-11 rounded-xl text-xl flex items-center justify-center border transition-all cursor-pointer ${
                    icon === ic
                      ? 'border-primary-600 bg-primary-100 scale-105 shadow-xs'
                      : 'border-border bg-surface-container-low hover:bg-surface-container'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-foreground hover:bg-surface-container transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="ds-btn-primary px-5 py-2.5 text-sm disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'กำลังบันทึก...' : fridge ? 'บันทึกการแก้ไข' : 'เพิ่มตู้เย็น'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
