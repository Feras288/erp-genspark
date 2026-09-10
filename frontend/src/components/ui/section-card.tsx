import React from 'react';
import { cn } from '@/lib/ui';

export interface SectionCardProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section
      className={cn(
        'bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all',
        className,
      )}
    >
      {hasHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            {title && (
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}

      <div className={cn(noPadding ? 'p-0' : 'p-5', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
