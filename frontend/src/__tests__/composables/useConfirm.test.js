import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmAction, confirmDelete, confirmLogout, confirmSave, useConfirm } from '@/composables/useConfirm.js'

describe('useConfirm', () => {
  beforeEach(() => {
    const { state, cancel } = useConfirm()
    if (state.open) cancel()
  })

  it('resolves true when accept is called', async () => {
    const pending = confirmAction({ title: 'ทดสอบ', message: 'msg' })
    const { state, accept } = useConfirm()
    expect(state.open).toBe(true)
    expect(state.title).toBe('ทดสอบ')
    accept()
    await expect(pending).resolves.toBe(true)
    expect(state.open).toBe(false)
  })

  it('resolves false when cancel is called', async () => {
    const pending = confirmDelete()
    const { cancel } = useConfirm()
    cancel()
    await expect(pending).resolves.toBe(false)
  })

  it('confirmLogout and confirmSave set expected defaults', async () => {
    const logoutPending = confirmLogout()
    const { state, cancel } = useConfirm()
    expect(state.title).toBe('ออกจากระบบ')
    expect(state.variant).toBe('danger')
    cancel()
    await logoutPending

    const savePending = confirmSave()
    expect(state.title).toBe('ยืนยันการบันทึก')
    expect(state.variant).toBe('primary')
    cancel()
    await savePending
  })
})
