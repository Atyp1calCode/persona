import { describe, it, expect, vi } from 'vitest'
import { parseUserNotes, parseGroupLore, parseThinkingMessages } from './config.js'
import type { Logger } from '../../core/logger.js'

const logger: Logger = { error: vi.fn() }

describe('parseUserNotes', () => {
  it('returns an empty map when unset', () => {
    expect(parseUserNotes(undefined, logger).size).toBe(0)
    expect(parseUserNotes('', logger).size).toBe(0)
  })

  it('parses an array of userId/notes objects', () => {
    const map = parseUserNotes(
      '[{"userId":1,"notes":["a","b"]},{"userId":2,"notes":["c"]}]',
      logger,
    )
    expect(map.get(1)).toEqual(['a', 'b'])
    expect(map.get(2)).toEqual(['c'])
  })

  it('accepts a single string as notes', () => {
    const map = parseUserNotes('[{"userId":5,"notes":"only note"}]', logger)
    expect(map.get(5)).toEqual(['only note'])
  })

  it('merges duplicate userId entries', () => {
    const map = parseUserNotes('[{"userId":1,"notes":["a"]},{"userId":1,"notes":["b"]}]', logger)
    expect(map.get(1)).toEqual(['a', 'b'])
  })

  it('logs and returns an empty map on malformed JSON', () => {
    const log: Logger = { error: vi.fn() }
    expect(parseUserNotes('not json', log).size).toBe(0)
    expect(log.error).toHaveBeenCalled()
  })

  it('logs and returns an empty map when the JSON is not an array', () => {
    const log: Logger = { error: vi.fn() }
    expect(parseUserNotes('{"userId":1}', log).size).toBe(0)
    expect(log.error).toHaveBeenCalled()
  })
})

describe('parseGroupLore', () => {
  it('parses an array of chatId/lore objects', () => {
    const map = parseGroupLore(
      '[{"chatId":-100123,"lore":["You are Annabel","Sharp-tongued but warm"]}]',
      logger,
    )
    expect(map.get(-100123)).toEqual(['You are Annabel', 'Sharp-tongued but warm'])
  })

  it('accepts a single string as lore', () => {
    const map = parseGroupLore('[{"chatId":-5,"lore":"You are a pirate"}]', logger)
    expect(map.get(-5)).toEqual(['You are a pirate'])
  })

  it('logs and returns an empty map on malformed JSON', () => {
    const log: Logger = { error: vi.fn() }
    expect(parseGroupLore('nope', log).size).toBe(0)
    expect(log.error).toHaveBeenCalled()
  })
})

describe('parseThinkingMessages', () => {
  it('returns undefined when unset so built-in defaults apply', () => {
    expect(parseThinkingMessages(undefined, logger)).toBeUndefined()
    expect(parseThinkingMessages('', logger)).toBeUndefined()
  })

  it('parses a JSON array of strings', () => {
    expect(parseThinkingMessages('["a…","b…"]', logger)).toEqual(['a…', 'b…'])
  })

  it('logs and returns undefined on malformed JSON or an empty array', () => {
    const log: Logger = { error: vi.fn() }
    expect(parseThinkingMessages('nope', log)).toBeUndefined()
    expect(parseThinkingMessages('[]', log)).toBeUndefined()
    expect(log.error).toHaveBeenCalledTimes(2)
  })
})
