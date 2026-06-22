export type CommandParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array';

export interface CommandParameter {
  name: string;
  type: CommandParameterType;
  description: string;
  required?: boolean;
}

export interface Command {
  name: string;
  description: string;
  parameters: CommandParameter[];
  category?: string;
  tags?: string[];
  handler: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface CommandIndexEntry {
  name: string;
  description: string;
  category?: string;
  tags: string[];
  parameters: CommandParameter[];
  score?: number;
}

export interface CommandCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface CommandResult {
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  rateLimited?: boolean;
  provider?: string;
  availableAt?: string;
  fallback?: boolean;
  requestedCommand?: string;
  executedCommand?: string;
  attemptedCommands?: string[];
  fallbackReason?: string;
  fallbackNote?: string;
  preferredPlatform?: string;
  durationMs?: number;
}

export type AgentRunPhase = 'index' | 'plan' | 'tool' | 'respond';

export type AgentEvent =
  | { type: 'phase'; phase: AgentRunPhase }
  | { type: 'index'; commands: CommandIndexEntry[] }
  | { type: 'tool_call'; name: string; parameters: Record<string, unknown> }
  | { type: 'tool_result'; result: CommandResult }
  | { type: 'chunk'; chunk: string }
  | {
      type: 'llm_start';
      iteration: number;
      phase: AgentRunPhase;
      messageCount: number;
      model: string;
    }
  | {
      type: 'llm_end';
      iteration: number;
      phase: AgentRunPhase;
      durationMs: number;
      responseChars: number;
      model: string;
    }
  | { type: 'tool_exec_start'; name: string }
  | { type: 'tool_exec_end'; name: string; durationMs: number; ok: boolean };

export interface AgentRunOptions {
  model: string;
  prompt: string;
  system?: string;
  commands?: Command[];
  maxIterations?: number;
  requireToolUse?: boolean;
  allowTools?: boolean;
  onChunk?: (chunk: string) => void;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentRunResult {
  ok: boolean;
  text: string;
  indexedCommands: CommandIndexEntry[];
  commandCalls: CommandCall[];
  commandResults: CommandResult[];
}



export const DEFAULT_AGENT_MODEL = process.env.AGENT_MODEL?.trim() || 'gpt-4o';


export const DISCOVERY_AGENT_MODELS: Record<string, string> = {
  commodities: 'gpt-4o',
  crypto_analysis: 'gemini-3.1-pro',
  macroeconomic: 'deepseek-v3.2',
  future_opportunist: 'claude-opus-4.7',
  conservationist: 'claude-opus-4.7',
  industry_surge: 'gemini-3.1-pro',
  regulatory_discovery: 'claude-opus-4.7',
  risk_political: 'gemini-2.5-flash-lite',
  risk_governance: 'gpt-5-nano',
  risk_financial: 'deepseek-v3.2',
  risk_market: 'gpt-4.1-nano',
  risk_reputation: 'gpt-4o',
};

export const DOSSIER_SYNTHESIS_MODEL =
  process.env.AGENT_MODEL_DOSSIER?.trim() || 'claude-opus-4.7';

export const SHORTFALL_EXPLANATION_MODEL =
  process.env.AGENT_MODEL_SHORTFALL?.trim() || 'gpt-4o';

function agentEnvKey(agentId: string): string {
  return `AGENT_MODEL_${agentId.toUpperCase().replace(/-/g, '_')}`;
}

export function resolveAgentModel(agentId: string, fallback?: string): string {
  const override = process.env[agentEnvKey(agentId)]?.trim();
  if (override) return override;
  const assigned = DISCOVERY_AGENT_MODELS[agentId]?.trim();
  if (assigned) return assigned;
  return fallback?.trim() || DEFAULT_AGENT_MODEL;
}

export function discoveryAgentModelMap(): Record<string, string> {
  const ids = Object.keys(DISCOVERY_AGENT_MODELS);
  return Object.fromEntries(ids.map((id) => [id, resolveAgentModel(id)]));
}
