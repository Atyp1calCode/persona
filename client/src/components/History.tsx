import { useEffect, useState } from 'react'
import { API_HISTORY } from '../constants'
import styles from './History.module.css'

interface Session {
  sessionId: string
  exchanges: number
  lastActivity: number
}

function formatDate(ts: number): string {
  if (!ts) return 'Unknown'
  return new Date(ts).toLocaleString()
}

function truncate(id: string): string {
  return id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [clearing, setClearing] = useState<string | null>(null)

  async function load() {
    const res = await fetch(API_HISTORY)
    setSessions(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  async function clearSession(sessionId: string) {
    setClearing(sessionId)
    await fetch(`${API_HISTORY}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
    setClearing(null)
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Chat History</h2>

      <div className={styles.list}>
        {sessions.length === 0 && <p className={styles.empty}>No chat sessions stored yet.</p>}
        {sessions.map((s) => (
          <div key={s.sessionId} className={styles.card}>
            <div className={styles.cardHeader}>
              <code className={styles.sessionId}>{truncate(s.sessionId)}</code>
              <button
                className={styles.clearBtn}
                onClick={() => clearSession(s.sessionId)}
                disabled={clearing === s.sessionId}
              >
                {clearing === s.sessionId ? 'Clearing…' : 'Clear'}
              </button>
            </div>
            <p className={styles.meta}>
              {s.exchanges} {s.exchanges === 1 ? 'exchange' : 'exchanges'} &middot; Last active:{' '}
              {formatDate(s.lastActivity)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
