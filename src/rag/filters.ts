/**
 * Quotes a string as a SQL literal for LanceDB (DataFusion) filter expressions,
 * escaping embedded single quotes by doubling them. Always use this for any
 * untrusted value (e.g. a session id) interpolated into a filter string, to
 * prevent filter injection.
 */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Filter matching all chat exchanges belonging to a single session. */
export function chatSessionFilter(sessionId: string): string {
  return `type = 'chat' AND "sessionId" = ${quoteLiteral(sessionId)}`
}
