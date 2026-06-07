import OpenAI from 'openai'
import type { LLMAdapter, Message, ChatOptions } from './types.js'
import {
  OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  APP_REFERER,
  APP_NAME,
  GEMINI_SAFETY_SETTINGS,
} from '../constants.js'

export function createOpenRouterAdapter(
  apiKey: string,
  defaultModel = DEFAULT_OPENROUTER_MODEL,
  disableSafety = false,
): LLMAdapter {
  const client = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': APP_REFERER,
      'X-Title': APP_NAME,
    },
  })

  return {
    async *chat(messages: Message[], options: ChatOptions = {}): AsyncGenerator<string> {
      const body = {
        model: options.model ?? defaultModel,
        messages,
        temperature: options.temperature,
        stream: true as const,
      }
      if (disableSafety) Object.assign(body, { safety_settings: GEMINI_SAFETY_SETTINGS })

      const stream = await client.chat.completions.create(body)
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content
        if (content) yield content
      }
    },
  }
}
