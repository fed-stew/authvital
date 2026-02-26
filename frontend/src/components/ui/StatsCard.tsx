import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StatsCardProps {
  icon?: React.ReactNode;
  title: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  className?: string;
  isLoading?: boolean;
}

function StatsCard({
  icon,
  title,
  value,
  trend,
  subtitle,
  className,
  isLoading = false,
}: StatsCardProps) {
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;

  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-lg border border-white/10 bg-card p-6',
          className
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-white/5" />
            <div className="h-8 w-32 animate-pulse rounded bg-white/5" />
          </div>
          <div className="h-12 w-12 animate-pulse rounded-lg bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-white/10 bg-card p-6 transition-all hover:border-white/20',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <h3 className="text-3xl font-semibold text-foreground">
              {formattedValue}
            </h3>
            {trend && (
              <span
                className={cn(
                  'text-sm font-medium',
                  trend.isPositive ? 'text-green-400' : 'text-red-400'
                )}
              >
                {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export { StatsCard };
