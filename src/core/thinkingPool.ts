import type { LLMAdapter } from '../adapters/types.js'
import { createLogger, type Logger } from './logger.js'
import {
  DEFAULT_THINKING_MESSAGES,
  THINKING_POOL_BATCH_SIZE,
  THINKING_POOL_REFILL_AT,
  THINKING_LINE_MAX_LENGTH,
} from '../constants.js'

/**
 * Serves the "thinking…" placeholder shown while a reply is generated. Lines are written by
 * the LLM in the group persona's voice, batched into a per-chat pool so taking one is instant;
 * the pool refills asynchronously. Falls back to a static list while the pool is empty.
 */
export interface ThinkingPool {
  take(chatId: number, personaLore?: string[]): string
}

const GENERATION_SYSTEM_PROMPT =
  'You write the short status line a chat character shows while she is typing her reply — ' +
  'like a "thinking out loud" aside. Write the requested number of distinct one-liners in her ' +
  'voice, matching her personality (teasing, suggestive, or explicit if that fits her). ' +
  'Each line: under 60 characters, lowercase, ends with "…". ' +
  'Output one line each and nothing else — no numbering, no quotes, no commentary.'

/** Strips list markers/quotes the model sometimes adds despite instructions. */
function cleanLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^["'`]|["'`]$/g, '')
    .trim()
}

export function createThinkingPool(
  llm: LLMAdapter,
  fallback: string[] = DEFAULT_THINKING_MESSAGES,
  logger: Logger = createLogger(),
): ThinkingPool {
  const pools = new Map<number, string[]>()
  const refilling = new Set<number>()

  async function refill(chatId: number, personaLore?: string[]): Promise<void> {
    if (refilling.has(chatId)) return
    refilling.add(chatId)
    try {
      const persona =
        personaLore && personaLore.length > 0 ? `The character:\n${personaLore.join('\n')}\n\n` : ''
      let response = ''
      for await (const chunk of llm.chat(
        [
          { role: 'system', content: GENERATION_SYSTEM_PROMPT },
          { role: 'user', content: `${persona}Write ${THINKING_POOL_BATCH_SIZE} lines.` },
        ],
        { temperature: 1 },
      )) {
        response += chunk
      }
      const lines = response
        .split('\n')
        .map(cleanLine)
        .filter((line) => line.length > 0 && line.length <= THINKING_LINE_MAX_LENGTH)
      if (lines.length > 0) {
        pools.set(chatId, [...(pools.get(chatId) ?? []), ...lines])
      }
    } catch (err) {
      logger.error('thinkingPool: line generation failed', err)
    } finally {
      refilling.delete(chatId)
    }
  }

  return {
    take(chatId, personaLore) {
      const pool = pools.get(chatId) ?? []
      // Refill in the background before the pool runs dry; never block the caller.
      if (pool.length <= THINKING_POOL_REFILL_AT) void refill(chatId, personaLore)
      return pool.shift() ?? fallback[Math.floor(Math.random() * fallback.length)]
    },
  }
}
