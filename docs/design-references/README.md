# Design References

ไฟล์ DESIGN.md จากบริษัทต่าง ๆ ที่ดึงมาจาก [official-design-md](https://github.com/VoltAgent/official-design-md)
ใช้เป็น reference สำหรับสร้าง DESIGN.md ของ Smart Port

## วิธีดึงไฟล์

```bash
curl -sL https://nuxt.com/design.md > docs/design-references/nuxt-design.md
curl -sL https://mintlify.com/design.md > docs/design-references/mintlify-design.md
curl -sL https://atlassian.design/DESIGN.md > docs/design-references/atlassian-design.md
```

## รายการ

| ไฟล์ | แหล่ง | สไตล์ | สถานะ |
|------|-------|-------|--------|
| [`nuxt-design.md`](./nuxt-design.md) | [nuxt.com/design.md](https://nuxt.com/design.md) | Vue ecosystem, Tailwind v4, dark mode default | ✅ ดึงแล้ว (279 lines) |
| [`mintlify-design.md`](./mintlify-design.md) | [mintlify.com/design.md](https://mintlify.com/design.md) | Token-driven, per-theme colors, reading-optimized | ✅ ดึงแล้ว (184 lines) |
| `atlassian-design.md` | [atlassian.design/DESIGN.md](https://atlassian.design/DESIGN.md) | Enterprise, structured blue, clarity-first | ยังไม่ได้ดึง |

## สรุปเปรียบเทียบ

ดูฉบับเต็ม: [`comparison.md`](./comparison.md)

### Pattern หลักที่พบ

| Pattern | Nuxt | Mintlify | Smart Port นำมาใช้ |
|---------|------|----------|-------------------|
| YAML frontmatter (machine-readable tokens) | ✅ | ✅ | ✅ ควรเพิ่ม |
| Semantic color aliases | `primary` → `green` | `background-primary` | ✅ เพิ่ม semantic table |
| Per-theme `{ light, dark }` tokens | ✅ | ✅ | ❌ ไม่ต้อง (sidebar dark อย่างเดียว) |
| Text hierarchy classes | `text-highlighted` > `text-muted` | `foreground-primary` > `foreground-muted` | ✅ มีแล้ว (government-700 > 400) |
| Component primitives | Nuxt UI (`UButton`) | CVA + `cn()` | ❌ ใช้ `.btn-primary` (Tailwind layer) |
| Motion tokens + reduced-motion | ✅ | ✅ (150–250ms) | ✅ ควรเพิ่ม reduced-motion |
| Voice & Content guidelines | ✅ | ❌ | ✅ ควรเพิ่ม (Thai labels) |
| Do's / Don'ts | ✅ | ✅ | ✅ มีแล้ว |

### สิ่งที่ Smart Port DESIGN.md ควรเพิ่ม (จาก comparison)

1. YAML frontmatter — ให้ AI agent parse tokens ได้ทันที
2. Semantic alias table — `primary` → `primary-500`, `text` → `government-600`
3. `prefers-reduced-motion` note ใน Motion section
4. Voice & Content — แนวทางเขียน label/error/toast ภาษาไทย
