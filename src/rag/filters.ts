/**
 * Quotes a string as a SQL literal for LanceDB (DataFusion) filter expressions,
 * escaping embedded single quotes by doubling them. Always use this for any
 * untrusted value (e.g. a session id) interpolated into a filter string, to
 * prevent filter injection.
 */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

// LanceDB's filter dialect treats double-quoted values as string literals, not identifiers
// (so `"sessionId" = 'x'` compares two constants and never matches). Mixed-case column names
// must be backtick-quoted instead.
const SESSION_ID = '`sessionId`'

/** Filter matching all chat exchanges belonging to a single session. */
export function chatSessionFilter(sessionId: string): string {
  return `type = 'chat' AND ${SESSION_ID} = ${quoteLiteral(sessionId)}`
}

/**
 * Filter matching lore visible in the given scope. Scopes are fully isolated: private chats
 * ('' scope) see only the global lore added via the web UI, and each group sees only facts
 * learned in that group — the bot plays a different character per group (TELEGRAM_GROUP_LORE),
 * so global lore must not bleed into groups, nor group facts into private chats.
 */
export function loreScopeFilter(scope: string): string {
  return `type = 'lore' AND ${SESSION_ID} = ${quoteLiteral(scope)}`
}
