export type ActivitySource =
  | 'discovery'
  | 'monitoring'
  | 'event'
  | 'pipeline'
  | 'agent'
  | 'correlation'
  | 'watchlist_reviewer';

export interface ActivityEntry {
  at: string;
  source: ActivitySource;
  type: string;
  message: string;
  agentId?: string;
  runId?: string;
  ticker?: string;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
const entries: ActivityEntry[] = [];

export function logActivity(
  entry: Omit<ActivityEntry, 'at'> & { at?: string }
): ActivityEntry {
  const record: ActivityEntry = {
    at: entry.at ?? new Date().toISOString(),
    source: entry.source,
    type: entry.type,
    message: entry.message,
    agentId: entry.agentId,
    runId: entry.runId,
    ticker: entry.ticker,
    data: entry.data,
  };

  entries.unshift(record);

  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }

  return record;
}

export function getRundown(options?: {
  source?: ActivitySource;
  limit?: number;
}): ActivityEntry[] {
  const limit = options?.limit ?? 100;

  if (!options?.source) {
    return entries.slice(0, limit);
  }

  return entries.filter((e) => e.source === options.source).slice(0, limit);
}

export function formatRundownMessage(event: Record<string, unknown>): string {
  const type = String(event.type ?? 'update');
  const agentId = event.agentId ? String(event.agentId) : undefined;
  const message = event.message ? String(event.message) : undefined;
  const phase = event.phase ? String(event.phase) : undefined;
  const command = event.command ? String(event.command) : undefined;

  if (message) return message;
  if (command) return `Running tool: ${command}`;
  if (phase) return `Phase: ${phase}`;
  if (agentId) return `${agentId}: ${type}`;
  return type;
}
