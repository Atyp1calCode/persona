export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
}

export interface LLMAdapter {
  chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string>
}
