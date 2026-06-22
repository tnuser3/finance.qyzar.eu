import { randomUUID } from 'crypto';
import { query, toJsonb } from '../../infra/db/pool';

export type WorkflowType =
  | 'discovery'
  | 'monitoring'
  | 'event'
  | 'full'
  | 'correlation'
  | 'watchlist_reviewer';
export type WorkflowTrigger = 'scheduled' | 'manual' | 'event';
export type WorkflowStatus = 'running' | 'completed' | 'failed';

export interface PipelineRunRecord {
  id: string;
  workflow: WorkflowType;
  trigger: WorkflowTrigger;
  status: WorkflowStatus;
  startedAt: string;
  completedAt: string | null;
  summary: Record<string, unknown>;
}

let initialized = false;
const activeRuns = new Map<WorkflowType, string>();

function mapRow(row: {
  id: string;
  workflow: string;
  trigger: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  summary: unknown;
}): PipelineRunRecord {
  return {
    id: row.id,
    workflow: row.workflow as WorkflowType,
    trigger: row.trigger as WorkflowTrigger,
    status: row.status as WorkflowStatus,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    summary: (row.summary as Record<string, unknown>) ?? {},
  };
}

export async function init(): Promise<void> {
  if (initialized) return;

  await query(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id UUID PRIMARY KEY,
      workflow TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'scheduled',
      status TEXT NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      summary JSONB NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_workflow ON pipeline_runs (workflow);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs (status);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs (started_at DESC);
  `);

  initialized = true;
}

export function isWorkflowRunning(workflow: WorkflowType): boolean {
  return activeRuns.has(workflow);
}

export async function startRun(
  workflow: WorkflowType,
  trigger: WorkflowTrigger = 'scheduled',
  options?: { force?: boolean }
): Promise<PipelineRunRecord | null> {
  await init();

  if (activeRuns.has(workflow)) {
    if (!options?.force) {
      return null;
    }
    activeRuns.delete(workflow);
  }

  const id = randomUUID();

  await query(
    `INSERT INTO pipeline_runs (id, workflow, trigger, status) VALUES ($1,$2,$3,'running')`,
    [id, workflow, trigger]
  );

  activeRuns.set(workflow, id);

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM pipeline_runs WHERE id = $1`,
    [id]
  );

  return mapRow(result.rows[0]!);
}

export async function completeRun(
  id: string,
  summary: Record<string, unknown> = {}
): Promise<void> {
  await init();

  await query(
    `UPDATE pipeline_runs SET status = 'completed', completed_at = NOW(), summary = $2::jsonb WHERE id = $1`,
    [id, toJsonb(summary)]
  );

  for (const [workflow, runId] of activeRuns.entries()) {
    if (runId === id) activeRuns.delete(workflow);
  }
}

export async function failRun(
  id: string,
  error: string,
  summary: Record<string, unknown> = {}
): Promise<void> {
  await init();

  await query(
    `UPDATE pipeline_runs SET status = 'failed', completed_at = NOW(), summary = $2::jsonb WHERE id = $1`,
    [id, toJsonb({ ...summary, error })]
  );

  for (const [workflow, runId] of activeRuns.entries()) {
    if (runId === id) activeRuns.delete(workflow);
  }
}

export async function listRuns(limit = 20): Promise<PipelineRunRecord[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapRow);
}

export async function getLatestByWorkflow(
  workflow: WorkflowType,
  limit = 1
): Promise<PipelineRunRecord[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM pipeline_runs
     WHERE workflow = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [workflow, limit]
  );

  return result.rows.map(mapRow);
}

export function getActiveRunId(workflow: WorkflowType): string | undefined {
  return activeRuns.get(workflow);
}
