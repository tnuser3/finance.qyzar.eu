import type { AgentDefinition, InvestmentReport, SubagentTask } from '../definitions/types';
import type { Command } from './types';
import {
  extractDiscoveryOutput,
  hasValidStructuredDiscoveryOutput,
  parseAgentOutput,
} from './parser';
import { synthesizeDiscoveryOutputFromEvidence } from '../discovery/evidence-synthesis';
import * as registry from './registry';
import { filterAvailableCommands } from '../../providers/command-availability';
import { resolveIndexedCommands } from './command-index';
import { runAgent } from './agent';
import {
  extractFindings,
  extractInvestmentReports,
  extractRiskAssessment,
  parseSubagentSpawns,
  stripAgentBlocks,
} from './parser';

const SUBAGENT_MAX_ITERATIONS =
  Number(process.env.AGENT_MAX_TOOL_ITERATIONS) || 50;
const AGENT_MAX_ITERATIONS = Number(process.env.AGENT_MAX_RESEARCH_PASSES) || 24;
const MAX_IDLE_PASSES = Number(process.env.AGENT_MAX_IDLE_PASSES) || 3;
const MAX_TOOL_RETRIES = 2;
const MAX_EVIDENCE_SUMMARY_CHARS = 8_000;

const OUTPUT_NUDGE = `You must finish now. Call no more tools.

Return ONLY this structure (replace with your real findings from tool evidence):
<agent_output>
{
  "opportunities": [{
    "title": "NuScale Power — nuclear SMR industry leader",
    "description": "80+ char thesis using facts from your tool results only...",
    "ticker": "SMR",
    "company": "NuScale Power",
    "industry": "Nuclear Energy",
    "listingStatus": "listed",
    "confidence": 70,
    "risk_score": 40,
    "titanScore": 65,
    "evidence": [{
      "source": "gdelt_search_articles",
      "rawData": "exact excerpt from command_result",
      "reason": "why this supports the thesis",
      "summary": "one-line takeaway"
    }]
  }],
  "summary": "one-line executive summary"
}
</agent_output>

All text MUST be English only (ASCII). Do not include non-English headlines or company names.`;

const RESEARCH_CONTINUE_PROMPT = `Review the evidence collected above.

You may call more tools if important gaps remain — investigate as thoroughly as needed for a rigorous answer, but stay efficient (targeted queries, no redundant calls, reuse data you already have).

When you have enough evidence, return ONLY valid JSON inside <agent_output>...</agent_output> with the opportunities schema. Each opportunity needs tool-backed evidence. Do not finalize prematurely if key facts are still missing.`;

function commandsForAgent(definition: AgentDefinition): Command[] {
  const categories = new Set(definition.commandCategories);
  const all = filterAvailableCommands(registry.list());

  if (categories.size === 0) {
    return all;
  }

  return all.filter((command) => command.category && categories.has(command.category));
}

function buildUserPrompt(
  definition: AgentDefinition,
  taskPrompt: string,
  context?: string
): string {
  const plan = definition.plan
    .map((step) => `${step.step}. ${step.title}: ${step.action}`)
    .join('\n');

  return `Agent: ${definition.name} (${definition.id})
Role: ${definition.role}

Execution plan:
${plan}

User risk settings:
${context ?? 'Use default conservative bias.'}

Task:
${taskPrompt}

Follow your plan step by step. Use tools for evidence. Spawn subagents for parallel research when helpful.

Research policy:
- Run as many tool rounds as you need before returning <agent_output>.
- After each round, review gaps — call more tools if needed, or finalize when evidence is sufficient.
- Work efficiently: prefer high-signal sources first, combine related lookups, avoid duplicate calls.

Important: The Task section above is your assignment. Do not ask the user for more context — execute the task with tools, then return <agent_output> JSON when ready.

Language: ALL output must be English only (ASCII). Discard non-English tool results.`;
}

function appendEvidenceSummary(base: string, evidenceSummary: string): string {
  if (!evidenceSummary.trim()) {
    return base;
  }

  const trimmed =
    evidenceSummary.length > MAX_EVIDENCE_SUMMARY_CHARS
      ? `${evidenceSummary.slice(0, MAX_EVIDENCE_SUMMARY_CHARS)}\n...[truncated]`
      : evidenceSummary;

  return `${base}\n\nEvidence from tools:\n${trimmed}`;
}

function summarizeToolResult(name: string, result: unknown): string {
  const serialized = JSON.stringify(result, null, 2);
  const preview =
    serialized.length > 900 ? `${serialized.slice(0, 900)}...` : serialized;

  return `[${name}]\n${preview}`;
}

function buildToolRetryPrompt(
  definition: AgentDefinition,
  commands: Command[],
  taskPrompt: string
): string {
  const { index } = resolveIndexedCommands(taskPrompt, commands);
  const toolNames = index.slice(0, 10).map((entry) => entry.name);
  const primary = toolNames[0] ?? 'gdelt_search_articles';

  return `${buildUserPrompt(definition, taskPrompt)}

You must call a tool now. Reply with ONLY one block:
<command_call>
{"name":"${primary}","parameters":{}}
</command_call>

Suggested tools: ${toolNames.join(', ') || primary}`;
}

function isDiscoveryAgent(definition: AgentDefinition): boolean {
  return definition.phase === 'discovery';
}

function isParsedOutput(definition: AgentDefinition, text: string): boolean {
  if (isDiscoveryAgent(definition)) {
    return hasValidStructuredDiscoveryOutput(text);
  }

  return Boolean(parseAgentOutput(text));
}

export interface SpecializedAgentResult {
  agentId: string;
  text: string;
  findings: ReturnType<typeof extractFindings>;
  reports: InvestmentReport[];
  risk: ReturnType<typeof extractRiskAssessment>;
  subagentResults: SpecializedAgentResult[];
  seedToolCalls?: number;
  modelToolCalls?: number;
  failed?: boolean;
  failureReason?: string;
}

export async function runSpecializedAgent(options: {
  definition: AgentDefinition;
  prompt: string;
  model: string;
  context?: string;
  onEvent?: (event: Record<string, unknown>) => void;
  depth?: number;
  seedEvidence?: string;
  seedToolCalls?: number;
}): Promise<SpecializedAgentResult> {
  const depth = options.depth ?? 0;
  const commands = commandsForAgent(options.definition);
  const system = options.definition.systemPrompt;
  const userPrompt = buildUserPrompt(
    options.definition,
    options.prompt,
    options.context
  );

  let messages = options.seedEvidence?.trim()
    ? appendEvidenceSummary(userPrompt, options.seedEvidence)
    : userPrompt;
  const subagentResults: SpecializedAgentResult[] = [];
  let finalText = '';
  let modelToolCalls = 0;
  let evidenceSummary = options.seedEvidence ?? '';
  const seedToolCalls = options.seedToolCalls ?? 0;
  let toolRetryCount = 0;
  let forcedOutputPass = false;
  let idlePasses = 0;
  let failed = false;
  let failureReason: string | undefined;

  for (let iteration = 0; iteration < AGENT_MAX_ITERATIONS; iteration++) {
    const hasEvidence = evidenceSummary.trim().length > 0;
    const forceOutput =
      forcedOutputPass || iteration >= AGENT_MAX_ITERATIONS - 1;

    if (!forceOutput && toolRetryCount > 0) {
      messages = buildToolRetryPrompt(options.definition, commands, options.prompt);
      if (hasEvidence) {
        messages = appendEvidenceSummary(messages, evidenceSummary);
      }
    } else if (!forceOutput && hasEvidence) {
      messages = `${appendEvidenceSummary(userPrompt, evidenceSummary)}\n\n${RESEARCH_CONTINUE_PROMPT}`;
    } else if (!forceOutput) {
      messages = userPrompt;
    }

    const prompt = forceOutput
      ? appendEvidenceSummary(messages, evidenceSummary)
      : messages;

    const passMode = forceOutput ? 'output' : 'research';
    const passStarted = Date.now();

    options.onEvent?.({
      type: 'agent_pass_start',
      agentId: options.definition.id,
      iteration,
      mode: passMode,
      toolRetryCount,
      modelToolCalls,
      seedToolCalls,
    });

    const result = await runAgent({
      model: options.model,
      prompt: forceOutput ? `${prompt}\n\n${OUTPUT_NUDGE}` : prompt,
      system,
      commands: !forceOutput && commands.length ? commands : undefined,
      maxIterations: forceOutput ? 3 : SUBAGENT_MAX_ITERATIONS,
      requireToolUse: !forceOutput && modelToolCalls === 0,
      allowTools: !forceOutput,
      onEvent: options.onEvent
        ? (event) =>
            options.onEvent?.({
              ...event,
              agentId: options.definition.id,
              depth,
            })
        : undefined,
    });

    options.onEvent?.({
      type: 'agent_pass_end',
      agentId: options.definition.id,
      iteration,
      mode: passMode,
      durationMs: Date.now() - passStarted,
      modelToolCallsDelta: result.commandCalls.length,
      responseChars: result.text.length,
      ok: result.ok,
    });

    if (!result.ok) {
      failed = true;
      failureReason = result.text || 'agent pass failed';
      break;
    }

    modelToolCalls += result.commandCalls.length;

    for (const toolResult of result.commandResults) {
      if (!toolResult.ok || toolResult.result === undefined) {
        continue;
      }

      evidenceSummary += `\n${summarizeToolResult(toolResult.name, toolResult.result)}`;
    }

    finalText = result.text;

    if (isParsedOutput(options.definition, result.text)) {
      break;
    }

    if (!forceOutput && result.commandCalls.length === 0) {
      idlePasses += 1;

      if (idlePasses >= MAX_IDLE_PASSES && (hasEvidence || seedToolCalls > 0)) {
        forcedOutputPass = true;
        idlePasses = 0;
        continue;
      }
    } else if (result.commandCalls.length > 0) {
      idlePasses = 0;
    }

    const spawns = parseSubagentSpawns(result.text);

    if (
      spawns.length > 0 &&
      options.definition.canSpawnSubagents &&
      depth < 2
    ) {
      const spawnResults = await Promise.all(
        spawns.map((spawn) =>
          runSpecializedAgent({
            definition: options.definition,
            prompt: `[Subagent: ${spawn.label}] ${spawn.prompt}`,
            model: options.model,
            context: options.context,
            onEvent: options.onEvent,
            depth: depth + 1,
          })
        )
      );

      subagentResults.push(...spawnResults);

      const subagentSummary = spawnResults
        .map(
          (child) =>
            `### Subagent ${child.agentId}\n${stripAgentBlocks(child.text)}`
        )
        .join('\n\n');

      messages = `${userPrompt}\n\nSubagent results:\n${subagentSummary}\n\n${OUTPUT_NUDGE}`;
      forcedOutputPass = true;
      continue;
    }

    if (!forceOutput && modelToolCalls === 0 && !hasEvidence && seedToolCalls === 0) {
      if (toolRetryCount < MAX_TOOL_RETRIES) {
        toolRetryCount += 1;
        continue;
      }

      failed = true;
      failureReason = 'no_tool_evidence';
      break;
    }

    if (forceOutput) {
      break;
    }
  }

  const totalToolCalls = seedToolCalls + modelToolCalls;

  if (
    !failed &&
    !isParsedOutput(options.definition, finalText) &&
    isDiscoveryAgent(options.definition)
  ) {
    if (evidenceSummary.trim().length > 0 || seedToolCalls > 0) {
      const synthesized = await synthesizeDiscoveryOutputFromEvidence({
        agentId: options.definition.id,
        task: options.prompt,
        evidence: evidenceSummary,
        model: options.model,
      });

      if (synthesized && hasValidStructuredDiscoveryOutput(synthesized)) {
        finalText = synthesized;
        failed = false;
        failureReason = undefined;
      }
    }

    if (!isParsedOutput(options.definition, finalText)) {
      failed = true;
      failureReason = failureReason ?? 'no_structured_output';
    }
  }

  if (!failed && !isParsedOutput(options.definition, finalText) && totalToolCalls === 0 && seedToolCalls === 0) {
    failed = true;
    failureReason = failureReason ?? 'no_tool_evidence';
  }

  options.onEvent?.({
    type: 'agent_summary',
    agentId: options.definition.id,
    seedTools: seedToolCalls,
    modelToolCalls,
    toolCalls: totalToolCalls,
    parsed: isParsedOutput(options.definition, finalText),
    failed,
    failureReason,
    textLength: finalText.length,
  });

  return {
    agentId: options.definition.id,
    text: finalText,
    findings: extractFindings(finalText, options.definition.id),
    reports: extractInvestmentReports(finalText),
    risk: extractRiskAssessment(finalText, options.definition.id),
    subagentResults,
    seedToolCalls,
    modelToolCalls,
    failed,
    failureReason,
  };
}

export async function runSubagents(
  definition: AgentDefinition,
  tasks: SubagentTask[],
  options: {
    model: string;
    context?: string;
    onEvent?: (event: Record<string, unknown>) => void;
  }
): Promise<SpecializedAgentResult[]> {
  return Promise.all(
    tasks.map((task) =>
      runSpecializedAgent({
        definition,
        prompt: `[${task.label}] ${task.prompt}`,
        model: options.model,
        context: options.context,
        onEvent: options.onEvent,
        depth: 1,
      })
    )
  );
}
