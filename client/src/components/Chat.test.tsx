// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Chat from './Chat'
import { API_CHAT } from '../constants'

// jsdom does not implement scrollIntoView
HTMLElement.prototype.scrollIntoView = vi.fn() as typeof HTMLElement.prototype.scrollIntoView

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeSSEResponse(events: string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event))
      controller.close()
    },
  })
  return { body, ok: true }
}

const defaultSSE = [
  'data: {"chunk":"Hello"}\n\n',
  'data: {"done":true,"sessionId":"test-session"}\n\n',
]

describe('Chat', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(makeSSEResponse(defaultSSE))
  })

  it('renders the empty state message initially', () => {
    render(<Chat />)
    expect(screen.getByText('Send a message to start chatting')).toBeDefined()
  })

  it('renders the input field and send button', () => {
    render(<Chat />)
    expect(screen.getByPlaceholderText('Type a message…')).toBeDefined()
    expect(screen.getByText('Send')).toBeDefined()
  })

  it('disables the send button when the input is empty', () => {
    render(<Chat />)
    expect((screen.getByText('Send') as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables the send button when the input has text', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hello')
    expect((screen.getByText('Send') as HTMLButtonElement).disabled).toBe(false)
  })

  it('sends the message to the chat API on submit', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hi')
    await user.click(screen.getByText('Send'))

    expect(mockFetch).toHaveBeenCalledWith(API_CHAT, expect.objectContaining({ method: 'POST' }))
  })

  it('clears the input after sending', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    const input = screen.getByPlaceholderText('Type a message…') as HTMLInputElement
    await user.type(input, 'hello')
    await user.click(screen.getByText('Send'))
    expect(input.value).toBe('')
  })

  it('displays the streamed assistant response', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hi')
    await user.click(screen.getByText('Send'))

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeDefined()
    })
  })

  it('submits on Enter key press', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    await user.type(screen.getByPlaceholderText('Type a message…'), 'hello{Enter}')
    expect(mockFetch).toHaveBeenCalled()
  })

  it('does not submit on Shift+Enter', async () => {
    const user = userEvent.setup()
    render(<Chat />)
    const input = screen.getByPlaceholderText('Type a message…')
    await user.type(input, 'hello')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
