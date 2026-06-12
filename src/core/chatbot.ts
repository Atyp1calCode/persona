import type { LLMAdapter, Message } from '../adapters/types.js'
import type { Retriever } from '../rag/retriever.js'
import type { FactExtractor } from './factExtractor.js'
import { createLogger, type Logger } from './logger.js'
import { DEFAULT_SYSTEM_PROMPT, CONTEXT_USAGE_NOTE } from '../constants.js'

export interface Chatbot {
  chat(userMessage: string, sessionId: string): AsyncGenerator<string>
}

export function createChatbot(
  llm: LLMAdapter,
  retriever: Retriever,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  factExtractor?: FactExtractor,
  logger: Logger = createLogger(),
): Chatbot {
  return {
    async *chat(userMessage, sessionId) {
      const { lore, recall, recent } = await retriever.retrieve(userMessage, sessionId)

      const contextParts: string[] = []
      if (lore.length > 0) {
        contextParts.push('## Background knowledge\n' + lore.map((r) => r.text).join('\n'))
      }
      if (recall.length > 0) {
        contextParts.push(
          '## Possibly related earlier messages (may be unrelated to the current topic)\n' +
            recall.map((r) => r.text).join('\n\n'),
        )
      }

      const systemContent =
        contextParts.length > 0
          ? `${systemPrompt}\n\n${CONTEXT_USAGE_NOTE}\n\n${contextParts.join('\n\n')}`
          : systemPrompt

      // Replay recent exchanges as real turns so the model stays anchored to the live conversation,
      // rather than reconstructing it from a text blob in the system prompt.
      const messages: Message[] = [{ role: 'system', content: systemContent }]
      for (const turn of recent) {
        messages.push({ role: 'user', content: turn.user })
        messages.push({ role: 'assistant', content: turn.assistant })
      }
      messages.push({ role: 'user', content: userMessage })

      let fullResponse = ''
      for await (const chunk of llm.chat(messages)) {
        fullResponse += chunk
        yield chunk
      }

      retriever
        .saveExchange(userMessage, fullResponse, sessionId)
        .catch((err) => logger.error('chatbot: saveExchange failed', err))

      if (factExtractor) {
        factExtractor
          .extract(userMessage, fullResponse)
          .then((facts) => Promise.all(facts.map((fact) => retriever.addLore('fact', fact))))
          .catch((err) => logger.error('chatbot: fact extraction failed', err))
      }
    },
  }
}
