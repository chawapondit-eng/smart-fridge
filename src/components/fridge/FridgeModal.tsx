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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-muted/10 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 flex items-center justify-center">
            <Refrigerator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition"
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
                  className={`h-11 rounded-xl text-xl flex items-center justify-center border transition-all ${
                    icon === ic
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 scale-105 shadow-sm'
                      : 'border-border bg-background hover:bg-muted/10'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm font-medium text-foreground hover:bg-muted/10 transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl font-medium text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60 shadow-sm transition"
            >
              {submitting ? 'กำลังบันทึก...' : fridge ? 'บันทึกการแก้ไข' : 'เพิ่มตู้เย็น'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

