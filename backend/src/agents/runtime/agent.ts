import { callDeepAI, streamDeepAI, type DeepAIMessage } from '../../providers/ai/deepai';
import { buildPlatformGuidance } from '../../providers/command-availability';
import { resolveIndexedCommands } from './command-index';
import * as registry from './registry';
import { logError } from '../../infra/db/error-log';
import type {
  AgentEvent,
  AgentRunPhase,
  AgentRunOptions,
  AgentRunResult,
  Command,
  CommandCall,
  CommandIndexEntry,
  CommandResult,
} from './types';

const COMMAND_CALL_PATTERN =
  /<command_call>\s*([\s\S]*?)\s*<\/command_call>/gi;

const DEFAULT_MAX_ITERATIONS = Number(process.env.AGENT_MAX_TOOL_ITERATIONS) || 50;

function emit(onEvent: AgentRunOptions['onEvent'], event: AgentEvent): void {
  onEvent?.(event);
}

function buildCommandCatalog(entries: CommandIndexEntry[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      name: entry.name,
      description: entry.description,
      category: entry.category,
      tags: entry.tags ?? [],
      parameters: entry.parameters,
    })),
    null,
    2
  );
}

function buildAgentSystemPrompt(
  catalog: CommandIndexEntry[],
  extra?: string,
  explicitCatalog = false
): string {
  const planStep = explicitCatalog
    ? 'ACT: Tools are listed below — call them directly with command_call. Do NOT ask the user for a tool catalog; it is already in this system message.'
    : 'ACT: Call any configured tool you need — use list_commands to filter by keyword, category, or tag.';

  return `You are an agent assistant with indexed tools, similar to Cursor.

Workflow:
1. ${planStep}
2. ACT: Call one tool at a time using command_call blocks. You may repeat this across many rounds until evidence is sufficient.
3. OBSERVE: Read each command_result carefully before the next step.
4. DECIDE: After each round, choose whether to call more tools or finalize.
5. RESPOND: When you have enough evidence, answer with no command_call blocks. If your instructions require <agent_output>, your final message MUST include that block with valid JSON inside.

Tool call format:
<command_call>
{"name":"tool_name","parameters":{"param":"value"}}
</command_call>

Rules:
- For prices, quotes, news, filings, or any live market data you MUST call a tool before answering. Never guess or use memorized values.
- Prefer GDELT, Currents, Guardian for news. Use FMP, Finnhub, Massive/Polygon, or Alpha Vantage for stock market data, earnings, and fundamentals — prefer FMP, Finnhub, or Massive when Alpha Vantage is rate-limited.
- Use CoinGecko (coingecko_price, coingecko_market_chart, coingecko_markets) for cryptocurrency prices and history — not stock quote tools. Pass "platform":"coingecko" or call coingecko_* commands directly for BTC, ETH, SOL, etc.
- Use Reddit for retail sentiment and discussion. Google Trends for search-interest signals.
- Use RSS feeds for SEC, FTC, DOJ, Fed, Treasury, CFTC, and other regulatory/government sources (rss_fetch_tier, rss_fetch_source).
- Use FRED for macroeconomic time series. Census for demographic data. EDGAR for SEC filings and XBRL facts.
- Use LDA for lobbying disclosures. USAspending for federal contracts/grants. GNews for broad news search.
- Discovery stack: macroeconomic, earnings_intelligence, technical_analysis, commodities, future_opportunist, conservationist, crypto_analysis.
- Risk stack: risk_political, risk_governance, risk_financial, risk_market, risk_reputation.
- Decision: master_investment_committee weighs all evidence before formatter.
- You may call any tool listed in the indexed catalog below.
- Unavailable, unconfigured, rate-limited, or failing APIs are omitted from your catalog automatically.
- Optional "platform" parameter: add it inside command_call parameters to prefer a data provider, e.g. {"name":"fmp_quote","parameters":{"symbol":"AAPL","platform":"finnhub"}}. If that platform fails, the system tries the next best available alternative.
- ${buildPlatformGuidance()}
- If a command_result has fallback=true, the system automatically retried equivalent tools. Read executedCommand, fallbackReason, and fallbackNote — cite the executedCommand as your data source, not the one you originally requested.
- If a command_result has rateLimited=true and fallback=false, that API is temporarily unavailable and no fallback succeeded — try a different capability or wait until availableAt.
- Use valid JSON in every command_call block.
- Do not invent tool names or parameters.
- Prefer one command_call per turn.
- Investigate as thoroughly as needed, but work efficiently: targeted queries first, avoid redundant calls, reuse evidence you already collected.
- GDELT enforces one request every ~5 seconds — space repeated GDELT calls accordingly or use Guardian/Currents/RSS for parallel news coverage.

Indexed tool catalog:
${buildCommandCatalog(catalog)}

${extra ?? ''}`.trim();
}

function parseCommandCalls(text: string): CommandCall[] {
  const calls: CommandCall[] = [];
  const pattern = new RegExp(COMMAND_CALL_PATTERN.source, COMMAND_CALL_PATTERN.flags);

  for (const match of text.matchAll(pattern)) {
    const raw = match[1]?.trim();

    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<CommandCall>;

      if (!parsed.name || typeof parsed.name !== 'string') {
        continue;
      }

      calls.push({
        name: parsed.name,
        parameters:
          parsed.parameters && typeof parsed.parameters === 'object'
            ? (parsed.parameters as Record<string, unknown>)
            : {},
      });
    } catch (error) {
      logError(error, { source: 'agents/agent.ts - parseCommandCalls' });
      continue;
    }
  }

  return calls;
}

const MAX_COMMAND_RESULT_CHARS = 6_000;

function summarizeCommandResult(result: CommandResult): CommandResult {
  const serialized = JSON.stringify(result, null, 2);

  if (serialized.length <= MAX_COMMAND_RESULT_CHARS) {
    return result;
  }

  const preview =
    result.result === undefined
      ? undefined
      : typeof result.result === 'string'
        ? result.result.slice(0, MAX_COMMAND_RESULT_CHARS - 500)
        : JSON.stringify(result.result, null, 2).slice(0, MAX_COMMAND_RESULT_CHARS - 500);

  return {
    ...result,
    result: {
      _truncated: true,
      originalLength: serialized.length,
      preview,
    },
  };
}

function formatCommandResult(result: CommandResult): string {
  return `<command_result>\n${JSON.stringify(summarizeCommandResult(result), null, 2)}\n</command_result>`;
}

function stripCommandCalls(text: string): string {
  return text.replace(COMMAND_CALL_PATTERN, '').trim();
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  emit(options.onEvent, { type: 'phase', phase: 'index' });

  const { commands, index } = resolveIndexedCommands(
    options.prompt,
    options.commands
  );

  emit(options.onEvent, { type: 'index', commands: index });

  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const explicitCatalog = Boolean(options.commands?.length);
  const allowedNames = new Set(commands.map((command) => command.name));
  const system = buildAgentSystemPrompt(index, options.system, explicitCatalog);
  const requireToolUse = options.requireToolUse ?? false;
  const allowTools = options.allowTools ?? true;

  const messages: DeepAIMessage[] = [
    { role: 'user', content: options.prompt },
  ];

  const commandCalls: CommandCall[] = [];
  const commandResults: CommandResult[] = [];
  let finalText = '';

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const llmPhase: AgentRunPhase = iteration === 0 ? 'plan' : 'tool';

    emit(
      options.onEvent,
      { type: 'phase', phase: llmPhase }
    );

    const streamChunk = (chunk: string) => {
      options.onChunk?.(chunk);
      emit(options.onEvent, { type: 'chunk', chunk });
    };

    emit(options.onEvent, {
      type: 'llm_start',
      iteration,
      phase: llmPhase,
      messageCount: messages.length,
      model: options.model,
    });

    const llmStarted = Date.now();

    let response: string;

    try {
      response = options.onChunk
        ? (
            await streamDeepAI({
              model: options.model,
              system,
              messages,
              onChunk: streamChunk,
            })
          ).text
        : await callDeepAI({
            model: options.model,
            system,
            messages,
          });
    } catch (error) {
      logError(error, { source: 'agents/agent.ts - runAgent' });
      const message = error instanceof Error ? error.message : String(error);

      emit(options.onEvent, {
        type: 'llm_error',
        iteration,
        phase: llmPhase,
        durationMs: Date.now() - llmStarted,
        error: message,
        model: options.model,
      });

      return {
        ok: false,
        text: message,
        indexedCommands: index,
        commandCalls,
        commandResults,
      };
    }

    emit(options.onEvent, {
      type: 'llm_end',
      iteration,
      phase: llmPhase,
      durationMs: Date.now() - llmStarted,
      responseChars: response.length,
      model: options.model,
    });

    const calls = parseCommandCalls(response);

    if (!allowTools) {
      if (calls.length > 0 && iteration < maxIterations - 1) {
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'user',
          content:
            'Do not call tools. Return ONLY valid JSON inside <agent_output>...</agent_output>.',
        });
        continue;
      }

      emit(options.onEvent, { type: 'phase', phase: 'respond' });
      finalText = stripCommandCalls(response);

      return {
        ok: true,
        text: finalText,
        indexedCommands: index,
        commandCalls,
        commandResults,
      };
    }

    if (calls.length === 0) {
      if (requireToolUse && commandCalls.length === 0 && iteration < maxIterations - 1) {
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'user',
          content:
            'You must call a tool before answering. Reply with exactly one block in this format (valid JSON, no markdown fences):\n<command_call>\n{"name":"tool_name","parameters":{}}\n</command_call>',
        });
        continue;
      }

      emit(options.onEvent, { type: 'phase', phase: 'respond' });
      finalText = stripCommandCalls(response);

      return {
        ok: true,
        text: finalText,
        indexedCommands: index,
        commandCalls,
        commandResults,
      };
    }

    const call = calls[0]!;

    if (!allowedNames.has(call.name)) {
      if (iteration < maxIterations - 1) {
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'user',
          content: `Tool "${call.name}" is not in your indexed catalog. Use only: ${[...allowedNames].join(', ')}. Reply with one valid command_call block.`,
        });
        continue;
      }

      if (commandResults.some((entry) => entry.ok)) {
        emit(options.onEvent, { type: 'phase', phase: 'respond' });

        return {
          ok: true,
          text: stripCommandCalls(response) || 'Tool run completed.',
          indexedCommands: index,
          commandCalls,
          commandResults,
        };
      }

      return {
        ok: false,
        text: stripCommandCalls(response),
        indexedCommands: index,
        commandCalls,
        commandResults,
      };
    }

    commandCalls.push(call);

    emit(options.onEvent, {
      type: 'tool_call',
      name: call.name,
      parameters: call.parameters,
    });

    emit(options.onEvent, { type: 'tool_exec_start', name: call.name });
    const toolStarted = Date.now();
    const result = await registry.execute(call);
    emit(options.onEvent, {
      type: 'tool_exec_end',
      name: call.name,
      durationMs: Date.now() - toolStarted,
      ok: result.ok,
    });
    commandResults.push(result);

    emit(options.onEvent, {
      type: 'tool_result',
      result,
      durationMs: result.durationMs ?? Date.now() - toolStarted,
    });

    messages.push({ role: 'assistant', content: response });
    messages.push({
      role: 'user',
      content: `Tool result for ${call.name}:\n\n${formatCommandResult(result)}`,
    });

    if (calls.length > 1) {
      messages.push({
        role: 'user',
        content:
          'Continue one tool at a time. Remaining requested tools were not executed yet.',
      });
    }

    finalText = stripCommandCalls(response);
  }

  emit(options.onEvent, { type: 'phase', phase: 'respond' });

  return {
    ok: true,
    text: finalText,
    indexedCommands: index,
    commandCalls,
    commandResults,
  };
}

export { register, unregister, list, get, execute } from './registry';
export {
  searchCommands,
  listByCategory,
  listByTag,
  resolveIndexedCommands,
} from './command-index';
