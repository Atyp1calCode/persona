import { createLogger, type Logger } from '../../core/logger.js'

/**
 * Parses a JSON env var of the shape [{ <idKey>: number, <valueKey>: string | string[] }, ...]
 * into a Map keyed by id. Malformed input is logged and ignored rather than preventing startup.
 */
function parseIdMap(
  raw: string | undefined,
  idKey: string,
  valueKey: string,
  envName: string,
  logger: Logger,
): Map<number, string[]> {
  const map = new Map<number, string[]>()
  if (!raw) return map
  try {
    const entries = JSON.parse(raw) as Record<string, unknown>[]
    if (!Array.isArray(entries)) throw new Error('expected a JSON array')
    for (const entry of entries) {
      const id = Number(entry[idKey])
      const value = entry[valueKey]
      const list = (Array.isArray(value) ? value : [value]).map(String)
      map.set(id, [...(map.get(id) ?? []), ...list])
    }
  } catch (err) {
    logger.error(`config: could not parse ${envName}, ignoring it`, err)
  }
  return map
}

/**
 * Parses TELEGRAM_USER_NOTES: operator notes about individual users, keyed by Telegram user id,
 * e.g. [{"userId":123,"notes":["Prefers to be called Alex"]}].
 */
export function parseUserNotes(
  raw: string | undefined,
  logger: Logger = createLogger(),
): Map<number, string[]> {
  return parseIdMap(raw, 'userId', 'notes', 'TELEGRAM_USER_NOTES', logger)
}

/**
 * Parses TELEGRAM_GROUP_LORE: the bot's character/personality per group, keyed by group chat id,
 * e.g. [{"chatId":-1001234,"lore":["You are Annabel","Sharp-tongued but warm"]}].
 */
export function parseGroupLore(
  raw: string | undefined,
  logger: Logger = createLogger(),
): Map<number, string[]> {
  return parseIdMap(raw, 'chatId', 'lore', 'TELEGRAM_GROUP_LORE', logger)
}

/**
 * Parses TELEGRAM_THINKING_MESSAGES: a JSON array of placeholder strings shown in groups while
 * the reply is being generated. Returns undefined (use built-in defaults) when unset or invalid.
 */
export function parseThinkingMessages(
  raw: string | undefined,
  logger: Logger = createLogger(),
): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('expected a JSON array')
    return parsed.map(String)
  } catch (err) {
    logger.error('config: could not parse TELEGRAM_THINKING_MESSAGES, using defaults', err)
    return undefined
  }
}
