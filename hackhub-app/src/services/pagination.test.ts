import { describe, expect, it, vi } from 'vitest'
import { getAllPages } from './pagination'

describe('getAllPages', () => {
  it('bounds parallel requests and keeps server order when pages finish out of order', async () => {
    const pending = new Map<number, (page: { content: number[] }) => void>()
    const fetchPage = vi.fn((page: number): Promise<{ content: number[]; totalPages?: number }> =>
      page === 0 ? Promise.resolve({ content: [0], totalPages: 7 })
        : new Promise((resolve) => pending.set(page, resolve)),
    )
    const result = getAllPages(fetchPage)
    await Promise.resolve()
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([0, 1, 2, 3, 4])
    for (const page of [4, 2, 3, 1]) pending.get(page)!({ content: [page] })
    await vi.waitFor(() => expect(pending.has(6)).toBe(true))
    pending.get(6)!({ content: [6] })
    pending.get(5)!({ content: [5] })
    expect(await result).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('does not silently return partial data when a page fails', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 2) throw new Error('Page unavailable')
      return { content: [page], totalPages: 3 }
    })
    await expect(getAllPages(fetchPage)).rejects.toThrow('Page unavailable')
  })

  it('handles empty results and responses without a page count', async () => {
    const fetchPage = vi.fn(async () => ({ content: [] }))
    expect(await getAllPages(fetchPage)).toEqual([])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
