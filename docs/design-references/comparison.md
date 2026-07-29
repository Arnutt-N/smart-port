# Design System Comparison — Nuxt vs Mintlify vs Smart Port

วิเคราะห์ pattern จาก official DESIGN.md ของ Nuxt และ Mintlify
เทียบกับ DESIGN.md ของ Smart Port ที่ root

## โครงสร้างเอกสาร (Document Structure)

| Section | Nuxt | Mintlify | Smart Port |
|---------|------|----------|------------|
| YAML frontmatter (tokens) | ✅ ครบ (brand, theme, semantic, css-vars, components) | ✅ ครบ (colors, typography) | ❌ ไม่มี — ใช้ markdown ล้วน |
| Overview / Identity | ✅ | ✅ (สั้น) | ✅ |
| Color tokens | ✅ semantic aliases → Tailwind scales | ✅ per-theme (light/dark) | ✅ raw hex table |
| Typography | ✅ | ✅ (4 families) | ✅ (1 family) |
| Layout / Spacing | ✅ | ✅ (grid system) | ✅ |
| Components | ✅ (Nuxt UI primitives) | ✅ (CVA pattern) | ✅ (hand-rolled Tailwind) |
| Motion | ✅ (สั้น) | ✅ (easing tokens) | ✅ |
| Do's / Don'ts | ✅ | ✅ | ✅ |
| Voice & Content | ✅ | ❌ | ❌ |

## Pattern ที่น่าสนใจ

### 1. YAML Frontmatter as Machine-Readable Tokens

**Nuxt:** ใส่ design tokens ทั้งหมดใน YAML frontmatter — AI agent parse ได้ทันทีโดยไม่ต้องอ่าน prose

```yaml
semantic-colors:
  primary: green
  neutral: slate
  error: red
components:
  button-primary: 'UButton color="primary"'
```

**Mintlify:** ใส่ colors + typography ใน frontmatter เป็น `{ light, dark }` objects

```yaml
colors:
  background-primary: { light: '#fefdfb', dark: '#0a0b0f' }
```

**Smart Port ปัจจุบัน:** ไม่มี frontmatter — tokens อยู่ใน markdown tables

**คำแนะนำ:** เพิ่ม YAML frontmatter ให้ Smart Port DESIGN.md เพื่อให้ AI agent parse tokens ได้เร็วขึ้น (ดูตัวอย่างด้านล่าง)

### 2. Semantic Color Aliases vs Raw Palette

| แนวทาง | ใครใช้ | ข้อดี | ข้อเสีย |
|----------|--------|-------|---------|
| Semantic alias → scale | Nuxt (`primary` → `green`) | เปลี่ยน theme ได้ที่จุดเดียว | ต้องมี component library รองรับ |
| Per-theme token | Mintlify (`background-primary: {light, dark}`) | Dark mode ในตัว | verbose, ต้องกำหนดทุก token |
| Raw palette + usage table | Smart Port (`primary-500` = `#0ea5e9`) | ตรงไปตรงมา, ไม่ต้อง lib | เปลี่ยน theme ต้องแก้หลายจุด |

**Smart Port เหมาะกับ raw palette** เพราะไม่มี component library — แต่ควรเพิ่ม semantic layer ทับ:

```yaml
semantic:
  primary: primary-500
  text: government-600
  heading: government-700
  border: government-200
  surface: white
  surface-alt: government-50
```

### 3. Text Hierarchy

| Level | Nuxt | Mintlify | Smart Port |
|-------|------|----------|------------|
| Heading | `text-highlighted` | `text-foreground-primary` | `text-government-700` |
| Body | `text-default` | `text-foreground-primary` | `text-government-600` |
| Secondary | `text-muted` | `text-foreground-secondary` | `text-government-500` |
| Muted | `text-dimmed` | `text-foreground-muted` | `text-government-400` |

Smart Port ใช้ raw Tailwind classes ตรง ๆ — เหมาะกับโปรเจกต์ที่ไม่มี design token abstraction layer

### 4. Component Strategy

| | Nuxt | Mintlify | Smart Port |
|---|------|----------|------------|
| Approach | Nuxt UI primitives (`UButton`) | CVA + `cn()` + `data-*` | Tailwind `@layer components` (`.btn-primary`) |
| Variants | `color` + `variant` props | class-variance-authority | Separate classes (`.btn-primary`, `.btn-secondary`) |
| Focus | Nuxt UI handles | `ring-1 ring-inset` + brand ring | `focus-visible:ring-2 ring-primary-500` |

Smart Port ใช้ approach ที่ simple ที่สุด — เหมาะกับทีมเล็กและ government context

### 5. Dark Mode

| | Nuxt | Mintlify | Smart Port |
|---|------|----------|------------|
| Strategy | Full dark (default) | Full dark (class-based) | Sidebar only |
| Token support | `--ui-bg-*` vars | `{ light, dark }` per token | `.semi-dark` class (sidebar) |

Smart Port ไม่ต้องลงทุน dark mode เต็มรูปแบบ — sidebar dark ก็พอ

### 6. Motion

| | Nuxt | Mintlify | Smart Port |
|---|------|----------|------------|
| Philosophy | "Sparingly" | "Clarifies change, not decoration" | "Subtle" |
| Duration | Nuxt UI defaults | 150–250ms band | 0.3–0.5s |
| Reduced motion | Honor | Honor (gate every animation) | ไม่ได้ระบุ |

**คำแนะนำ:** เพิ่ม `prefers-reduced-motion` note ใน Smart Port DESIGN.md

## สรุปแนวทางสำหรับ Smart Port DESIGN.md

### สิ่งที่ควรเพิ่ม

1. **YAML frontmatter** — machine-readable tokens (colors, semantic, components)
2. **Semantic alias table** — map `primary` → `primary-500`, `text` → `government-600` etc.
3. **`prefers-reduced-motion`** — ระบุใน Motion section
4. **Voice & Content** — แนวทางเขียน label/error/toast (ไทย)

### สิ่งที่ไม่ต้องเพิ่ม

- Per-theme `{ light, dark }` tokens — Smart Port ไม่มี full dark mode
- CVA / component library abstraction — hand-rolled เหมาะกับทีมเล็ก
- Grid system tokens — dashboard layout ใช้ Tailwind grid ตรง ๆ ได้
- Multiple font families — Noto Sans Thai ตัวเดียวพอ

### Proposed YAML Frontmatter

```yaml
---
name: Smart Port
version: 1.0.0
description: Government HRIS design system. Sky-blue primary, slate neutral, Thai-first.
theme:
  font-sans: "'Noto Sans Thai', system-ui, sans-serif"
  color-primary-500: "#0ea5e9"
  color-government-600: "#475569"
semantic:
  primary: primary-500
  text: government-600
  heading: government-700
  border: government-200
  surface: "#ffffff"
  surface-alt: government-50
  success: green-600
  warning: amber-600
  error: red-600
components:
  button-primary: ".btn-primary"
  button-secondary: ".btn-secondary"
  card: ".card"
  input: ".input"
---
```
