import type * as React from "react";

import { cn } from "@/lib/utils";

function ChartTooltipPanel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-md backdrop-blur-sm",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
        className
      )}
      {...props}
    />
  );
}

function ChartTooltipTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-xs font-medium leading-none", className)}
      {...props}
    />
  );
}

function ChartTooltipValue({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-1.5 font-mono text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { ChartTooltipPanel, ChartTooltipTitle, ChartTooltipValue };
