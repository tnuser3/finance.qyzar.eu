"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  AssetAvatar,
  ChangeBadge,
  TickerMarqueeSkeleton,
  TickerPrice,
  TickerRow,
  TickerShell,
  TickerStatusHeader,
  TickerSymbol,
} from "@/components/overview/ticker-primitives";
import { TickerHoverChart } from "@/components/overview/ticker-hover-chart";
import {
  TickerMarqueeProvider,
  useTickerMarquee,
} from "@/components/overview/ticker-marquee-context";
import {
  fetchMarketTickerQuotes,
  type MarketTickerQuote,
} from "@/lib/market-ticker-api";
import { cn } from "@/lib/utils";

export type { MarketTickerQuote };

function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (price < 10) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChange(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

function TickerItem({ quote }: { quote: MarketTickerQuote }) {
  return (
    <TickerHoverChart
      symbol={quote.symbol}
      name={quote.name}
      logo={quote.logo}
      changePercent={quote.changePercent}
      demoSeed={quote.price}
      assetType="stock"
    >
      <TickerRow
        aria-label={`${quote.symbol} ${formatPrice(quote.price)}, ${formatChange(quote.changePercent)} percent`}
      >
        <AssetAvatar symbol={quote.symbol} src={quote.logo} />
        <TickerSymbol symbol={quote.symbol} name={quote.name} />
        <TickerPrice>{formatPrice(quote.price)}</TickerPrice>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatChange(quote.change)}
        </span>
        <ChangeBadge value={quote.changePercent} />
      </TickerRow>
    </TickerHoverChart>
  );
}

export interface MarketTickerProps {
  quotes?: MarketTickerQuote[];
  limit?: number;
  refreshMs?: number;
  header?: ReactNode;
  className?: string;
}

export function MarketTicker({
  quotes: quotesProp,
  limit = 50,
  refreshMs = 900_000,
  header,
  className,
}: MarketTickerProps) {
  return (
    <TickerMarqueeProvider>
      <MarketTickerContent
        quotes={quotesProp}
        limit={limit}
        refreshMs={refreshMs}
        header={header}
        className={className}
      />
    </TickerMarqueeProvider>
  );
}

function MarketTickerContent({
  quotes: quotesProp,
  limit = 50,
  refreshMs = 900_000,
  header,
  className,
}: MarketTickerProps) {
  const marquee = useTickerMarquee();
  const [quotes, setQuotes] = useState<MarketTickerQuote[]>(quotesProp ?? []);
  const [isLoading, setIsLoading] = useState(!quotesProp);

  useEffect(() => {
    if (quotesProp) {
      setQuotes(quotesProp);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const items = await fetchMarketTickerQuotes(limit);
        if (!cancelled) {
          setQuotes(items);
          setIsLoading(false);
        }
      } catch {
        // Keep skeleton until the first successful fetch; retain last good quotes on refresh failure.
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, refreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [quotesProp, limit, refreshMs]);

  const showSkeleton = isLoading || quotes.length === 0;
  const items = showSkeleton ? null : [...quotes, ...quotes];

  return (
    <TickerShell
      className={cn(className)}
      header={
        header ?? (
          <TickerStatusHeader
            statusLabel={showSkeleton ? "Loading" : undefined}
            sectionLabel="Markets"
            variant={showSkeleton ? "muted" : "secondary"}
          />
        )
      }
      trackClassName={showSkeleton ? undefined : "animate-ticker"}
      paused={marquee?.paused}
      aria-label="Market ticker"
      aria-busy={showSkeleton}
    >
      {showSkeleton ? <TickerMarqueeSkeleton /> : items?.map((quote, index) => (
        <TickerItem key={`${quote.symbol}-${index}`} quote={quote} />
      ))}
    </TickerShell>
  );
}

export default MarketTicker;
