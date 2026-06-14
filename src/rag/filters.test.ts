import { describe, it, expect } from 'vitest'
import { quoteLiteral, chatSessionFilter } from './filters.js'

describe('quoteLiteral', () => {
  it('wraps a plain value in single quotes', () => {
    expect(quoteLiteral('abc')).toBe(`'abc'`)
  })

  it('escapes single quotes by doubling them', () => {
    expect(quoteLiteral("O'Brien")).toBe(`'O''Brien'`)
  })

  it('neutralises an injection attempt', () => {
    expect(quoteLiteral("x' OR '1'='1")).toBe(`'x'' OR ''1''=''1'`)
  })
})

describe('chatSessionFilter', () => {
  it('builds a session-scoped chat filter', () => {
    expect(chatSessionFilter('s1')).toBe(`type = 'chat' AND "sessionId" = 's1'`)
  })

  it('escapes the sessionId', () => {
    expect(chatSessionFilter("a'b")).toBe(`type = 'chat' AND "sessionId" = 'a''b'`)
  })
})
