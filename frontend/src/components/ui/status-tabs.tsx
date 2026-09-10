'use client';

import React from 'react';
import { cn } from '@/lib/ui';

export interface StatusTabItem {
  label: string;
  value: string;
  count?: number;
}

export interface StatusTabsProps {
  tabs: StatusTabItem[];
  activeValue: string;
  onChange: (value: string) => void;
  className?: string;
}

export function StatusTabs({
  tabs,
  activeValue,
  onChange,
  className,
}: StatusTabsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.value === activeValue;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all shrink-0 cursor-pointer',
              isActive
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900',
            )}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 rounded-full text-[11px] font-semibold leading-none',
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-700 border border-slate-200/80',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
