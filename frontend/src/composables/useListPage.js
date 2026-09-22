import { ref } from 'vue'
import { useRequestSeq } from '@/composables/useRequestSeq.js'

/**
 * Thin list-page shell: fetch + stale guard + pagination + modal + delete-refetch.
 * Pages supply `fetcher` ({ fetchList, remove }) and keep validate/save/confirm-text,
 * search debounce, toasts and busy flags. Full set is always returned; pages
 * destructure only what fits (Multiplier skips searchQuery/fetchData/removeAndRefetch,
 * Equivalence skips removeAndRefetch).
 *
 * @param {{ fetcher: { fetchList: Function, remove: Function }, limit?: number }} config
 */
export function useListPage({ fetcher, limit = 20 }) {
  const { next: nextRequest } = useRequestSeq()

  const loading = ref(false)
  const error = ref(null)
  const rows = ref([])
  const summary = ref(null)
  const pagination = ref({ total: 0, limit, offset: 0, has_more: false })
  const searchQuery = ref('')
  const showModal = ref(false)
  const editingRecord = ref(null)

  async function fetchData() {
    const req = nextRequest()
    loading.value = true
    error.value = null
    try {
      const result = await fetcher.fetchList({
        search: searchQuery.value,
        limit: pagination.value.limit,
        offset: pagination.value.offset,
      })
      if (!req.isCurrent()) return
      rows.value = result.data
      summary.value = result.summary || null
      pagination.value = result.pagination
    } catch (err) {
      if (!req.isCurrent()) return
      error.value = err.message || 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
    } finally {
      if (req.isCurrent()) loading.value = false
    }
  }

  function openCreate() {
    editingRecord.value = null
    showModal.value = true
  }

  function openEdit(record) {
    editingRecord.value = record
    showModal.value = true
  }

  function closeModal() {
    showModal.value = false
    editingRecord.value = null
  }

  async function removeAndRefetch(id) {
    await fetcher.remove(id)
    await fetchData()
  }

  return {
    loading,
    error,
    rows,
    summary,
    pagination,
    searchQuery,
    showModal,
    editingRecord,
    fetchData,
    openCreate,
    openEdit,
    closeModal,
    removeAndRefetch,
  }
}
