import { CronExpressionParser } from 'cron-parser';
import * as pipelineRuns from './pipeline-runs';
import * as rooms from '../../ws/rooms';
import { logActivity, formatRundownMessage } from './activity-log';
import { getAvailablePlatforms, type AvailablePlatform } from '../../providers/command-availability';
import { logError } from '../../infra/db/error-log';

export type AgentRunStatus = 'pending' | 'running' | 'complete' | 'error';

export interface DiscoveryAgentState {
  id: string;
  status: AgentRunStatus;
  message: string | null;
  lastActivityAt: string | null;
  lastDurationMs: number | null;
}

export interface DiscoveryRundownEntry {
  at: string;
  agentId: string | null;
  type: string;
  message: string;
}

export interface DiscoveryStatusSnapshot {
  running: boolean;
  runId: string | null;
  startedAt: string | null;
  phase: string | null;
  message: string | null;
  agents: DiscoveryAgentState[];
  rundown: DiscoveryRundownEntry[];
  lastRun: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    summary: Record<string, unknown>;
  } | null;
  nextRunAt: string | null;
  countdown: {
    totalMs: number;
    hours: number;
    minutes: number;
    seconds: number;
    label: string;
  } | null;
  platforms: AvailablePlatform[];
  platformsCheckedAt: string;
}

const DISCOVERY_CRON = process.env.DISCOVERY_CRON ?? '0 * * * *';

const AGENT_IDS = [
  'commodities',
  'crypto_analysis',
  'macroeconomic',
  'future_opportunist',
  'conservationist',
  'industry_surge',
  'regulatory_discovery',
  'risk_political',
  'risk_governance',
  'risk_financial',
  'risk_market',
  'risk_reputation',
];

let state: {
  running: boolean;
  runId: string | null;
  startedAt: string | null;
  phase: string | null;
  message: string | null;
  agents: Map<string, DiscoveryAgentState>;
  rundown: DiscoveryRundownEntry[];
} = createEmptyState();

function createEmptyState() {
  return {
    running: false,
    runId: null,
    startedAt: null,
    phase: null,
    message: null,
    agents: new Map<string, DiscoveryAgentState>(),
    rundown: [] as DiscoveryRundownEntry[],
  };
}

function defaultAgents(): Map<string, DiscoveryAgentState> {
  const map = new Map<string, DiscoveryAgentState>();

  for (const id of AGENT_IDS) {
    map.set(id, {
      id,
      status: 'pending',
      message: null,
      lastActivityAt: null,
      lastDurationMs: null,
    });
  }

  return map;
}

let countdownTimer: ReturnType<typeof setInterval> | null = null;

function ensureCountdownTicker(): void {
  if (countdownTimer) return;

  countdownTimer = setInterval(() => {
    if (rooms.memberCount('discovery') === 0) return;
    if (state.running || pipelineRuns.isWorkflowRunning('discovery')) return;

    publishSnapshot('countdown_tick');
  }, 30_000);
}

export function beginDiscoveryRun(runId: string): void {
  state = {
    running: true,
    runId,
    startedAt: new Date().toISOString(),
    phase: 'discovery',
    message: 'Discovery workflow started',
    agents: defaultAgents(),
    rundown: [],
  };

  publishSnapshot('run_started');
  ensureCountdownTicker();
}

export function endDiscoveryRun(ok: boolean, summary?: Record<string, unknown>): void {
  if (state.running) {
    appendRundown({
      agentId: null,
      type: ok ? 'discovery_complete' : 'error',
      message: ok
        ? `Discovery complete${summary?.companiesAdded != null ? `: ${summary.companiesAdded} companies added` : ''}`
        : String(summary?.error ?? 'Discovery failed'),
    });
  }

  state.running = false;
  state.phase = ok ? 'complete' : 'failed';
  state.message = ok ? 'Discovery workflow finished' : 'Discovery workflow failed';

  for (const agent of state.agents.values()) {
    if (agent.status === 'running') {
      agent.status = ok ? 'complete' : 'error';
    } else if (agent.status === 'pending') {
      agent.status = ok ? 'complete' : 'error';
    }
  }

  publishSnapshot(ok ? 'run_complete' : 'run_failed');
}

function appendRundown(entry: Omit<DiscoveryRundownEntry, 'at'>): void {
  state.rundown.unshift({
    at: new Date().toISOString(),
    ...entry,
  });

  if (state.rundown.length > 200) {
    state.rundown.length = 200;
  }
}

function updateAgent(
  agentId: string,
  patch: Partial<DiscoveryAgentState>,
  eventDurationMs?: number
): void {
  const existing = state.agents.get(agentId) ?? {
    id: agentId,
    status: 'pending' as AgentRunStatus,
    message: null,
    lastActivityAt: null,
    lastDurationMs: null,
  };

  const durationMs =
    typeof patch.lastDurationMs === 'number'
      ? patch.lastDurationMs
      : typeof eventDurationMs === 'number'
        ? eventDurationMs
        : existing.lastDurationMs;

  state.agents.set(agentId, {
    ...existing,
    ...patch,
    lastDurationMs: durationMs,
    lastActivityAt: new Date().toISOString(),
  });
}

export function publishDiscoveryEvent(event: Record<string, unknown>): void {
  const runId = event.runId ? String(event.runId) : null;
  const type = String(event.type ?? 'update');
  const agentId = event.agentId ? String(event.agentId) : null;
  const message = formatRundownMessage(event);
  const durationMs =
    typeof event.durationMs === 'number' ? Math.round(event.durationMs) : undefined;

  if (runId && !state.running) {
    beginDiscoveryRun(runId);
  } else if (runId && state.runId !== runId) {
    beginDiscoveryRun(runId);
  }

  if (event.phase) {
    state.phase = String(event.phase);
  }

  if (message) {
    state.message = message;
  }

  if (agentId) {
    if (type === 'index' || type === 'chunk') {
      updateAgent(agentId, { status: 'running', message }, durationMs);
    } else if (
      type === 'command_result' ||
      type === 'command_call' ||
      type === 'tool_call' ||
      type === 'tool_result'
    ) {
      updateAgent(agentId, { status: 'running', message }, durationMs);
    } else if (type === 'tool_exec_end' || type === 'bootstrap_seed_end') {
      const toolLabel =
        type === 'bootstrap_seed_end'
          ? `seed ${String(event.name ?? 'tool')} ${event.ok ? 'ok' : 'fail'}${durationMs != null ? ` ${durationMs}ms` : ''}`
          : `${String(event.name ?? 'tool')} ${event.ok ? 'ok' : 'fail'}${durationMs != null ? ` ${durationMs}ms` : ''}`;
      updateAgent(
        agentId,
        { status: 'running', message: toolLabel, lastDurationMs: durationMs ?? null },
        durationMs
      );
    } else if (type === 'llm_end') {
      updateAgent(
        agentId,
        {
          status: 'running',
          message: `model ${durationMs != null ? `${durationMs}ms` : 'done'}`,
          lastDurationMs: durationMs ?? null,
        },
        durationMs
      );
    } else if (type === 'agent_summary') {
      const parsed = event.parsed === true;
      const failed = event.failed === true;
      updateAgent(
        agentId,
        {
          status: failed ? 'error' : parsed ? 'complete' : 'running',
          message: failed
            ? String(event.failureReason ?? 'Agent failed')
            : `tools=${String(event.toolCalls ?? 0)} parsed=${parsed}${durationMs != null ? ` (${durationMs}ms)` : ''}`,
          lastDurationMs: durationMs ?? null,
        },
        durationMs
      );
    } else if (type === 'discovery_complete' || type === 'done') {
      updateAgent(agentId, { status: 'complete', message }, durationMs);
    } else {
      updateAgent(agentId, { status: 'running', message }, durationMs);
    }
  }

  if (type === 'phase') {
    for (const agent of state.agents.values()) {
      if (agent.status === 'pending') {
        agent.status = 'running';
        agent.message = 'Searching markets and sources…';
        agent.lastActivityAt = new Date().toISOString();
      }
    }
  }

  appendRundown({ agentId, type, message });

  logActivity({
    source: 'discovery',
    type,
    message,
    agentId: agentId ?? undefined,
    runId: state.runId ?? undefined,
    data: event,
  });

  publishSnapshot(type);
}

function getNextRun(): { nextRunAt: string; countdown: DiscoveryStatusSnapshot['countdown'] } | null {
  try {
    const interval = CronExpressionParser.parse(DISCOVERY_CRON);
    const next = interval.next().toDate();
    const totalMs = Math.max(0, next.getTime() - Date.now());
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return {
      nextRunAt: next.toISOString(),
      countdown: {
        totalMs,
        hours,
        minutes,
        seconds,
        label: parts.join(' '),
      },
    };
  } catch (error) {
      logError(error, { source: 'util/discovery-status.ts - getNextRun' });
    return null;
  }
}

export async function getDiscoverySnapshot(): Promise<DiscoveryStatusSnapshot> {
  const running = pipelineRuns.isWorkflowRunning('discovery') || state.running;
  const lastRuns = await pipelineRuns.getLatestByWorkflow('discovery', 1);
  const lastRun = lastRuns[0] ?? null;
  const schedule = running ? null : getNextRun();

  return {
    running,
    runId: state.runId,
    startedAt: state.startedAt,
    phase: state.phase,
    message: state.message,
    agents: Array.from(state.agents.values()),
    rundown: state.rundown.slice(0, 50),
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          summary: lastRun.summary,
        }
      : null,
    nextRunAt: schedule?.nextRunAt ?? null,
    countdown: schedule?.countdown ?? null,
    platforms: getAvailablePlatforms(),
    platformsCheckedAt: new Date().toISOString(),
  };
}

export function publishSnapshot(reason: string): void {
  void getDiscoverySnapshot().then((snapshot) => {
    rooms.broadcast('discovery', {
      event: 'viewDiscoveryStatus',
      type: 'update',
      reason,
      ...snapshot,
    });
  });
}

export function discoveryOnEvent(event: Record<string, unknown>): void {
  publishDiscoveryEvent(event);
}
