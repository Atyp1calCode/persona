import OpenAI from 'openai'
import type { LLMAdapter, Message, ChatOptions, SamplingOptions } from './types.js'
import { OLLAMA_BASE_URL, OLLAMA_API_KEY, DEFAULT_OLLAMA_MODEL } from '../constants.js'

// Ollama's OpenAI-compatible endpoint ignores min_p / repetition penalty, so only
// temperature from `sampling` is applied here.
export function createOllamaAdapter(
  baseUrl = OLLAMA_BASE_URL,
  defaultModel = DEFAULT_OLLAMA_MODEL,
  sampling: SamplingOptions = {},
): LLMAdapter {
  const client = new OpenAI({ baseURL: baseUrl, apiKey: OLLAMA_API_KEY })

  return {
    async *chat(messages: Message[], options: ChatOptions = {}): AsyncGenerator<string> {
      const stream = await client.chat.completions.create({
        model: options.model ?? defaultModel,
        messages,
        temperature: options.temperature ?? sampling.temperature,
        stream: true,
      })
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content
        if (content) yield content
      }
    },
  }
}
