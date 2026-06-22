import type { Command, CommandCall, CommandResult } from './types';
import { executeWithFallbacks } from './command-fallbacks';
import { RateLimitError, RateLimitUnavailableError } from '../../infra/http/ratelimit';
import { logError } from '../../infra/db/error-log';

const commands = new Map<string, Command>();

export function register(command: Command): void {
  commands.set(command.name, command);
}

export function unregister(name: string): void {
  commands.delete(name);
}

export function get(name: string): Command | undefined {
  return commands.get(name);
}

export function list(): Command[] {
  return Array.from(commands.values());
}

async function runCommand(
  commandName: string,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const command = commands.get(commandName);

  if (!command) {
    return {
      name: commandName,
      ok: false,
      error: `unknown command: ${commandName}`,
    };
  }

  try {
    const result = await command.handler(params);
    return { name: commandName, ok: true, result };
  } catch (error) {
      logError(error, { source: 'agents/registry.ts - runCommand' });
    if (error instanceof RateLimitUnavailableError) {
      return {
        name: commandName,
        ok: false,
        error: error.message,
        rateLimited: true,
        provider: error.provider,
        availableAt: new Date(error.availableAt).toISOString(),
      };
    }

    if (error instanceof RateLimitError) {
      return {
        name: commandName,
        ok: false,
        error: error.message,
        rateLimited: true,
        provider: error.provider,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return { name: commandName, ok: false, error: message };
  }
}

export async function execute(call: CommandCall): Promise<CommandResult> {
  const started = Date.now();
  const result = await executeWithFallbacks(
    call,
    runCommand,
    (commandName) => commands.has(commandName)
  );
  return { ...result, durationMs: Date.now() - started };
}
