import React from 'react';

export function SkeletonCard() {
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 space-y-4 animate-pulse shadow-[var(--shadow-xs)]">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-surface-container" />
        <div className="w-16 h-5 rounded-full bg-surface-container" />
      </div>
      <div className="space-y-2">
        <div className="w-3/4 h-5 rounded-lg bg-surface-container" />
        <div className="w-1/2 h-3.5 rounded-lg bg-surface-container-low" />
      </div>
      <div className="pt-3 border-t border-border flex items-center justify-between">
        <div className="w-20 h-4 rounded-lg bg-surface-container" />
        <div className="w-16 h-7 rounded-xl bg-surface-container" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="rounded-[18px] border border-border bg-card p-4 flex items-center justify-between gap-4 animate-pulse shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-surface-container flex-shrink-0" />
        <div className="space-y-2">
          <div className="w-32 sm:w-44 h-4 rounded-md bg-surface-container" />
          <div className="w-20 h-3 rounded-md bg-surface-container-low" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 h-6 rounded-full bg-surface-container" />
        <div className="w-20 h-8 rounded-xl bg-surface-container" />
      </div>
    </div>
  );
}
