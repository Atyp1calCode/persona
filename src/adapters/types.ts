export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
  minP?: number
  repetitionPenalty?: number
}

export type SamplingOptions = Omit<ChatOptions, 'model'>

export interface LLMAdapter {
  chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string>
}
