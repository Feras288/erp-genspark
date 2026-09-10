import React from 'react';
import { cn } from '@/lib/ui';

export type StatusBadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export interface StatusBadgeProps {
  status: string;
  tone?: StatusBadgeTone;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
  showDot?: boolean;
}

/**
 * Maps standard ERP domain statuses to semantic color tones
 */
export function resolveStatusTone(status: string): StatusBadgeTone {
  const s = status.toUpperCase();

  // Success / Positive / Finalized
  if (
    [
      'POSTED',
      'PAID',
      'ISSUED',
      'RECEIVED',
      'MATCHED',
      'SUCCESS',
      'ACTIVE',
      'OPEN',
      'EXACT',
    ].includes(s)
  ) {
    return 'success';
  }

  // Warning / In-Progress / Draft
  if (
    [
      'DRAFT',
      'PENDING',
      'PARTIAL',
      'PARTIALLY_PAID',
      'SUGGESTED',
      'WARNING',
      'REVERTED',
    ].includes(s)
  ) {
    return 'warning';
  }

  // Danger / Terminated / Voided
  if (
    [
      'CANCELLED',
      'FAILED',
      'BLOCKED',
      'ERROR',
      'CLOSED',
      'REJECTED',
      'CONFLICT',
    ].includes(s)
  ) {
    return 'danger';
  }

  // Information / Neutral
  return 'info';
}

/**
 * Standard Arabic labels for common ERP statuses
 */
export const STATUS_LABELS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  ISSUED: 'صادرة',
  RECEIVED: 'مستلمة',
  PAID: 'مدفوعة',
  PARTIALLY_PAID: 'مدفوعة جزئياً',
  UNPAID: 'غير مسددة',
  POSTED: 'مرحلة',
  CANCELLED: 'ملغاة',
  OPEN: 'مفتوحة',
  CLOSED: 'مغلقة',
  MATCHED: 'مطابقة',
  UNMATCHED: 'غير مطابقة',
  EXACT: 'تطابق تام',
  SUGGESTED: 'مقترحة',
  ACTIVE: 'نشط',
  INACTIVE: 'غير نشط',
};

const toneStyles: Record<
  StatusBadgeTone,
  {
    bg: string;
    text: string;
    border: string;
    dot: string;
  }
> = {
  neutral: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
  success: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200/80',
    dot: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200/80',
    dot: 'bg-amber-500',
  },
  danger: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200/80',
    dot: 'bg-rose-500',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200/80',
    dot: 'bg-blue-500',
  },
};

export function StatusBadge({
  status,
  tone,
  label,
  size = 'sm',
  className,
  showDot = true,
}: StatusBadgeProps) {
  const effectiveTone = tone ?? resolveStatusTone(status);
  const displayLabel =
    label ?? STATUS_LABELS_AR[status.toUpperCase()] ?? status;
  const currentStyle = toneStyles[effectiveTone] || toneStyles.neutral;

  const sizeClasses =
    size === 'md'
      ? 'px-3 py-1 text-xs gap-1.5 font-semibold'
      : 'px-2.5 py-0.5 text-[11px] gap-1.5 font-medium';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border transition-colors shrink-0',
        sizeClasses,
        currentStyle.bg,
        currentStyle.text,
        currentStyle.border,
        className,
      )}
    >
      {showDot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', currentStyle.dot)}
          aria-hidden="true"
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
