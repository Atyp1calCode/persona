import type { LLMAdapter, Message } from '../adapters/types.js'
import type { Retriever } from '../rag/retriever.js'
import { DEFAULT_SYSTEM_PROMPT } from '../constants.js'

export interface Chatbot {
  chat(userMessage: string, sessionId: string): AsyncGenerator<string>
}

export function createChatbot(
  llm: LLMAdapter,
  retriever: Retriever,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
): Chatbot {
  return {
    async *chat(userMessage, sessionId) {
      const { lore, history } = await retriever.retrieve(userMessage, sessionId)

      const contextParts: string[] = []
      if (lore.length > 0) {
        contextParts.push('## Relevant Knowledge\n' + lore.map((r) => r.text).join('\n\n'))
      }
      if (history.length > 0) {
        contextParts.push('## Relevant Past Exchanges\n' + history.map((r) => r.text).join('\n\n'))
      }

      const systemContent =
        contextParts.length > 0 ? `${systemPrompt}\n\n${contextParts.join('\n\n')}` : systemPrompt

      const messages: Message[] = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userMessage },
      ]

      let fullResponse = ''
      for await (const chunk of llm.chat(messages)) {
        fullResponse += chunk
        yield chunk
      }

      retriever.saveExchange(userMessage, fullResponse, sessionId).catch(console.error)
    },
  }
}
