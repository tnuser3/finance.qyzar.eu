"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { MiniMarketLineChart } from "@/components/charts/mini-market-line-chart";
import {
  CHART_PREFETCH_DAYS,
  useTickerMarquee,
} from "@/components/overview/ticker-marquee-context";
import { AssetAvatar } from "@/components/ui/asset-avatar";
import { TrendBadge } from "@/components/ui/change-badge";
import { cn } from "@/lib/utils";

const HOVER_DELAY_MS = 1000;
const LEAVE_DELAY_MS = 160;
const PANEL_WIDTH = 568;
const PANEL_PADDING = 36;

export interface TickerHoverChartProps {
  symbol: string;
  name?: string;
  logo?: string | null;
  changePercent?: number;
  demoSeed?: number;
  assetType?: "stock" | "crypto";
  children: ReactNode;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function TickerHoverChart({
  symbol,
  name,
  logo,
  changePercent,
  demoSeed,
  assetType = "stock",
  children,
  className,
}: TickerHoverChartProps) {
  const marquee = useTickerMarquee();
  const targetId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const enterTimerRef = useRef<number | undefined>(undefined);
  const leaveTimerRef = useRef<number | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  }>({ top: 0, left: 0, placement: "bottom" });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    marquee?.setChartOpen(open);
    return () => {
      marquee?.setChartOpen(false);
    };
  }, [open, marquee]);

  useEffect(() => {
    if (!marquee) return;

    marquee.registerChartTarget({
      id: targetId,
      symbol,
      assetType,
      days: CHART_PREFETCH_DAYS,
      getElement: () => anchorRef.current,
    });

    return () => {
      marquee.unregisterChartTarget(targetId);
    };
  }, [marquee, targetId, symbol, assetType]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 440;
    const gutter = 12;
    const centerX = rect.left + rect.width / 2;
    const left = clamp(centerX, PANEL_WIDTH / 2 + gutter, window.innerWidth - PANEL_WIDTH / 2 - gutter);

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const showAbove = spaceBelow < panelHeight + gutter && spaceAbove > spaceBelow;

    setPosition({
      left,
      top: showAbove ? rect.top - gutter : rect.bottom + gutter,
      placement: showAbove ? "top" : "bottom",
    });
  }, []);

  const clearTimers = useCallback(() => {
    window.clearTimeout(enterTimerRef.current);
    window.clearTimeout(leaveTimerRef.current);
  }, []);

  const scheduleClose = useCallback(() => {
    window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPending(false);
    }, LEAVE_DELAY_MS);
  }, []);

  const handleEnter = useCallback(() => {
    window.clearTimeout(leaveTimerRef.current);
    setPending(true);

    enterTimerRef.current = window.setTimeout(() => {
      setOpen(true);
      setPending(false);
    }, HOVER_DELAY_MS);
  }, []);

  const handleLeave = useCallback(() => {
    window.clearTimeout(enterTimerRef.current);
    setPending(false);
    scheduleClose();
  }, [scheduleClose]);

  const handlePanelEnter = useCallback(() => {
    window.clearTimeout(leaveTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => clearTimers, [clearTimers]);

  const panel =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              top: position.top,
              left: position.left,
              width: PANEL_WIDTH,
              transform:
                position.placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
            }}
            className={cn(
              "pointer-events-auto fixed z-[100] rounded-xl border border-border/80 bg-popover/95 p-4 shadow-2xl backdrop-blur-md",
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300",
              position.placement === "top"
                ? "motion-safe:slide-in-from-bottom-2"
                : "motion-safe:slide-in-from-top-2"
            )}
            onMouseEnter={handlePanelEnter}
            onMouseLeave={handleLeave}
            role="dialog"
            aria-label={`${symbol} price chart`}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <AssetAvatar symbol={symbol} src={logo} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {symbol}
                </p>
                {name ? (
                  <p className="truncate text-xs text-muted-foreground">{name}</p>
                ) : null}
              </div>
              {changePercent != null ? (
                <TrendBadge value={changePercent} size="xs" />
              ) : null}
            </div>

            <MiniMarketLineChart
              ticker={symbol}
              assetType={assetType}
              demoSeed={demoSeed}
              width={PANEL_WIDTH - PANEL_PADDING}
              days={CHART_PREFETCH_DAYS}
              showHeader={false}
              showTimestamps
              showAxisLabels
              showChange={false}
              className="border-0 bg-transparent p-0 shadow-none"
            />

            <p className="mt-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Past 7 days
            </p>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={anchorRef}
        className={cn(
          "relative shrink-0 transition-colors duration-300",
          pending && "bg-accent/35",
          open && "bg-accent/20",
          className
        )}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
      >
        {pending ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border/60"
          >
            <span className="block h-full origin-left animate-[ticker-hover-progress_1s_linear_forwards] bg-primary/80" />
          </span>
        ) : null}
        {children}
      </div>
      {panel}
    </>
  );
}

export default TickerHoverChart;
