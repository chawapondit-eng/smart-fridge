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
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto my-6">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 flex items-center justify-center mb-4 shadow-inner">
          {icon}
        </div>
      )}
      <h3 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-muted mt-1.5 leading-relaxed max-w-xs">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-primary-600 hover:bg-primary-700 active:scale-[0.98] shadow-sm shadow-primary-600/20 transition-all"
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
}

