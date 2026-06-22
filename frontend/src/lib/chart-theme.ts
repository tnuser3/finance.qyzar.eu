/** Chart palette and SVG-adjacent UI tokens. */

export const CHART_SERIES_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

export const CHART_MARKER_COLORS = {
  low: "hsl(var(--muted-foreground))",
  medium: "hsl(var(--chart-4))",
  high: "hsl(var(--chart-5))",
} as const;

export const chartUi = {
  chartSurface:
    "rounded-lg border border-border/60 bg-muted/30 px-1 py-2 dark:bg-muted/20",
  emptyState:
    "flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-sm text-muted-foreground",
  legendDot: "inline-block size-2 shrink-0 rounded-full",
} as const;

export function trendStrokeColor(value: number | undefined, fallbackUp = true): string {
  const isUp = value != null ? value >= 0 : fallbackUp;
  return isUp ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";
}
