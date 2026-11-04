import React from 'react';

export type ItemStatusType = 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired' | 'fresh';

interface StatusBadgeProps {
  status: ItemStatusType;
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'sm' }: StatusBadgeProps) {
  const configs: Record<ItemStatusType, { bg: string; text: string; dot: string; defaultLabel: string }> = {
    fresh: {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
      defaultLabel: 'สดใหม่',
    },
    in_stock: {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
      defaultLabel: 'มีของ',
    },
    low_stock: {
      bg: 'bg-amber-500/10 dark:bg-amber-500/20',
      text: 'text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500',
      defaultLabel: 'ใกล้หมด',
    },
    out_of_stock: {
      bg: 'bg-slate-500/10 dark:bg-slate-500/20',
      text: 'text-slate-600 dark:text-slate-400',
      dot: 'bg-slate-400',
      defaultLabel: 'หมดแล้ว',
    },
    expiring_soon: {
      bg: 'bg-orange-500/10 dark:bg-orange-500/20',
      text: 'text-orange-700 dark:text-orange-300',
      dot: 'bg-orange-500',
      defaultLabel: 'ใกล้หมดอายุ',
    },
    expired: {
      bg: 'bg-rose-500/10 dark:bg-rose-500/20',
      text: 'text-rose-700 dark:text-rose-300',
      dot: 'bg-rose-500',
      defaultLabel: 'หมดอายุแล้ว',
    },
  };

  const config = configs[status] || configs.in_stock;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses} ${config.bg} ${config.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
}

