# Persona

A RAG-powered chatbot with long-term memory. Chat through a browser UI or Telegram. Stores both lore (background knowledge) and conversation history in a local vector database, retrieving relevant context on every message.

Memory works in several layers, kept deliberately separate so background context never derails the live conversation:

- **Recent turns** — the last N exchanges are replayed as real `user`/`assistant` messages, so the model stays anchored to the actual conversation instead of reconstructing it from a text blob.
- **Semantic recall** — older exchanges relevant to the current topic are pulled in by vector similarity, but surfaced as clearly-labeled background (not interleaved into the live timeline) so a stale, unrelated message can't hijack the current topic.
- **Lore** — background facts retrieved per message.
- **Fact extraction** — after each reply, a lightweight LLM pass extracts any personal facts you shared (name, preferences, etc.) and saves them as permanent lore, so they're never lost no matter how long the conversation grows.

Retrieved lore and recall are filtered by a cosine-distance **relevance threshold**, so weakly-related context is dropped entirely rather than padded in and repeated. Retrieval is tuned via constants in [`src/constants.ts`](src/constants.ts) — `DEFAULT_RECENT_TURNS`, `DEFAULT_RECALL_LIMIT`, `DEFAULT_LORE_LIMIT`, and `DEFAULT_RELEVANCE_MAX_DISTANCE` (lower = stricter).

## Architecture

```
src/
  adapters/       # LLM backends (Ollama, OpenRouter)
  core/           # Chatbot logic — RAG context injection + streaming
  rag/            # Embedder, vector store (LanceDB), retriever
  interfaces/
    web/          # Express server + SSE streaming
    telegram/     # grammy bot
client/src/       # React UI (Vite)
data/lancedb/     # Vector DB (created on first run)
```

Two LLM backends are supported and selected automatically at startup:

- **Ollama** (default) — local inference, no API key needed
- **OpenRouter** — cloud models, activated when `OPENROUTER_API_KEY` is set

Embeddings are configured separately from the chat model. When Ollama is used, embeddings default to Ollama (`nomic-embed-text`). When OpenRouter is used, embeddings default to the OpenAI embeddings API (`text-embedding-3-small`) and require an `OPENAI_API_KEY`. Both can be overridden with `EMBED_BASE_URL` and `EMBED_API_KEY` to point at any OpenAI-compatible embedding service.

> ⚠️ **Don't change the embedding model against an existing database.** Different models produce vectors of different dimensions/geometry, which will break or corrupt similarity search on data already stored in `data/lancedb/`. If you switch `EMBED_MODEL`, delete the database directory (or start a fresh `LANCEDB_PATH`) and re-add your lore.

## Prerequisites

- Node.js 20+

**For local mode (Ollama):**

- [Ollama](https://ollama.com) running locally with at least:
  ```
  ollama pull llama3.2
  ollama pull nomic-embed-text
  ```

**For cloud mode (OpenRouter + OpenAI embeddings):**

- An [OpenRouter](https://openrouter.ai) API key
- An [OpenAI](https://platform.openai.com) API key (for embeddings), or any other OpenAI-compatible embedding service configured via `EMBED_BASE_URL` + `EMBED_API_KEY`

**Optional:**

- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Configuration

Copy the example and edit as needed:

```bash
cp .env.example .env
```

| Variable               | Default                                                             | Description                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OLLAMA_URL`           | `http://localhost:11434/v1`                                         | Ollama API base URL                                                                                                                                      |
| `OLLAMA_MODEL`         | `llama3.2`                                                          | Chat model when using Ollama                                                                                                                             |
| `OPENROUTER_API_KEY`   | —                                                                   | If set, switches LLM backend to OpenRouter                                                                                                               |
| `OPENROUTER_MODEL`     | `openai/gpt-4o-mini`                                                | Model slug when using OpenRouter                                                                                                                         |
| `FACT_EXTRACTOR_MODEL` | `google/gemini-3.1-flash-lite`                                      | Cheap model used for background fact extraction (OpenRouter only)                                                                                        |
| `OPENAI_API_KEY`       | —                                                                   | OpenAI key for embeddings when using OpenRouter                                                                                                          |
| `EMBED_MODEL`          | `nomic-embed-text` (Ollama) / `text-embedding-3-small` (OpenRouter) | Embedding model                                                                                                                                          |
| `EMBED_BASE_URL`       | Ollama URL or `https://api.openai.com/v1`                           | Override the embedding service endpoint                                                                                                                  |
| `EMBED_API_KEY`        | Derived from backend                                                | Override the embedding service API key                                                                                                                   |
| `SYSTEM_PROMPT`        | `You are a helpful assistant.`                                      | Persona / system prompt for the chatbot                                                                                                                  |
| `LANCEDB_PATH`         | `./data/lancedb`                                                    | Path to the vector database directory                                                                                                                    |
| `PORT`                 | `3000`                                                              | Port for the web server                                                                                                                                  |
| `HOST`                 | `127.0.0.1`                                                         | Web server bind address. Loopback by default; set `0.0.0.0` to expose (the web API is unauthenticated — only do this behind your own auth/reverse proxy) |
| `TELEGRAM_BOT_TOKEN`   | —                                                                   | Required when running in Telegram mode                                                                                                                   |
| `TELEGRAM_ALLOWED_IDS` | —                                                                   | Comma-separated user/group IDs to allowlist (empty = allow all)                                                                                          |
| `TELEGRAM_LOG_CHAT_ID` | —                                                                   | Chat/group ID to receive runtime error logs (uses `TELEGRAM_BOT_TOKEN`)                                                                                  |
| `DISABLE_SAFETY`       | `false`                                                             | Set to `true` to disable Gemini safety filters (OpenRouter + Gemini models only)                                                                         |

**.env.example**

```env
# LLM — choose one backend
OLLAMA_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.2
# OPENROUTER_API_KEY=your-key-here
# OPENROUTER_MODEL=openai/gpt-4o-mini

# Fact extraction model (OpenRouter only; defaults to a cheap fast model)
# FACT_EXTRACTOR_MODEL=google/gemini-3.1-flash-lite

# Embeddings (always Ollama)
EMBED_MODEL=nomic-embed-text

# Chatbot
SYSTEM_PROMPT=You are a helpful assistant.

# Storage
LANCEDB_PATH=./data/lancedb

# Web server
PORT=3000

# Telegram (only needed for telegram mode)
# TELEGRAM_BOT_TOKEN=your-token-here
# TELEGRAM_ALLOWED_IDS=123456789,987654321
# Optional: chat/group ID to receive runtime error logs (negative ID for groups)
# TELEGRAM_LOG_CHAT_ID=-1001234567890
```

## Development

Install dependencies:

```bash
npm install
```

Run the server and client with hot reload:

```bash
npm run dev
```

- API + SSE: `http://localhost:3000`
- Browser UI: `http://localhost:5173` (Vite dev server, proxies `/api` to the Express server)

Run only the server (no UI):

```bash
npm run dev:server
```

Run as a Telegram bot:

```bash
npm run dev:telegram
```

### Telegram commands

| Command          | Description                                                                         |
| ---------------- | ----------------------------------------------------------------------------------- |
| `/new [name]`    | Start a new conversation. Optionally give it a name; otherwise a timestamp is used. |
| `/sessions`      | List all your conversations, with a ✓ on the active one.                            |
| `/switch <name>` | Switch to an existing conversation (use `default` for the original one).            |
| `/clear`         | Delete the current conversation's history and reset to the default session.         |

Run both the web server and Telegram bot together:

```bash
npm run dev:all
```

## Building for production

Build everything (server + client):

```bash
npm run build
```

Or build separately:

```bash
npm run build:server   # compiles TypeScript → dist/
npm run build:client   # bundles React UI → dist/client/
```

Start the web server (serves the built UI from `dist/client/`):

```bash
npm run start:web
```

Start as a Telegram bot:

```bash
npm run start:telegram
```

Start both the web server and Telegram bot together (recommended — keeps the lore API available):

```bash
npm run start:all
```

To keep it running after you disconnect:

```bash
nohup npm run start:all > persona.log 2>&1 &
```

## Testing

Run the full test suite:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Coverage report:

```bash
npm run test:coverage
```

Coverage output is written to `coverage/`.

## Linting & formatting

```bash
npm run lint          # check for lint errors
npm run lint:fix      # auto-fix lint errors
npm run format        # format all files with Prettier
npm run format:check  # check formatting without writing
```

A pre-commit hook runs lint-staged (lint + format on staged files) and the full test suite before every commit.

## API

### `POST /api/chat`

Send a message and receive a streaming response over SSE.

**Request body**

```json
{ "message": "Hello!", "sessionId": "optional-uuid" }
```

**SSE events**

```
data: {"chunk":"Hello"}
data: {"chunk":", how can I help?"}
data: {"done":true,"sessionId":"<uuid>"}
```

### `GET /api/lore`

List all lore entries stored in the vector database.

### `POST /api/lore`

Add a lore entry (background knowledge the chatbot can retrieve).

**Request body**

```json
{ "name": "Alice", "content": "The user's name is Alice and she lives in Berlin." }
```

### `DELETE /api/lore/:id`

Remove a lore entry by ID.
