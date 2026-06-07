// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Lore from './Lore'
import { API_LORE } from '../constants'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockItems = [
  { id: '1', name: 'World', text: 'The world is round.' },
  { id: '2', name: 'Magic', text: 'Magic exists.' },
]

function jsonResponse(data: unknown) {
  return { json: () => Promise.resolve(data), ok: true }
}

describe('Lore', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(jsonResponse(mockItems))
  })

  it('loads and displays lore items on mount', async () => {
    render(<Lore />)
    await waitFor(() => {
      expect(screen.getByText('World')).toBeDefined()
      expect(screen.getByText('Magic')).toBeDefined()
    })
    expect(mockFetch).toHaveBeenCalledWith(API_LORE)
  })

  it('shows the empty state message when there are no items', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    render(<Lore />)
    await waitFor(() => {
      expect(screen.getByText(/No lore entries yet/)).toBeDefined()
    })
  })

  it('disables the Add button when name or content is empty', async () => {
    mockFetch.mockResolvedValue(jsonResponse([]))
    render(<Lore />)
    expect((screen.getByText('Add') as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables the Add button only when both fields have text', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValue(jsonResponse([]))
    render(<Lore />)

    await user.type(screen.getByPlaceholderText(/Name/), 'World')
    expect((screen.getByText('Add') as HTMLButtonElement).disabled).toBe(true)

    await user.type(screen.getByPlaceholderText('Content'), 'Round.')
    expect((screen.getByText('Add') as HTMLButtonElement).disabled).toBe(false)
  })

  it('POSTs to the lore API when adding an item', async () => {
    const user = userEvent.setup()
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 'new' }))
      .mockResolvedValueOnce(jsonResponse([]))

    render(<Lore />)
    await user.type(screen.getByPlaceholderText(/Name/), 'World')
    await user.type(screen.getByPlaceholderText('Content'), 'Round.')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        API_LORE,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'World', content: 'Round.' }),
        }),
      )
    })
  })

  it('clears the form fields after adding', async () => {
    const user = userEvent.setup()
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 'new' }))
      .mockResolvedValueOnce(jsonResponse([]))

    render(<Lore />)
    const nameInput = screen.getByPlaceholderText(/Name/) as HTMLInputElement
    const contentInput = screen.getByPlaceholderText('Content') as HTMLTextAreaElement

    await user.type(nameInput, 'World')
    await user.type(contentInput, 'Round.')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(nameInput.value).toBe('')
      expect(contentInput.value).toBe('')
    })
  })

  it('sends a DELETE request when removing an item', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockItems))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const user = userEvent.setup()
    render(<Lore />)
    await waitFor(() => screen.getByText('World'))

    await user.click(screen.getAllByText('Delete')[0])

    expect(mockFetch).toHaveBeenCalledWith(`${API_LORE}/1`, { method: 'DELETE' })
  })

  it('removes the item from the list after deletion', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockItems))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const user = userEvent.setup()
    render(<Lore />)
    await waitFor(() => screen.getByText('World'))

    await user.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(screen.queryByText('World')).toBeNull()
    })
  })
})
