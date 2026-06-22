"use client";

import { useCallback, useRef, useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTickerMarquee } from "@/components/overview/ticker-marquee-context";
import { cn } from "@/lib/utils";

/** Shared scroll speed for market + crypto tickers on small screens (px/s). */
const MOBILE_MARQUEE_PX_PER_SEC = 48;
const MOBILE_MARQUEE_QUERY = "(max-width: 639px)";

function useMobileMarqueeDuration(trackRef: React.RefObject<HTMLDivElement | null>) {
  const [durationSec, setDurationSec] = useState<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MARQUEE_QUERY);

    const update = () => {
      if (!media.matches) {
        setDurationSec(null);
        return;
      }

      const track = trackRef.current;

      if (!track || track.scrollWidth <= 0) {
        return;
      }

      setDurationSec(track.scrollWidth / 2 / MOBILE_MARQUEE_PX_PER_SEC);
    };

    update();

    const track = trackRef.current;
    const observer =
      track && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;

    observer?.observe(track!);
    media.addEventListener("change", update);
    window.addEventListener("resize", update);

    return () => {
      observer?.disconnect();
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [trackRef]);

  return durationSec;
}

export function TickerStatusHeader({
  statusLabel,
  sectionLabel,
  variant = "secondary",
  className,
}: {
  statusLabel?: string;
  sectionLabel: string;
  variant?: "outline" | "muted" | "secondary";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {statusLabel ? (
        <Badge variant={variant} size="xs">
          {statusLabel}
        </Badge>
      ) : null}
      <SectionLabel>{sectionLabel}</SectionLabel>
    </div>
  );
}

export function TickerShell({
  label,
  header,
  children,
  trackClassName,
  className,
  paused = false,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
}: {
  label?: string;
  header?: ReactNode;
  children: ReactNode;
  trackClassName?: string;
  className?: string;
  paused?: boolean;
  "aria-label"?: string;
  "aria-busy"?: boolean;
}) {
  const marquee = useTickerMarquee();
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mobileDurationSec = useMobileMarqueeDuration(trackRef);

  const handleViewportEnter = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !marquee) return;
    marquee.prefetchVisibleCharts(viewport);
  }, [marquee]);

  return (
    <div
      className={cn(
        "relative flex w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
      role="region"
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
    >
      {(label || header) && (
        <div className="flex shrink-0 items-center border-r border-border px-3 py-2 sm:px-4 sm:py-2.5">
          {header ?? <SectionLabel>{label}</SectionLabel>}
        </div>
      )}

      <div
        ref={viewportRef}
        className="group relative min-w-0 flex-1 overflow-hidden"
        onMouseEnter={handleViewportEnter}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
        <div
          ref={trackRef}
          className={cn(
            "flex w-max items-stretch py-1",
            paused
              ? "[animation-play-state:paused]"
              : "group-hover:[animation-play-state:paused]",
            trackClassName
          )}
          style={
            mobileDurationSec
              ? { animationDuration: `${mobileDurationSec}s` }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function TickerRowSkeleton() {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 px-3 py-1.5 sm:gap-2.5 sm:px-4",
        "border-r border-border/60 last:border-r-0"
      )}
      aria-hidden
    >
      <Skeleton className="size-5 shrink-0 rounded-full" shimmer={false} />
      <div className="space-y-1">
        <Skeleton className="h-3 w-10" shimmer={false} />
        <Skeleton className="hidden h-2 w-14 sm:block" shimmer={false} />
      </div>
      <Skeleton className="h-3 w-14" shimmer={false} />
      <Skeleton className="hidden h-3 w-10 sm:block" shimmer={false} />
      <Skeleton className="h-5 w-12 rounded-full" shimmer={false} />
    </div>
  );
}

export function TickerMarqueeSkeleton({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <TickerRowSkeleton key={index} />
      ))}
    </>
  );
}

export function TickerRow({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 px-3 py-1.5 sm:gap-2.5 sm:px-4",
        "border-r border-border/60 last:border-r-0",
        className
      )}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export { AssetAvatar } from "@/components/ui/asset-avatar";
export { ChangeBadge } from "@/components/ui/change-badge";

export function TickerSymbol({
  symbol,
  name,
}: {
  symbol: string;
  name?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs font-semibold leading-none tracking-tight text-foreground">
        {symbol}
      </span>
      {name ? (
        <span className="mt-0.5 hidden max-w-[7rem] truncate text-[10px] leading-none text-muted-foreground sm:block">
          {name}
        </span>
      ) : null}
    </div>
  );
}

export function TickerPrice({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-xs tabular-nums text-foreground">
      {children}
    </span>
  );
}
