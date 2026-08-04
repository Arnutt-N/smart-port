import { useResourceCrud } from '@/composables/useResourceCrud.js'

function toPayload(data) {
  const payload = {}
  if (data.servantId !== undefined) payload.servant_id = data.servantId
  if (data.decorationName !== undefined) payload.decoration_name = data.decorationName
  if (data.decorationClass !== undefined) payload.decoration_class = data.decorationClass
  if (data.receivedYear !== undefined) payload.received_year = data.receivedYear
  if (data.gazetteRef !== undefined) payload.gazette_ref = data.gazetteRef
  if (data.description !== undefined) payload.description = data.description
  return payload
}

function mapRow(row) {
  return {
    decorationId: row.decoration_id,
    servantId: row.servant_id,
    servantName: row.servant_name,
    decorationName: row.decoration_name,
    decorationClass: row.decoration_class,
    receivedYear: row.received_year,
    gazetteRef: row.gazette_ref,
    description: row.description,
    createdAt: row.created_at,
  }
}

export function useDecorations() {
  return useResourceCrud({
    path: 'royal-decorations',
    mapRow,
    toPayload,
  })
}
