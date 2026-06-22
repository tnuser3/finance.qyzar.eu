"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  API_STATUS_CACHE_TTL_MS,
  clearApiStatusCache,
  fetchApiStatus,
  getApiStatusCacheAgeMs,
  type ApiProviderStatus,
  type ApiProviderStatusSnapshot,
  type ApiStatusPayload,
} from "@/lib/api-status-api";
import { cn } from "@/lib/utils";
import { motionStagger } from "@/lib/motion";

const CATEGORY_LABELS: Record<string, string> = {
  market: "Market Data",
  crypto: "Crypto",
  news: "News",
  macro: "Macro",
  government: "Government",
  regulatory: "Regulatory",
  social: "Social",
  ai: "AI",
};

function statusBadgeVariant(
  status: ApiProviderStatus
): "success" | "destructive" | "warning" | "muted" | "secondary" {
  switch (status) {
    case "ready":
      return "success";
    case "error":
      return "destructive";
    case "degraded":
      return "warning";
    case "unconfigured":
      return "muted";
    default:
      return "secondary";
  }
}

function StatusIcon({ status }: { status: ApiProviderStatus }) {
  const className = "size-3.5 shrink-0";

  switch (status) {
    case "ready":
      return <CheckCircle2 className={cn(className, "text-success")} />;
    case "error":
      return <XCircle className={cn(className, "text-destructive")} />;
    case "degraded":
      return <AlertCircle className={cn(className, "text-warning")} />;
    case "unconfigured":
      return <CircleDashed className={cn(className, "text-muted-foreground")} />;
    default:
      return <HelpCircle className={cn(className, "text-muted-foreground")} />;
  }
}

function formatStatusLabel(status: ApiProviderStatus): string {
  switch (status) {
    case "ready":
      return "Operational";
    case "degraded":
      return "Limited";
    case "unconfigured":
      return "Not configured";
    case "error":
      return "Unavailable";
    default:
      return "Unknown";
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) {
    return "Never";
  }

  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60_000);

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return new Date(iso).toLocaleDateString();
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCacheAge(ms: number | null): string | null {
  if (ms === null) {
    return null;
  }

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return "Updated moments ago";
  }

  return `Updated ${minutes}m ago · refreshes every 15 minutes`;
}

function SummaryStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card
          key={index}
          className="rounded-lg border-border/80 bg-muted/30 p-4 shadow-none"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-8 w-10" />
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-28" />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

function ProviderTableRow({
  provider,
  index,
}: {
  provider: ApiProviderStatusSnapshot;
  index: number;
}) {
  const successRate =
    provider.requestCount > 0
      ? Math.round((provider.successCount / provider.requestCount) * 100)
      : null;

  return (
    <TableRow className={motionStagger(index, 40)}>
      <TableCell>
        <div className="flex items-start gap-3">
          <Avatar className="mt-0.5 size-8 rounded-md">
            <AvatarFallback className="rounded-md bg-background">
              <StatusIcon status={provider.status} />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{provider.name}</span>
              {!provider.configured && provider.requiresApiKey && (
                <Badge variant="muted" className="text-[10px]">
                  Not configured
                </Badge>
              )}
              {provider.rateLimit.rateLimited && (
                <Badge variant="warning" className="text-[10px]">
                  Temporarily limited
                </Badge>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {provider.description}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant(provider.status)} className="font-medium">
          {formatStatusLabel(provider.status)}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-sm tabular-nums text-muted-foreground">
          {successRate !== null ? `${successRate}%` : "—"}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            {provider.requestCount > 0
              ? `${provider.successCount} of ${provider.requestCount} successful`
              : "No recent activity"}
          </p>
          {provider.lastError ? (
            <p className="truncate text-xs text-destructive" title={provider.lastError}>
              {provider.lastError}
            </p>
          ) : provider.lastSuccessAt ? (
            <p className="text-xs text-muted-foreground">
              Last successful {formatRelativeTime(provider.lastSuccessAt)}
            </p>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export interface ApiStatusPanelProps {
  refreshMs?: number;
  className?: string;
}

export function ApiStatusPanel({
  refreshMs = API_STATUS_CACHE_TTL_MS,
  className,
}: ApiStatusPanelProps) {
  const [data, setData] = useState<ApiStatusPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const hasDataRef = useRef(false);

  const load = useCallback(async (options: { force?: boolean } = {}) => {
    const hasData = hasDataRef.current;

    if (options.force) {
      clearApiStatusCache();
    }

    if (options.force || !hasData) {
      if (hasData) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
    }

    try {
      const next = await fetchApiStatus();
      hasDataRef.current = true;
      setData(next);
      setError(null);
      setCacheAgeMs(getApiStatusCacheAgeMs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load connection status");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, refreshMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [load, refreshMs]);

  const isPending = !mounted || (isLoading && !data);

  const groupedProviders = useMemo(() => {
    if (!data) {
      return [];
    }

    const groups = new Map<string, ApiProviderStatusSnapshot[]>();

    for (const provider of data.providers) {
      const existing = groups.get(provider.category) ?? [];
      existing.push(provider);
      groups.set(provider.category, existing);
    }

    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const isLive =
    !error &&
    !isPending &&
    !isRefreshing &&
    (cacheAgeMs === null || cacheAgeMs >= refreshMs);

  const statusLabel = error
    ? "Unavailable"
    : isPending
      ? "Loading"
      : isRefreshing
        ? "Updating"
        : isLive
          ? "Current"
          : "Recently updated";

  const statusBadgeVariantHeader = error
    ? "destructive"
    : isPending
      ? "muted"
      : isLive
        ? "success"
        : "secondary";

  return (
    <section
      className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8", className)}
      aria-label="Connection status"
    >
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b border-border/80 bg-muted/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Avatar className="size-9 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-background">
                    <Activity className="size-4 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle>Data connections</CardTitle>
                  <CardDescription className="mt-1 max-w-xl">
                    Monitor the health and availability of your market data sources.
                  </CardDescription>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge variant={statusBadgeVariantHeader} className="gap-1.5 px-2.5 py-1">
                {isLive && !error && !isPending && (
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                )}
                {statusLabel}
              </Badge>

              {data?.summary.checkedAt && (
                <span className="text-xs text-muted-foreground">
                  Checked {formatCheckedAt(data.summary.checkedAt)}
                </span>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => void load({ force: true })}
                disabled={mounted && (isLoading || isRefreshing)}
              >
                <RefreshCw className={cn(isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Unable to load connection status</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isPending ? (
            <>
              <SummaryStatsSkeleton />
              <TableSkeleton />
            </>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Total sources" value={data.summary.total} className={motionStagger(0)} />
                <StatCard label="Operational" value={data.summary.ready} tone="success" className={motionStagger(1)} />
                <StatCard label="Limited" value={data.summary.degraded} tone="warning" className={motionStagger(2)} />
                <StatCard label="Unavailable" value={data.summary.error} tone="danger" className={motionStagger(3)} />
                <StatCard
                  label="Not configured"
                  value={data.summary.unconfigured}
                  tone="muted"
                  className={motionStagger(4)}
                />
                <StatCard label="Unknown" value={data.summary.unknown} tone="muted" className={motionStagger(5)} />
              </div>

              <div className="space-y-6">
                {groupedProviders.map(([category, providers]) => (
                  <Card
                    key={category}
                    className="overflow-hidden rounded-lg border-border/80 shadow-none"
                  >
                    <CardHeader className="border-b border-border/80 bg-muted/30 px-4 py-3">
                      <CardTitle className="text-sm font-medium">
                        {CATEGORY_LABELS[category] ?? category}
                      </CardTitle>
                      <CardDescription>
                        {providers.length} source{providers.length === 1 ? "" : "s"}
                      </CardDescription>
                    </CardHeader>

                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Source</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden md:table-cell">Reliability</TableHead>
                          <TableHead className="text-right">Recent activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {providers.map((provider, index) => (
                          <ProviderTableRow key={provider.id} provider={provider} index={index} />
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>

        {data && (
          <div className="border-t border-border/80 bg-muted/20 px-6 py-3">
            <p className="text-xs text-muted-foreground">
              {formatCacheAge(cacheAgeMs) ??
                "Updates automatically every 15 minutes."}
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}

export default ApiStatusPanel;
