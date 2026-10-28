import OpenAI from 'openai'
import type { LLMAdapter, Message, ChatOptions, SamplingOptions } from './types.js'
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
  sampling: SamplingOptions = {},
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
      const temperature = options.temperature ?? sampling.temperature
      const minP = options.minP ?? sampling.minP
      const repetitionPenalty = options.repetitionPenalty ?? sampling.repetitionPenalty
      const body = {
        model: options.model ?? defaultModel,
        messages,
        temperature,
        stream: true as const,
      }
      // OpenRouter-specific sampler params (not in the OpenAI SDK types). Providers that don't
      // support them silently ignore them.
      if (minP !== undefined) Object.assign(body, { min_p: minP })
      if (repetitionPenalty !== undefined)
        Object.assign(body, { repetition_penalty: repetitionPenalty })
      if (disableSafety) Object.assign(body, { safety_settings: GEMINI_SAFETY_SETTINGS })

      const stream = await client.chat.completions.create(body)
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content
        if (content) yield content
      }
    },
  }
}
