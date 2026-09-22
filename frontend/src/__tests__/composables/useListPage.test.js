import { describe, it, expect, vi } from 'vitest'

const { useListPage } = await import('@/composables/useListPage.js')

function makeFetcher(impl = {}) {
  return {
    fetchList: vi.fn(async () => ({ data: [], summary: null, pagination: {} })),
    remove: vi.fn(async () => ({ success: true })),
    ...impl,
  }
}

describe('useListPage', () => {
  it('fetchData passes search/limit/offset and sets rows/summary/pagination', async () => {
    const fetcher = makeFetcher({
      fetchList: vi.fn(async () => ({
        data: [{ id: 1 }],
        summary: { total: 1 },
        pagination: { total: 1, limit: 20, offset: 0, has_more: false },
      })),
    })
    const shell = useListPage({ fetcher })
    shell.searchQuery.value = 'สม'
    shell.pagination.value.offset = 40

    const pending = shell.fetchData()
    expect(shell.loading.value).toBe(true)
    await pending

    expect(fetcher.fetchList).toHaveBeenCalledWith({ search: 'สม', limit: 20, offset: 40 })
    expect(shell.rows.value).toEqual([{ id: 1 }])
    expect(shell.summary.value).toEqual({ total: 1 })
    expect(shell.pagination.value.total).toBe(1)
    expect(shell.loading.value).toBe(false)
    expect(shell.error.value).toBeNull()
  })

  it('fetchData normalizes missing summary to null and surfaces errors', async () => {
    const fetcher = makeFetcher({
      fetchList: vi.fn(async () => ({ data: [], pagination: {} })),
    })
    const shell = useListPage({ fetcher })
    await shell.fetchData()
    expect(shell.summary.value).toBeNull()

    fetcher.fetchList.mockRejectedValueOnce(new Error('boom'))
    await shell.fetchData()
    expect(shell.error.value).toBe('boom')
    expect(shell.loading.value).toBe(false)

    fetcher.fetchList.mockRejectedValueOnce({})
    await shell.fetchData()
    expect(shell.error.value).toBe('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
  })

  it('fetchData ignores stale responses (last request wins)', async () => {
    let resolveFirst
    const firstGate = new Promise((resolve) => { resolveFirst = resolve })
    const fetcher = makeFetcher({
      fetchList: vi.fn()
        .mockImplementationOnce(() => firstGate)
        .mockImplementationOnce(async () => ({ data: [{ id: 2 }], summary: null, pagination: {} })),
    })
    const shell = useListPage({ fetcher })

    const first = shell.fetchData()
    const second = shell.fetchData()
    resolveFirst({ data: [{ id: 1 }], summary: null, pagination: {} })
    await Promise.all([first, second])

    expect(shell.rows.value).toEqual([{ id: 2 }])
    expect(shell.loading.value).toBe(false)
  })

  it('removeAndRefetch removes then refetches', async () => {
    const fetcher = makeFetcher({
      fetchList: vi.fn(async () => ({ data: [{ id: 9 }], summary: null, pagination: {} })),
    })
    const shell = useListPage({ fetcher })

    await shell.removeAndRefetch(7)

    expect(fetcher.remove).toHaveBeenCalledWith(7)
    expect(fetcher.fetchList).toHaveBeenCalledTimes(1)
    expect(shell.rows.value).toEqual([{ id: 9 }])
  })

  it('modal helpers normalize create/edit/close (null = create)', () => {
    const shell = useListPage({ fetcher: makeFetcher() })

    expect(shell.showModal.value).toBe(false)
    expect(shell.editingRecord.value).toBeNull()

    shell.openCreate()
    expect(shell.editingRecord.value).toBeNull()
    expect(shell.showModal.value).toBe(true)

    shell.openEdit({ id: 3 })
    expect(shell.editingRecord.value).toEqual({ id: 3 })
    expect(shell.showModal.value).toBe(true)

    shell.closeModal()
    expect(shell.showModal.value).toBe(false)
    expect(shell.editingRecord.value).toBeNull()
  })

  it('uses the configured page limit', () => {
    const shell = useListPage({ fetcher: makeFetcher(), limit: 50 })
    expect(shell.pagination.value.limit).toBe(50)
  })
})
