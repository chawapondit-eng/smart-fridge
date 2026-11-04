import React from 'react';

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-muted/20" />
        <div className="w-16 h-5 rounded-full bg-muted/20" />
      </div>
      <div className="space-y-2">
        <div className="w-3/4 h-5 rounded-md bg-muted/20" />
        <div className="w-1/2 h-3.5 rounded-md bg-muted/15" />
      </div>
      <div className="pt-2 border-t border-border flex items-center justify-between">
        <div className="w-20 h-4 rounded-md bg-muted/20" />
        <div className="w-12 h-6 rounded-lg bg-muted/20" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted/20 flex-shrink-0" />
        <div className="space-y-1.5">
          <div className="w-28 sm:w-40 h-4 rounded bg-muted/20" />
          <div className="w-20 h-3 rounded bg-muted/15" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 h-6 rounded-full bg-muted/20" />
        <div className="w-20 h-8 rounded-lg bg-muted/20" />
      </div>
    </div>
  );
}

