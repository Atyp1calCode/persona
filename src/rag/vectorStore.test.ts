import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LANCEDB_TABLE, DEFAULT_SEARCH_LIMIT } from '../constants.js'

const mockDb = vi.hoisted(() => ({
  tableNames: vi.fn(),
  createTable: vi.fn(),
  openTable: vi.fn(),
}))

vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn(() => mockDb),
}))

import { createVectorStore } from './vectorStore.js'

function makeMockTable(results: object[] = []) {
  const toArray = vi.fn().mockResolvedValue(results)
  const where = vi.fn().mockReturnValue({ toArray })
  const limit = vi.fn().mockReturnValue({ where, toArray })
  const distanceType = vi.fn().mockReturnValue({ limit })
  const queryWhere = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(results) })

  return {
    search: vi.fn().mockReturnValue({ distanceType }),
    add: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockReturnValue({ where: queryWhere }),
    _limit: limit,
    _where: where,
    _distanceType: distanceType,
    _toArray: toArray,
    _queryWhere: queryWhere,
  }
}

const baseRecord = {
  text: 'test',
  vector: [0.1, 0.2],
  type: 'lore' as const,
  sessionId: '',
  metadata: '{}',
}

describe('createVectorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.tableNames.mockResolvedValue([])
  })

  it('connects to the given path', async () => {
    const { connect } = await import('@lancedb/lancedb')
    await createVectorStore('./my-db')
    expect(connect).toHaveBeenCalledWith('./my-db')
  })

  it('opens the existing table when it is present', async () => {
    const table = makeMockTable()
    mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
    mockDb.openTable.mockResolvedValue(table)

    await createVectorStore('./db')

    expect(mockDb.openTable).toHaveBeenCalledWith(LANCEDB_TABLE)
  })

  it('does not open a table when none exists', async () => {
    await createVectorStore('./db')
    expect(mockDb.openTable).not.toHaveBeenCalled()
  })

  describe('insert()', () => {
    it('creates the table on first insert', async () => {
      mockDb.createTable.mockResolvedValue(makeMockTable())
      const store = await createVectorStore('./db')

      await store.insert([baseRecord])

      expect(mockDb.createTable).toHaveBeenCalledWith(
        LANCEDB_TABLE,
        expect.arrayContaining([expect.objectContaining({ text: 'test', type: 'lore' })]),
      )
    })

    it('returns a UUID for each inserted record', async () => {
      mockDb.createTable.mockResolvedValue(makeMockTable())
      const store = await createVectorStore('./db')

      const ids = await store.insert([baseRecord, { ...baseRecord, text: 'b' }])

      expect(ids).toHaveLength(2)
      expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('adds to an existing table on subsequent inserts', async () => {
      const table = makeMockTable()
      mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
      mockDb.openTable.mockResolvedValue(table)

      const store = await createVectorStore('./db')
      await store.insert([baseRecord])
      await store.insert([{ ...baseRecord, type: 'chat', sessionId: 's1' }])

      expect(table.add).toHaveBeenCalledTimes(2)
      expect(mockDb.createTable).not.toHaveBeenCalled()
    })
  })

  describe('search()', () => {
    it('returns an empty array when no table exists', async () => {
      const store = await createVectorStore('./db')
      expect(await store.search([1, 2, 3])).toEqual([])
    })

    it('searches with the given vector and limit', async () => {
      const record = { id: '1', text: 'hi', type: 'lore' }
      const table = makeMockTable([record])
      mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
      mockDb.openTable.mockResolvedValue(table)

      const store = await createVectorStore('./db')
      const results = await store.search([1, 2], 3)

      expect(table.search).toHaveBeenCalledWith([1, 2])
      expect(table._limit).toHaveBeenCalledWith(3)
      expect(results).toEqual([record])
    })

    it('uses the default limit constant when none is specified', async () => {
      const table = makeMockTable()
      mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
      mockDb.openTable.mockResolvedValue(table)

      const store = await createVectorStore('./db')
      await store.search([1])

      expect(table._limit).toHaveBeenCalledWith(DEFAULT_SEARCH_LIMIT)
    })

    it('applies a filter when provided', async () => {
      const table = makeMockTable()
      mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
      mockDb.openTable.mockResolvedValue(table)

      const store = await createVectorStore('./db')
      await store.search([1], 5, `type = 'lore'`)

      expect(table._where).toHaveBeenCalledWith(`type = 'lore'`)
    })
  })

  describe('listByType()', () => {
    it('returns an empty array when no table exists', async () => {
      const store = await createVectorStore('./db')
      expect(await store.listByType('lore')).toEqual([])
    })

    it('queries the table filtering by type', async () => {
      const table = makeMockTable()
      mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
      mockDb.openTable.mockResolvedValue(table)

      const store = await createVectorStore('./db')
      await store.listByType('chat')

      expect(table.query).toHaveBeenCalled()
      expect(table._queryWhere).toHaveBeenCalledWith(`type = 'chat'`)
    })
  })

  describe('delete()', () => {
    it('resolves without error when no table exists', async () => {
      const store = await createVectorStore('./db')
      await expect(store.delete('any-id')).resolves.toBeUndefined()
    })

    it('deletes the record with the given id', async () => {
      const table = makeMockTable()
      mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
      mockDb.openTable.mockResolvedValue(table)

      const store = await createVectorStore('./db')
      await store.delete('abc-123')

      expect(table.delete).toHaveBeenCalledWith(`id = 'abc-123'`)
    })
  })

  describe('deleteBySession()', () => {
    it('resolves without error when no table exists', async () => {
      const store = await createVectorStore('./db')
      await expect(store.deleteBySession('s1')).resolves.toBeUndefined()
    })

    it('deletes only records matching the sessionId', async () => {
      const records = [
        { id: 'r1', sessionId: 'session-abc', type: 'chat' },
        { id: 'r2', sessionId: 'session-abc', type: 'chat' },
        { id: 'r3', sessionId: 'other-session', type: 'chat' },
      ]
      const table = makeMockTable(records)
      mockDb.tableNames.mockResolvedValue([LANCEDB_TABLE])
      mockDb.openTable.mockResolvedValue(table)

      const store = await createVectorStore('./db')
      await store.deleteBySession('session-abc')

      expect(table._queryWhere).toHaveBeenCalledWith(`type = 'chat'`)
      expect(table.delete).toHaveBeenCalledWith(`id = 'r1'`)
      expect(table.delete).toHaveBeenCalledWith(`id = 'r2'`)
      expect(table.delete).not.toHaveBeenCalledWith(`id = 'r3'`)
    })
  })
})
