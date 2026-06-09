import type { LLMAdapter } from '../adapters/types.js'

export interface FactExtractor {
  extract(userMsg: string, assistantMsg: string): Promise<string[]>
}

const EXTRACTION_SYSTEM_PROMPT = `You extract memorable personal facts about the user from a single conversation exchange.
Only extract facts the user explicitly stated about themselves (name, age, location, job, relationships, preferences, goals, etc.).
Return one concise statement per line (e.g. "User's name is Alice").
If no personal facts were shared, respond with exactly: none`

export function createFactExtractor(llm: LLMAdapter): FactExtractor {
  return {
    async extract(userMsg, assistantMsg) {
      let response = ''
      for await (const chunk of llm.chat(
        [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: `User: ${userMsg}\nAssistant: ${assistantMsg}` },
        ],
        { temperature: 0 },
      )) {
        response += chunk
      }
      const trimmed = response.trim()
      if (trimmed.toLowerCase() === 'none') return []
      return trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    },
  }
}
