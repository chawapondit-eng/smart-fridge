import React from 'react';

export type ItemStatusType = 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired' | 'fresh';

interface StatusBadgeProps {
  status: ItemStatusType;
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'sm' }: StatusBadgeProps) {
  const configs: Record<ItemStatusType, { bg: string; text: string; dot: string; border: string; defaultLabel: string }> = {
    fresh: {
      bg: 'bg-emerald-500/12 dark:bg-emerald-500/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
      border: 'border-emerald-500/20',
      defaultLabel: 'สดใหม่',
    },
    in_stock: {
      bg: 'bg-primary-100',
      text: 'text-primary-700 dark:text-primary-300',
      dot: 'bg-primary-600',
      border: 'border-primary-600/20',
      defaultLabel: 'มีของ',
    },
    low_stock: {
      bg: 'bg-amber-500/12 dark:bg-amber-500/20',
      text: 'text-amber-800 dark:text-amber-300',
      dot: 'bg-amber-500',
      border: 'border-amber-500/25',
      defaultLabel: 'ใกล้หมด',
    },
    out_of_stock: {
      bg: 'bg-surface-container',
      text: 'text-muted',
      dot: 'bg-muted',
      border: 'border-border',
      defaultLabel: 'หมดแล้ว',
    },
    expiring_soon: {
      bg: 'bg-amber-500/12 dark:bg-amber-500/20',
      text: 'text-amber-800 dark:text-amber-300',
      dot: 'bg-amber-500',
      border: 'border-amber-500/25',
      defaultLabel: 'ใกล้หมดอายุ',
    },
    expired: {
      bg: 'bg-rose-500/12 dark:bg-rose-500/20',
      text: 'text-rose-700 dark:text-rose-300',
      dot: 'bg-rose-500',
      border: 'border-rose-500/25',
      defaultLabel: 'หมดอายุแล้ว',
    },
  };

  const config = configs[status] || configs.in_stock;
  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${sizeClasses} ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
}
