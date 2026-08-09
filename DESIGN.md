---
name: Smart Port
version: 1.0.0
description: Government HRIS design system. Sky-blue primary, slate neutral, Thai-first.
theme:
  font-sans: "'Noto Sans Thai', system-ui, sans-serif"
  color-primary-50: "#f0f9ff"
  color-primary-100: "#e0f2fe"
  color-primary-200: "#bae6fd"
  color-primary-300: "#7dd3fc"
  color-primary-400: "#38bdf8"
  color-primary-500: "#0ea5e9"
  color-primary-600: "#0284c7"
  color-primary-700: "#0369a1"
  color-primary-800: "#075985"
  color-primary-900: "#0c4a6e"
  color-primary-950: "#082f49"
  color-government-50: "#f8fafc"
  color-government-100: "#f1f5f9"
  color-government-200: "#e2e8f0"
  color-government-300: "#cbd5e1"
  color-government-400: "#94a3b8"
  color-government-500: "#64748b"
  color-government-600: "#475569"
  color-government-700: "#334155"
  color-government-800: "#1e293b"
  color-government-900: "#0f172a"
semantic-colors:
  primary: primary-500
  neutral: government
  success: green-600
  warning: amber-600
  error: red-600
  info: primary-600
text:
  heading: "text-government-700"
  body: "text-government-600"
  secondary: "text-government-500"
  muted: "text-government-400"
background:
  page: "#ffffff"
  surface: "bg-government-50"
  elevated: "bg-white"
  sidebar: "bg-government-800"
border:
  default: "border-government-200"
  subtle: "border-government-100"
  strong: "border-government-300"
radius:
  card: "rounded-lg"
  control: "rounded-md"
  badge: "rounded-full"
components:
  button-primary: ".btn-primary"
  button-secondary: ".btn-secondary"
  button-outline: ".btn-outline"
  button-ghost: ".btn-ghost"
  card: ".card"
  input: ".input"
  label: ".label"
---

# DESIGN.md — Smart Port

> Design system document for AI agents. Drop this file into your context and generate UI
> that looks like it belongs in Smart Port.

## Product Identity

Smart Port is a government HRIS (Human Resource Information System) for the Office of the
Permanent Secretary, Ministry of Justice (Thailand). Users are HR officers and executives.
The interface must feel **trustworthy, calm, and efficient** — not playful or consumer-like.

- Language: Thai (primary), English (technical labels)
- Font: Noto Sans Thai
- Tone: Formal but approachable, clear hierarchy, data-dense tables are common

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Styling | Tailwind CSS v4 (`@theme` tokens, `@layer components`) |
| Build | Vite |
| State | Pinia |
| Icons | lucide-vue-next |
| No component library | All components are hand-rolled with Tailwind utility classes |

## Color Palette

### Primary (sky/cyan)

Use for interactive elements, links, active states, primary buttons.

| Token | Hex | Usage |
|-------|-----|-------|
| `primary-50` | `#f0f9ff` | Hover backgrounds, selected rows |
| `primary-100` | `#e0f2fe` | Active nav background |
| `primary-200` | `#bae6fd` | Focus rings (light) |
| `primary-300` | `#7dd3fc` | Border accent |
| `primary-400` | `#38bdf8` | Icon accent |
| `primary-500` | `#0ea5e9` | **Primary button bg, links** |
| `primary-600` | `#0284c7` | Primary button hover |
| `primary-700` | `#0369a1` | Primary button active |
| `primary-800` | `#075985` | Dark accent |
| `primary-900` | `#0c4a6e` | Darkest accent |
| `primary-950` | `#082f49` | Extreme dark accent (sidebar hover) |

### Government (slate)

Use for text, borders, backgrounds, secondary elements.

| Token | Hex | Usage |
|-------|-----|-------|
| `government-50` | `#f8fafc` | Page background |
| `government-100` | `#f1f5f9` | Card background alt, table stripe |
| `government-200` | `#e2e8f0` | Borders, dividers, secondary button bg |
| `government-300` | `#cbd5e1` | Disabled borders |
| `government-400` | `#94a3b8` | Placeholder text |
| `government-500` | `#64748b` | Secondary text |
| `government-600` | `#475569` | Body text |
| `government-700` | `#334155` | Headings |
| `government-800` | `#1e293b` | Sidebar bg (dark) |
| `government-900` | `#0f172a` | Darkest text |

### Semantic

| Purpose | Color | Tailwind class |
|---------|-------|----------------|
| Success | Green 500 | `text-green-600`, `bg-green-50` |
| Warning | Amber 500 | `text-amber-600`, `bg-amber-50` |
| Error | Red 500 | `text-red-600`, `bg-red-50`, `border-red-300` |
| Info | Primary 500 | `text-primary-600`, `bg-primary-50` |

### Semantic Aliases (Quick Reference)

Use these intent-based mappings instead of raw palette values:

| Intent | Token | Resolves to |
|--------|-------|-------------|
| Primary action | `primary` | `primary-500` / hover `primary-600` / active `primary-700` |
| Body text | `text` | `government-600` |
| Heading text | `heading` | `government-700` |
| Secondary text | `text-secondary` | `government-500` |
| Muted / placeholder | `text-muted` | `government-400` |
| Page background | `surface` | `#ffffff` |
| Alt surface | `surface-alt` | `government-50` |
| Default border | `border` | `government-200` |
| Sidebar surface | `sidebar` | `government-800` |
| Focus ring | `ring` | `primary-500` |

## Typography

```css
font-family: 'Noto Sans Thai', system-ui, sans-serif;
```

| Element | Size | Weight | Class |
|---------|------|--------|-------|
| Page title | `text-2xl` | `font-bold` | `text-government-800` |
| Section heading | `text-lg` | `font-semibold` | `text-government-700` |
| Body | `text-sm` | `font-normal` | `text-government-600` |
| Table header | `text-xs` | `font-medium` | `text-government-500 uppercase tracking-wide` |
| Table cell | `text-sm` | `font-normal` | `text-government-700` |
| Caption / helper | `text-xs` | `font-normal` | `text-government-400` |
| Stat number | `text-3xl` | `font-bold` | `text-government-800` |

## Spacing & Layout

- Page padding: `p-6` (24px)
- Card padding: `p-6`
- Card gap: `gap-6`
- Section spacing: `space-y-6`
- Sidebar width: `w-64` (256px), fixed left
- Content area: `ml-64` when sidebar open
- Max content width: none (full-width dashboard layout)
- Border radius: `rounded-lg` (cards), `rounded-md` (buttons, inputs)
- Custom spacing tokens: `--spacing-18` (4.5rem / 72px), `--spacing-88` (22rem / 352px)

## Components

### Button

```html
<!-- Primary -->
<button class="btn-primary px-4 py-2">บันทึก</button>
<!-- Secondary -->
<button class="btn-secondary px-4 py-2">ยกเลิก</button>
<!-- Outline -->
<button class="btn-outline px-4 py-2">ดูรายละเอียด</button>
<!-- Ghost -->
<button class="btn-ghost px-4 py-2">ปิด</button>
```

All buttons: `rounded-md text-sm font-medium transition-colors`, focus ring `ring-primary-500`.

### Card

```html
<div class="card">
  <div class="card-header">
    <h3 class="text-lg font-semibold text-government-700">หัวข้อ</h3>
  </div>
  <!-- content -->
</div>
```

### Input

```html
<label class="label">ชื่อ-สกุล</label>
<input class="input" placeholder="กรอกชื่อ" />
<!-- Error state -->
<input class="input input-error" />
```

### Table

- Header: `bg-government-50 text-xs uppercase tracking-wide text-government-500`
- Rows: `border-b border-government-100 hover:bg-primary-50 transition-colors`
- Cells: `px-4 py-3 text-sm`
- Striped (optional): `odd:bg-white even:bg-government-50`

### Table row actions (`จัดการ`)

Use shared component `TableRowActions` for row action columns. Do not invent per-page icon styles.

**Column rules**

- Header label: always `จัดการ` (never `การดำเนินการ`, `ดู`, or `รายละเอียด` as the action column title)
- Align the actions column **right** (`text-right` + `justify-end`)
- Icon order (when present): ดู → แก้ไข → specialty actions → ลบ
- Show only actions that match the page job and the user’s role — do **not** force Eye + Edit + Delete on every table
- Delete always requires confirmation

**When to show which actions**

| Page type | Typical actions |
|-----------|-----------------|
| Read-only / computed lists (candidates, probation, work results, audit) | ดู |
| Master-data CRUD (awards, decorations, multiplier, diverse, supportive) | แก้ไข + ลบ (omit ดู if edit form already shows full detail) |
| Separate view vs edit modes | ดู + แก้ไข (+ ลบ if permitted) |
| Admin specialty (users, approval) | Specialty icons; move into `⋮` when total visible actions ≥ 4 |

**Presentation**

- **1–3 actions:** inline Lucide icon buttons with Thai `title`
- **≥ 4 actions:** vertical kebab `⋮` (`MoreVertical`) + dropdown menu; order same as above; put destructive items last with a separator
- Do **not** use hamburger `☰` for row actions
- Do **not** use horizontal ellipsis `⋯` as the default row-action trigger
- Default icon style: `text-government-400`; hover view/edit = `text-primary-600`; delete = `text-red-600`

### Status Badge

```html
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
  ปฏิบัติงาน
</span>
```

### Sidebar Navigation

- Background: `bg-government-800` (dark)
- Active item: `bg-primary-600 text-white rounded-md`
- Inactive: `text-government-300 hover:bg-government-700 hover:text-white`
- Icon + text layout, `text-sm`

### Stat Card (Dashboard)

```html
<div class="card elevation-1">
  <div class="flex items-center justify-between">
    <div>
      <p class="text-sm text-government-500">label</p>
      <p class="text-3xl font-bold text-government-800">value</p>
    </div>
    <div class="p-3 rounded-lg bg-primary-50 text-primary-500">
      <Icon />
    </div>
  </div>
</div>
```

## Elevation & Shadows

| Level | Class | Usage |
|-------|-------|-------|
| 1 | `elevation-1` (shadow-sm, hover:shadow) | Cards, stat cards |
| 2 | `elevation-2` (shadow, hover:shadow-md) | Dropdowns, popovers |
| 3 | `elevation-3` (shadow-md, hover:shadow-lg) | Modals |

## Animations

| Token | Duration | Usage |
|-------|----------|-------|
| `animate-fade-in` | 0.5s ease-in-out | Page transitions |
| `animate-slide-up` | 0.3s ease-out | Cards entering viewport |
| `animate-bounce-subtle` | 1s infinite | Notification badges |

Keep animations subtle. Government users prefer efficiency over delight.

**Reduced motion:** All animations must be gated behind `prefers-reduced-motion`. When the
user has reduced motion enabled, disable `animate-fade-in`, `animate-slide-up`, and
`animate-bounce-subtle` — show content immediately without transition.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Dark Mode (Sidebar Only)

The sidebar uses a dark theme (`bg-government-800`). The main content area is always light.
Do not implement full dark mode — only the sidebar is dark.

## Accessibility

- Focus ring: `focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2`
- Minimum touch target: 44px (buttons have `py-2` + `text-sm`)
- Color contrast: all text meets WCAG AA against its background
- Thai text: never use `uppercase` on Thai content (only on English table headers)

## Voice & Content

- ใช้ภาษาไทยสำหรับ label, button, heading, error message ทั้งหมด
- ใช้ภาษาอังกฤษได้เฉพาะ technical terms ที่ไม่มีคำไทย (API, token, upload)
- Button: กริยา + กรรม — `บันทึก`, `ลบรายการ`, `เพิ่มข้าราชการ`
- Error: บอกสิ่งที่เกิด + สิ่งที่ต้องทำ — `ไม่พบข้อมูล ลองค้นหาด้วยชื่อหรือรหัส`
- Toast: ระบุสิ่งที่เปลี่ยน — `บันทึกรางวัลแล้ว` (ไม่มี "สำเร็จ" ต่อท้าย)
- Empty state: ชี้ไปที่ action แรก — `ยังไม่มีข้อมูล กด "เพิ่ม" เพื่อเริ่ม`
- In-progress: ใช้ "กำลัง..." — `กำลังบันทึก…`
- ไม่ต้องใส่ "กรุณา" ในทุกข้อความ — ใช้เมื่อเป็นคำขอที่ทำลายข้อมูล (`กรุณายืนยันการลบ`)

## Do / Don't

| Do | Don't |
|----|-------|
| Use `text-sm` as default body size | Use `text-base` or larger for body |
| Use government slate for text | Use pure black `#000` for text |
| Use `primary-500` for all interactive elements | Introduce new accent colors |
| Keep tables dense (`px-4 py-3`) | Add excessive padding to tables |
| Use Thai labels for user-facing text | Use English labels for domain concepts |
| Use `rounded-md` / `rounded-lg` | Use `rounded-full` on buttons or cards |
| Use subtle shadows (elevation-1) | Use heavy drop shadows |
| Left-align table content; right-align the `จัดการ` column | Center-align table cells (except stat numbers) |
| Use `TableRowActions` for row icons / `⋮` menus | Mix Eye-only / Edit-Delete styles or hamburger menus per page |
| Show only role-appropriate row actions | Show disabled actions the user cannot perform |

## File Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Page component | `*Page.vue` | `RetirementReportPage.vue` |
| Reusable component | `PascalCase.vue` | `StatusBadge.vue` |
| Composable | `use*.js` | `useRetirement.js` |
| Store | `use*Store.js` | `useAuthStore.js` |
| Test | `*.test.js` | `useRetirement.test.js` |
