import React from 'react';
import { cn } from '@/lib/ui';

export interface LoadingStateProps {
  message?: string;
  rows?: number;
  variant?: 'spinner' | 'skeleton';
  className?: string;
}

export function LoadingState({
  message = 'جاري تحميل البيانات...',
  rows = 4,
  variant = 'spinner',
  className,
}: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className={cn('w-full space-y-3 p-4 animate-pulse', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-10 bg-slate-100 rounded-xl w-full"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-12 text-center',
        className,
      )}
    >
      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin mb-3" />
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

export function LoadingSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn('animate-pulse bg-slate-200/80 rounded-xl', className)}
    />
  );
}
