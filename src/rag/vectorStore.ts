import * as lancedb from '@lancedb/lancedb'
import { randomUUID } from 'crypto'
import { LANCEDB_TABLE, DEFAULT_SEARCH_LIMIT } from '../constants.js'

export interface MemoryRecord {
  id: string
  text: string
  vector: number[]
  type: 'lore' | 'chat'
  sessionId: string
  metadata: string
}

export interface VectorStore {
  insert(records: Omit<MemoryRecord, 'id'>[]): Promise<string[]>
  search(vector: number[], limit?: number, filter?: string): Promise<MemoryRecord[]>
  listByType(type: 'lore' | 'chat'): Promise<MemoryRecord[]>
  getRecentBySession(sessionId: string, limit: number): Promise<MemoryRecord[]>
  delete(id: string): Promise<void>
  deleteBySession(sessionId: string): Promise<void>
}

export async function createVectorStore(path: string): Promise<VectorStore> {
  const db = await lancedb.connect(path)
  const names = await db.tableNames()
  let table: lancedb.Table | null = names.includes(LANCEDB_TABLE)
    ? await db.openTable(LANCEDB_TABLE)
    : null

  async function insert(records: Omit<MemoryRecord, 'id'>[]): Promise<string[]> {
    const ids = records.map(() => randomUUID())
    const rows = records.map((r, i) => ({ ...r, id: ids[i] }))
    if (!table) {
      table = await db.createTable(LANCEDB_TABLE, rows)
    } else {
      await table.add(rows)
    }
    return ids
  }

  async function search(
    vector: number[],
    limit = DEFAULT_SEARCH_LIMIT,
    filter?: string,
  ): Promise<MemoryRecord[]> {
    if (!table) return []
    let q = table.search(vector).limit(limit)
    if (filter) q = q.where(filter)
    return (await q.toArray()) as unknown as MemoryRecord[]
  }

  async function listByType(type: 'lore' | 'chat'): Promise<MemoryRecord[]> {
    if (!table) return []
    return (await table.query().where(`type = '${type}'`).toArray()) as unknown as MemoryRecord[]
  }

  async function del(id: string): Promise<void> {
    if (!table) return
    await table.delete(`id = '${id}'`)
  }

  async function getRecentBySession(sessionId: string, limit: number): Promise<MemoryRecord[]> {
    if (!table) return []
    const records = (await table
      .query()
      .where(`type = 'chat' AND "sessionId" = '${sessionId}'`)
      .toArray()) as unknown as MemoryRecord[]
    return records
      .sort((a, b) => {
        const tA = (JSON.parse(a.metadata) as { timestamp?: number }).timestamp ?? 0
        const tB = (JSON.parse(b.metadata) as { timestamp?: number }).timestamp ?? 0
        return tA - tB
      })
      .slice(-limit)
  }

  async function deleteBySession(sessionId: string): Promise<void> {
    if (!table) return
    const all = (await table.query().where(`type = 'chat'`).toArray()) as unknown as MemoryRecord[]
    const matching = all.filter((r) => r.sessionId === sessionId)
    for (const record of matching) {
      await table.delete(`id = '${record.id}'`)
    }
  }

  return { insert, search, listByType, getRecentBySession, delete: del, deleteBySession }
}
