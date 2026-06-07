import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import type { Chatbot } from '../../core/chatbot.js'
import type { Retriever } from '../../rag/retriever.js'
import type { VectorStore } from '../../rag/vectorStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = path.resolve(__dirname, '../../../dist/client')

export function createWebServer(chatbot: Chatbot, retriever: Retriever, store: VectorStore) {
  const app = express()
  app.use(cors())
  app.use(express.json())

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(CLIENT_DIST))
  }

  app.post('/api/chat', async (req, res) => {
    const { message, sessionId = randomUUID() } = req.body as {
      message: string
      sessionId?: string
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`)

    try {
      for await (const chunk of chatbot.chat(message, sessionId)) {
        send({ chunk })
      }
      send({ done: true, sessionId })
    } catch (err) {
      send({ error: String(err) })
    }

    res.end()
  })

  app.post('/api/lore', async (req, res) => {
    const { name, content } = req.body as { name: string; content: string }
    const id = await retriever.addLore(name, content)
    res.json({ id })
  })

  app.get('/api/lore', async (_req, res) => {
    const records = await store.listByType('lore')
    res.json(records.map((r) => ({ id: r.id, text: r.text, ...JSON.parse(r.metadata) })))
  })

  app.delete('/api/lore/:id', async (req, res) => {
    await store.delete(req.params.id)
    res.json({ ok: true })
  })

  app.get('/api/history', async (_req, res) => {
    const records = await store.listByType('chat')
    const sessions = new Map<
      string,
      { sessionId: string; exchanges: number; lastActivity: number }
    >()
    for (const r of records) {
      const { timestamp = 0 } = JSON.parse(r.metadata) as { timestamp?: number }
      const s = sessions.get(r.sessionId)
      if (!s) {
        sessions.set(r.sessionId, { sessionId: r.sessionId, exchanges: 1, lastActivity: timestamp })
      } else {
        s.exchanges++
        if (timestamp > s.lastActivity) s.lastActivity = timestamp
      }
    }
    res.json([...sessions.values()].sort((a, b) => b.lastActivity - a.lastActivity))
  })

  app.delete('/api/history/:sessionId', async (req, res) => {
    try {
      await store.deleteBySession(req.params.sessionId)
      res.json({ ok: true })
    } catch (err) {
      console.error('Failed to delete session:', err)
      res.status(500).json({ ok: false, error: String(err) })
    }
  })

  if (process.env.NODE_ENV === 'production') {
    app.get('*', (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'))
    })
  }

  return app
}
