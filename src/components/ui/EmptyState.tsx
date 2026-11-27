import React, { type ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-[20px] border border-dashed border-border bg-card p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto my-4 shadow-[var(--shadow-xs)]">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 dark:text-primary-300 flex items-center justify-center mb-4 border border-primary-600/15">
          {icon}
        </div>
      )}
      <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground tracking-tight">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-muted mt-1.5 leading-relaxed max-w-xs">
        {description}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] shadow-[0_2px_8px_-2px_rgba(234,88,12,0.35)] transition-all cursor-pointer"
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
}
