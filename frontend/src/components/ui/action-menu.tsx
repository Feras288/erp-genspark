'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/ui';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'danger' | 'primary';
  icon?: React.ReactNode;
}

export interface ActionMenuProps {
  actions: ActionMenuItem[];
  label?: string;
  variant?: 'dropdown' | 'group';
  className?: string;
}

export function ActionMenu({
  actions,
  label = 'إجراءات',
  variant = 'dropdown',
  className,
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (variant === 'group') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 flex-wrap', className)}>
        {actions.map((act, idx) => {
          const isDanger = act.tone === 'danger';
          const isPrimary = act.tone === 'primary';

          return (
            <button
              key={idx}
              type="button"
              onClick={act.onClick}
              disabled={act.disabled}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                act.disabled
                  ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400'
                  : isDanger
                    ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/60'
                    : isPrimary
                      ? 'text-white bg-blue-600 hover:bg-blue-700 shadow-xs'
                      : 'text-slate-700 bg-white hover:bg-slate-100 border border-slate-200/80 shadow-xs',
              )}
            >
              {act.icon && <span className="shrink-0">{act.icon}</span>}
              <span>{act.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={menuRef} className={cn('relative inline-block text-right', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-xs transition-colors cursor-pointer"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>{label}</span>
        <svg
          className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', isOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg z-30 animate-in fade-in-50 duration-100">
          {actions.map((act, idx) => {
            const isDanger = act.tone === 'danger';

            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  act.onClick();
                }}
                disabled={act.disabled}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-right transition-colors cursor-pointer',
                  act.disabled
                    ? 'opacity-40 cursor-not-allowed text-slate-400'
                    : isDanger
                      ? 'text-rose-700 hover:bg-rose-50'
                      : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                {act.icon && <span className="shrink-0">{act.icon}</span>}
                <span className="flex-1 truncate">{act.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
