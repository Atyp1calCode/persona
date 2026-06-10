// Ollama
export const OLLAMA_BASE_URL = 'http://localhost:11434/v1'
export const OLLAMA_API_KEY = 'ollama'
export const DEFAULT_OLLAMA_MODEL = 'llama3.2'
export const DEFAULT_EMBED_MODEL = 'nomic-embed-text'

// OpenRouter
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini'
export const DEFAULT_FACT_EXTRACTOR_MODEL = 'google/gemini-3.1-flash-lite'

// OpenAI (used for embeddings when Ollama is unavailable)
export const OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_OPENAI_EMBED_MODEL = 'text-embedding-3-small'

// App identity (sent in OpenRouter headers)
export const APP_NAME = 'Persona'
export const APP_REFERER = 'http://localhost:3000'

// Vector store
export const LANCEDB_TABLE = 'memory'
export const DEFAULT_SEARCH_LIMIT = 5
export const DEFAULT_TOP_K = 5
export const DEFAULT_LANCEDB_PATH = './data/lancedb'

// Web server
export const DEFAULT_PORT = 3000

// Chatbot
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'

// Telegram
export const TELEGRAM_API_BASE_URL = 'https://api.telegram.org'
export const TELEGRAM_THINKING_PLACEHOLDER = '...'
export const TELEGRAM_EDIT_INTERVAL_MS = 500
// Telegram messages cap at 4096 chars; leave headroom for the log prefix.
export const TELEGRAM_LOG_MAX_LENGTH = 4000

// Gemini safety — used when DISABLE_SAFETY=true
export const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
] as const
