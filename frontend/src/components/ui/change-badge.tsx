import { TrendingDown, TrendingUp } from "lucide-react";
import type * as React from "react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function trendVariant(
  value: number | undefined,
  fallbackUp = true
): BadgeProps["variant"] {
  const isUp = value != null ? value >= 0 : fallbackUp;
  return isUp ? "success" : "destructive";
}

export function ChangeBadge({
  value,
  showIcon = true,
  size = "default",
  className,
  format = (v) => {
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  },
}: {
  value: number;
  showIcon?: boolean;
  size?: BadgeProps["size"];
  className?: string;
  format?: (value: number) => string;
}) {
  const isUp = value >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <Badge
      variant={trendVariant(value)}
      size={size}
      className={cn("font-mono tabular-nums", className)}
    >
      {showIcon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {format(value)}
    </Badge>
  );
}

export function TrendBadge({
  value,
  fallbackUp = true,
  size = "default",
  className,
  format = (v) => {
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  },
}: {
  value: number | undefined;
  fallbackUp?: boolean;
  size?: BadgeProps["size"];
  className?: string;
  format?: (value: number) => string;
}) {
  if (value == null) return null;

  return (
    <Badge
      variant={trendVariant(value, fallbackUp)}
      size={size}
      className={cn("font-mono tabular-nums", className)}
    >
      {format(value)}
    </Badge>
  );
}
