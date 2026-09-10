import React from 'react';
import { cn } from '@/lib/ui';

export interface ErrorBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  tone?: 'danger' | 'warning';
  className?: string;
}

export function ErrorBanner({
  title,
  message,
  onRetry,
  tone = 'danger',
  className,
}: ErrorBannerProps) {
  const isWarning = tone === 'warning';

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 flex items-start justify-between gap-3 text-sm mb-4 transition-all',
        isWarning
          ? 'bg-amber-50/80 border-amber-200 text-amber-900'
          : 'bg-rose-50/80 border-rose-200 text-rose-900',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 text-base" aria-hidden="true">
          {isWarning ? '⚠️' : '❌'}
        </span>
        <div>
          {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
          <p className="leading-relaxed text-xs sm:text-sm opacity-90">
            {message}
          </p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'shrink-0 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer',
            isWarning
              ? 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100'
              : 'bg-white border-rose-300 text-rose-800 hover:bg-rose-100',
          )}
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
