import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, sep } from 'node:path'

// Issue #148 — ฟิลด์ฟอร์มทุกตัวใน frontend/src ต้องมี id และมี accessible name
// (label[for] ผูกกับ id · aria-label/aria-labelledby · หรือถูกครอบด้วย <label>)
// Chrome DevTools Issues เคยรายงาน "No label associated with a form field" +
// "A form field element should have an id or name attribute" ทุกหน้าที่มีฟอร์ม
// เทสนี้อ่านซอร์สโดยตรงเพื่อกัน regression — เพิ่มฟิลด์ใหม่ไม่มี label ต้องตกตั้งแต่ในเครื่อง

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..')

function listVueFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      out.push(...listVueFiles(full))
    } else if (entry.name.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

function templateRegion(source) {
  // ยึดช่วง markup ทั้งหมด: <template> แรก ถึง </template> สุดท้าย
  // (template ภายในอย่าง <template v-if> ไม่กระทบ เพราะเราขอ superset)
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  if (start === -1 || end === -1 || end <= start) return null
  return source.slice(start, end + '</template>'.length)
}

function stripComments(markup) {
  return markup.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

// หาจุดปิด tag ที่รองรับ attribute คร่อม quote หลายบรรทัด
function findTagEnd(text, from) {
  let quote = null
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return i
    }
  }
  return -1
}

const CONTROL_RE = /<(input|select|textarea)(?=[\s/>])/g
const LABEL_OPEN_RE = /<label(?=[\s/>])/g

function attrValue(tagText, name) {
  // คืน { bound, value } ของ attribute name หรือ :name (value = string literal หรือ expression ดิบ)
  const re = new RegExp(`(?:^|\\s)(:${name}|${name})\\s*=\\s*("([^"]*)"|'([^']*)')`, 'm')
  const m = tagText.match(re)
  if (!m) return null
  return { bound: m[1].startsWith(':'), value: m[3] ?? m[4] ?? '' }
}

function analyzeFile(absPath) {
  const source = readFileSync(absPath, 'utf8')
  const relPath = relative(srcDir, absPath).split(sep).join('/')
  const region = templateRegion(source)
  if (!region) return { relPath, violations: [] }

  const markup = stripComments(region)
  const baseOffset = source.indexOf('<template>') + '<template>'.length

  // เก็บตำแหน่ง label เปิด/ปิด และฟิลด์ แล้วไล่ stack นับความลึกการครอบ
  const tokens = []
  LABEL_OPEN_RE.lastIndex = 0
  let lm
  while ((lm = LABEL_OPEN_RE.exec(markup)) !== null) {
    tokens.push({ pos: lm.index, kind: 'labelOpen', end: findTagEnd(markup, lm.index) })
  }
  const closeRe = /<\/label\s*>/g
  let cm
  while ((cm = closeRe.exec(markup)) !== null) {
    tokens.push({ pos: cm.index, kind: 'labelClose' })
  }
  CONTROL_RE.lastIndex = 0
  let tm
  while ((tm = CONTROL_RE.exec(markup)) !== null) {
    tokens.push({ pos: tm.index, kind: 'control', tag: tm[1], end: findTagEnd(markup, tm.index) })
  }
  tokens.sort((a, b) => a.pos - b.pos)

  // label[for] ทั้งไฟล์ — จับคู่ static↔static และ expression ของ :for ↔ :id
  const labelFors = []
  for (const t of tokens) {
    if (t.kind !== 'labelOpen' || t.end === -1) continue
    const tagText = markup.slice(t.pos, t.end + 1)
    const f = attrValue(tagText, 'for')
    if (f) labelFors.push(f)
  }

  const tplLine = source.slice(0, baseOffset - '<template>'.length).split('\n').length
  function lineAt(idx) {
    return tplLine + markup.slice(0, idx).split('\n').length
  }

  const violations = []
  let depth = 0
  for (const t of tokens) {
    if (t.kind === 'labelOpen') { depth++; continue }
    if (t.kind === 'labelClose') { depth = Math.max(0, depth - 1); continue }

    if (t.end === -1) continue
    const tagText = markup.slice(t.pos, t.end + 1)
    const problems = []

    const id = attrValue(tagText, 'id')
    if (!id) {
      problems.push('ไม่มี id')
    }

    const ariaLabel = attrValue(tagText, 'aria-label')
    const ariaLabelledby = attrValue(tagText, 'aria-labelledby')
    const wrapped = depth > 0
    let labeled = !!ariaLabel || !!ariaLabelledby || wrapped
    if (!labeled && id) {
      labeled = labelFors.some(
        (f) => f.bound === id.bound && f.value.trim() === id.value.trim(),
      )
    }
    if (!labeled) {
      problems.push('ไม่มี label/aria-label')
    }

    if (problems.length) {
      violations.push({ where: `${relPath}:~${lineAt(t.pos)}`, tag: t.tag, why: problems.join(' + ') })
    }
  }
  return { relPath, violations }
}

describe('a11y: ฟิลด์ฟอร์มต้องมี id + accessible name (issue #148)', () => {
  const files = listVueFiles(srcDir)

  it('สแกนเจอไฟล์ .vue จำนวนมากพอ (sanity check)', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('input/select/textarea ทุกตัวมี id และมี label ผูกกัน', () => {
    const all = files.map(analyzeFile)
    const violations = all.flatMap((r) => r.violations)
    const report = violations
      .map((v) => `  ${v.where}  <${v.tag}> — ${v.why}`)
      .join('\n')
    expect(
      violations,
      `พบฟิลด์ไม่ผ่านเกณฑ์ ${violations.length} จุด:\n${report}`,
    ).toEqual([])
  })
})
