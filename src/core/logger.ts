import { TELEGRAM_API_BASE_URL, TELEGRAM_LOG_MAX_LENGTH } from '../constants.js'

export interface Logger {
  /** Logs an error to the console and, when configured, to the Telegram log group. */
  error(context: string, err: unknown): void
}

export interface LoggerDeps {
  /** Bot token used to reach the Telegram Bot API. Falls back to console-only when absent. */
  botToken?: string
  /** Target chat/group id for log delivery. Falls back to console-only when absent. */
  chatId?: string
  /** Injectable fetch and console, primarily for testing. */
  fetchFn?: typeof fetch
  console?: Pick<Console, 'error'>
}

function formatError(context: string, err: unknown): string {
  const detail = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err)
  return `${context}: ${detail}`
}

export function createLogger({
  botToken,
  chatId,
  fetchFn = fetch,
  console: con = console,
}: LoggerDeps = {}): Logger {
  const telegramEnabled = Boolean(botToken && chatId)

  function sendToTelegram(text: string): void {
    if (!telegramEnabled) return
    // Fire-and-forget: a failure here must never throw or recurse into the logger.
    fetchFn(`${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, TELEGRAM_LOG_MAX_LENGTH) }),
    })
      .then((res) => {
        if (!res.ok) con.error(`logger: Telegram delivery failed with status ${res.status}`)
      })
      .catch((sendErr) => con.error('logger: Telegram delivery threw', sendErr))
  }

  return {
    error(context, err) {
      const message = formatError(context, err)
      con.error(message)
      sendToTelegram(`⚠️ ${message}`)
    },
  }
}
