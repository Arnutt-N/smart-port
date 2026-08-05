const ROLE_LABELS_EN = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
}

const ROLE_LABELS_TH = {
  superadmin: 'ซูเปอร์แอดมิน',
  admin: 'ผู้ดูแลระบบ',
  operator: 'ผู้ปฏิบัติงาน',
  viewer: 'ผู้ชม',
}

/**
 * @param {string | null | undefined} role
 * @param {'en' | 'th'} [locale='en']
 */
export function roleLabel(role, locale = 'en') {
  const map = locale === 'th' ? ROLE_LABELS_TH : ROLE_LABELS_EN
  return map[role] || role || '-'
}
