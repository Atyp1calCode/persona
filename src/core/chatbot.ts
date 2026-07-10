import type { LLMAdapter, Message } from '../adapters/types.js'
import type { Retriever } from '../rag/retriever.js'
import type { FactExtractor } from './factExtractor.js'
import { createLogger, type Logger } from './logger.js'
import {
  DEFAULT_SYSTEM_PROMPT,
  DIALOGUE_STYLE_NOTE,
  CONFIDENTIALITY_NOTE,
  CONTEXT_USAGE_NOTE,
  MAX_FACTS_PER_MESSAGE,
  OBSERVED_FACT_MIN_LENGTH,
} from '../constants.js'

export interface ChatOptions {
  /** Scopes lore retrieval and fact extraction to a chat ('' = global). Used for group chats. */
  loreScope?: string
  /** Operator-maintained notes about the current speaker, injected as background context. */
  userNotes?: string[]
  /** Personality traits for the character the bot plays in this chat, layered onto the system prompt. */
  personaLore?: string[]
}

export interface ObserveOptions {
  /** Scope for facts extracted from the observed message ('' = global). */
  loreScope?: string
}

export interface Chatbot {
  chat(userMessage: string, sessionId: string, options?: ChatOptions): AsyncGenerator<string>
  /** Remembers a message without generating a reply (e.g. group messages not addressed to the bot). */
  observe(userMessage: string, sessionId: string, options?: ObserveOptions): Promise<void>
}

export function createChatbot(
  llm: LLMAdapter,
  retriever: Retriever,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  factExtractor?: FactExtractor,
  logger: Logger = createLogger(),
): Chatbot {
  // Fire-and-forget: distills a message into facts and stores the novel ones (capped, deduped).
  function extractFacts(userMessage: string, assistantMessage: string, loreScope: string): void {
    if (!factExtractor) return
    factExtractor
      .extract(userMessage, assistantMessage)
      .then((facts) =>
        Promise.all(
          facts.slice(0, MAX_FACTS_PER_MESSAGE).map((fact) => retriever.addFact(fact, loreScope)),
        ),
      )
      .catch((err) => logger.error('chatbot: fact extraction failed', err))
  }

  return {
    async *chat(userMessage, sessionId, options = {}) {
      const { loreScope = '', userNotes, personaLore } = options
      const { lore, recall, recent } = await retriever.retrieve(userMessage, sessionId, loreScope)

      const contextParts: string[] = []
      if (lore.length > 0) {
        contextParts.push('## Background knowledge\n' + lore.map((r) => r.text).join('\n'))
      }
      if (userNotes && userNotes.length > 0) {
        contextParts.push('## Notes about the current speaker\n' + userNotes.join('\n'))
      }
      if (recall.length > 0) {
        contextParts.push(
          '## Possibly related earlier messages (may be unrelated to the current topic)\n' +
            recall.map((r) => r.text).join('\n\n'),
        )
      }

      // Persona lore is identity, not background reference, so it extends the system prompt
      // directly rather than joining the retrieved-context sections below.
      const characterPrompt =
        personaLore && personaLore.length > 0
          ? `${systemPrompt}\n\nIn this chat you play the following character:\n${personaLore.join('\n')}`
          : systemPrompt
      const basePrompt = `${characterPrompt}\n\n${DIALOGUE_STYLE_NOTE}\n\n${CONFIDENTIALITY_NOTE}`
      const systemContent =
        contextParts.length > 0
          ? `${basePrompt}\n\n${CONTEXT_USAGE_NOTE}\n\n${contextParts.join('\n\n')}`
          : basePrompt

      // Replay recent exchanges as real turns so the model stays anchored to the live conversation,
      // rather than reconstructing it from a text blob in the system prompt.
      const messages: Message[] = [{ role: 'system', content: systemContent }]
      for (const turn of recent) {
        messages.push({ role: 'user', content: turn.user })
        // Observed messages (group chatter not addressed to the bot) have no assistant reply.
        if (turn.assistant) messages.push({ role: 'assistant', content: turn.assistant })
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

      extractFacts(userMessage, fullResponse, loreScope)
    },

    async observe(userMessage, sessionId, options = {}) {
      await retriever.saveExchange(userMessage, '', sessionId)
      // Short messages ("lol", "ok") can't carry personal facts — skip the extraction call.
      if (userMessage.length >= OBSERVED_FACT_MIN_LENGTH) {
        extractFacts(userMessage, '', options.loreScope ?? '')
      }
    },
  }
}
