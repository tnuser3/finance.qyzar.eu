"use client";

import { useEffect, useState } from "react";

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
  fetchCryptoMarketTickerQuotes,
  type CryptoTickerQuote,
} from "@/lib/market-ticker-api";
import { cn } from "@/lib/utils";

export type { CryptoTickerQuote };

function formatCryptoPrice(price: number): string {
  const abs = Math.abs(price);

  if (abs >= 1) {
    return price.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (abs >= 0.01) {
    return price.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 6,
    maximumFractionDigits: 8,
  });
}

function CryptoTickerItem({ quote }: { quote: CryptoTickerQuote }) {
  return (
    <TickerHoverChart
      symbol={quote.symbol}
      name={quote.name}
      logo={quote.icon}
      changePercent={quote.changePercent}
      demoSeed={quote.price}
      assetType="crypto"
    >
      <TickerRow
        aria-label={`${quote.symbol} ${formatCryptoPrice(quote.price)}, ${quote.changePercent.toFixed(2)} percent`}
      >
        <AssetAvatar symbol={quote.symbol} src={quote.icon} />
        <TickerSymbol symbol={quote.symbol} name={quote.name} />
        <TickerPrice>{formatCryptoPrice(quote.price)}</TickerPrice>
        <ChangeBadge value={quote.changePercent} />
      </TickerRow>
    </TickerHoverChart>
  );
}

export interface CryptoMarketTickerProps {
  quotes?: CryptoTickerQuote[];
  limit?: number;
  refreshMs?: number;
  className?: string;
}

export function CryptoMarketTicker({
  quotes: quotesProp,
  limit = 15,
  refreshMs = 60_000,
  className,
}: CryptoMarketTickerProps) {
  return (
    <TickerMarqueeProvider>
      <CryptoMarketTickerContent
        quotes={quotesProp}
        limit={limit}
        refreshMs={refreshMs}
        className={className}
      />
    </TickerMarqueeProvider>
  );
}

function CryptoMarketTickerContent({
  quotes: quotesProp,
  limit = 15,
  refreshMs = 60_000,
  className,
}: CryptoMarketTickerProps) {
  const marquee = useTickerMarquee();
  const [quotes, setQuotes] = useState<CryptoTickerQuote[]>(quotesProp ?? []);
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
        const items = await fetchCryptoMarketTickerQuotes(limit);
        if (!cancelled) {
          setQuotes(items);
          setIsLoading(false);
        }
      } catch {
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
        <TickerStatusHeader
          statusLabel={showSkeleton ? "Loading" : undefined}
          sectionLabel="Crypto"
          variant={showSkeleton ? "muted" : "secondary"}
        />
      }
      trackClassName={showSkeleton ? undefined : "animate-ticker-crypto"}
      paused={marquee?.paused}
      aria-label="Crypto market ticker"
      aria-busy={showSkeleton}
    >
      {showSkeleton ? (
        <TickerMarqueeSkeleton />
      ) : (
        items?.map((quote, index) => (
          <CryptoTickerItem key={`${quote.symbol}-${index}`} quote={quote} />
        ))
      )}
    </TickerShell>
  );
}

export default CryptoMarketTicker;
