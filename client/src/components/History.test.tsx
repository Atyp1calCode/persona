// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import History from './History'
import { API_HISTORY } from '../constants'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockSessions = [
  { sessionId: 'session-aabbcc-001', exchanges: 3, lastActivity: 1700000002000 },
  { sessionId: '123456789', exchanges: 1, lastActivity: 1700000001000 },
]

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve(data), ok: true }
}

describe('History', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(jsonResponse(mockSessions))
  })

  it('loads and displays sessions on mount', async () => {
    render(<History />)
    await waitFor(() => {
      expect(screen.getByText(/session-aa/)).toBeDefined()
      expect(screen.getByText(/123456789/)).toBeDefined()
    })
    expect(mockFetch).toHaveBeenCalledWith(API_HISTORY)
  })

  it('shows the empty state message when there are no sessions', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    render(<History />)
    await waitFor(() => {
      expect(screen.getByText(/No chat sessions stored yet/)).toBeDefined()
    })
  })

  it('displays exchange count for each session', async () => {
    render(<History />)
    await waitFor(() => {
      expect(screen.getByText(/3 exchanges/)).toBeDefined()
      expect(screen.getByText(/1 exchange/)).toBeDefined()
    })
  })

  it('sends a DELETE request when clearing a session', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSessions))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const user = userEvent.setup()
    render(<History />)
    await waitFor(() => screen.getAllByText('Clear'))

    await user.click(screen.getAllByText('Clear')[0])

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_HISTORY}/${encodeURIComponent(mockSessions[0].sessionId)}`,
      { method: 'DELETE' },
    )
  })

  it('removes the session from the list after clearing', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSessions))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const user = userEvent.setup()
    render(<History />)
    await waitFor(() => screen.getAllByText('Clear'))

    await user.click(screen.getAllByText('Clear')[0])

    await waitFor(() => {
      expect(screen.queryByText(/session-aa/)).toBeNull()
    })
  })
})
