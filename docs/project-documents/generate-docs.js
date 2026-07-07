const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, TabStopType, TabStopPosition
} = require('docx');

// ─── Constants ───────────────────────────────────────────────────────
const FONT = 'TH SarabunPSK';
const FONT_FALLBACK = 'Cordia New';
const COLOR_PRIMARY = '1B3A5C';
const COLOR_ACCENT = '2E75B6';
const COLOR_HEADER_BG = 'D5E8F0';
const COLOR_ROW_ALT = 'F2F7FB';
const COLOR_GREEN = '27AE60';
const COLOR_ORANGE = 'E67E22';
const COLOR_GRAY = '95A5A6';

const PAGE_WIDTH = 11906; // A4
const PAGE_HEIGHT = 16838;
const MARGIN = 1440;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 9026

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0 };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

// ─── Helpers ─────────────────────────────────────────────────────────
function txt(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: opts.size || 32, ...opts });
}

function para(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [txt(text, {
      bold: true,
      size: level === HeadingLevel.HEADING_1 ? 40 : level === HeadingLevel.HEADING_2 ? 36 : 32,
      color: COLOR_PRIMARY
    })]
  });
}

function emptyLine() {
  return para([txt('')]);
}

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: COLOR_PRIMARY, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: 'center',
    children: [para([txt(text, { bold: true, color: 'FFFFFF', size: 30 })], { alignment: AlignmentType.CENTER })]
  });
}

function dataCell(text, width, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [para([txt(text, { size: 30, ...opts.textOpts })], { alignment: opts.align || AlignmentType.LEFT })]
  });
}

function statusCell(text, width, color, bgColor) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: bgColor ? { fill: bgColor, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [para([txt(text, { size: 30, bold: true, color })], { alignment: AlignmentType.CENTER })]
  });
}

// ─── Common styles ───────────────────────────────────────────────────
const commonStyles = {
  default: {
    document: {
      run: { font: FONT, size: 32 }
    }
  },
  paragraphStyles: [
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 40, bold: true, font: FONT, color: COLOR_PRIMARY },
      paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 36, bold: true, font: FONT, color: COLOR_PRIMARY },
      paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 }
    },
    {
      id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 32, bold: true, font: FONT, color: COLOR_ACCENT },
      paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 }
    },
  ]
};

const numbering = {
  config: [
    {
      reference: 'bullets',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } }
      }]
    },
    {
      reference: 'bullets2',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '\u2013', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } }
      }]
    },
    {
      reference: 'numbers',
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } }
      }]
    },
  ]
};

function bullet(text, ref = 'bullets') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [txt(text, { size: 30 })],
    spacing: { after: 60 }
  });
}

function makeHeader(title) {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT, space: 1 } },
        children: [txt(title, { size: 20, color: COLOR_ACCENT, italics: true })]
      })
    ]
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
        children: [
          txt('\u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E21\u0E38\u0E14\u0E1E\u0E01 Smart Port \u2014 ', { size: 18, color: '999999' }),
          txt('\u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E1B\u0E25\u0E31\u0E14\u0E01\u0E23\u0E30\u0E17\u0E23\u0E27\u0E07\u0E22\u0E38\u0E15\u0E34\u0E18\u0E23\u0E23\u0E21', { size: 18, color: '999999' }),
          txt('  |  \u0E2B\u0E19\u0E49\u0E32 ', { size: 18, color: '999999' }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: '999999' }),
        ]
      })
    ]
  });
}

function coverPage(title, subtitle, date) {
  return [
    emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR_ACCENT, space: 8 } },
      children: [txt(title, { size: 56, bold: true, color: COLOR_PRIMARY })]
    }),
    emptyLine(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [txt(subtitle, { size: 36, color: COLOR_ACCENT })]
    }),
    emptyLine(), emptyLine(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [txt('\u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E21\u0E38\u0E14\u0E1E\u0E01 Smart Port', { size: 32, color: '666666' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [txt('\u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E1B\u0E25\u0E31\u0E14\u0E01\u0E23\u0E30\u0E17\u0E23\u0E27\u0E07\u0E22\u0E38\u0E15\u0E34\u0E18\u0E23\u0E23\u0E21', { size: 32, color: '666666' })]
    }),
    emptyLine(), emptyLine(), emptyLine(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [txt(date, { size: 28, color: '999999' })]
    }),
    new Paragraph({ children: [new PageBreak()] })
  ];
}


// ═══════════════════════════════════════════════════════════════════════
// DOCUMENT 1: Executive Summary
// ═══════════════════════════════════════════════════════════════════════
function createExecutiveSummary() {
  const children = [
    ...coverPage(
      '\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E2A\u0E23\u0E38\u0E1B\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23',
      'Executive Summary',
      '\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 26 \u0E21\u0E35\u0E19\u0E32\u0E04\u0E21 2569'
    ),

    // 1. Overview
    heading('\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23'),
    para([txt('Smart Port \u0E40\u0E1B\u0E47\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E07\u0E32\u0E19\u0E1A\u0E38\u0E04\u0E04\u0E25 (HRIS) \u0E17\u0E35\u0E48\u0E1E\u0E31\u0E12\u0E19\u0E32\u0E02\u0E36\u0E49\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E07\u0E32\u0E19\u0E1A\u0E38\u0E04\u0E04\u0E25\u0E02\u0E2D\u0E07\u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E1B\u0E25\u0E31\u0E14\u0E01\u0E23\u0E30\u0E17\u0E23\u0E27\u0E07\u0E22\u0E38\u0E15\u0E34\u0E18\u0E23\u0E23\u0E21 \u0E42\u0E14\u0E22\u0E04\u0E23\u0E2D\u0E1A\u0E04\u0E25\u0E38\u0E21\u0E01\u0E32\u0E23\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E23\u0E32\u0E22\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E21\u0E35\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E23\u0E30\u0E14\u0E31\u0E1A (Candidate List), \u0E01\u0E32\u0E23\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23 (Probation Tracking), \u0E01\u0E32\u0E23\u0E19\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 \u0E41\u0E25\u0E30 Dashboard \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23', { size: 30 })]),
    emptyLine(),

    // Core Value box
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      rows: [new TableRow({
        children: [new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT }, bottom: border, left: border, right: border },
          shading: { fill: 'EBF5FB', type: ShadingType.CLEAR },
          margins: { top: 120, bottom: 120, left: 200, right: 200 },
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          children: [
            para([txt('Core Value', { bold: true, size: 32, color: COLOR_ACCENT })]),
            para([txt('HR \u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E39\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E21\u0E35\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E44\u0E14\u0E49\u0E41\u0E1A\u0E1A real-time \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E04\u0E33\u0E19\u0E27\u0E13\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 \u0E41\u0E25\u0E30\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23\u0E02\u0E2D\u0E07\u0E02\u0E49\u0E32\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23\u0E1A\u0E23\u0E23\u0E08\u0E38\u0E43\u0E2B\u0E21\u0E48\u0E44\u0E14\u0E49\u0E17\u0E31\u0E19\u0E17\u0E48\u0E27\u0E07\u0E17\u0E35', { size: 30 })])
          ]
        })]
      })]
    }),
    emptyLine(),

    // 2. Tech Stack
    heading('\u0E40\u0E17\u0E04\u0E42\u0E19\u0E42\u0E25\u0E22\u0E35\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49'),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [2500, 3263, 3263],
      rows: [
        new TableRow({ children: [headerCell('\u0E2A\u0E48\u0E27\u0E19', 2500), headerCell('\u0E40\u0E17\u0E04\u0E42\u0E19\u0E42\u0E25\u0E22\u0E35', 3263), headerCell('\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19', 3263)] }),
        new TableRow({ children: [dataCell('Frontend', 2500), dataCell('Vue 3 + Vite + Tailwind CSS 4', 3263), dataCell('Vue 3.5, Vite 6.0, Tailwind 4.1', 3263)] }),
        new TableRow({ children: [dataCell('Backend', 2500, { shading: COLOR_ROW_ALT }), dataCell('PHP 8.3 REST API', 3263, { shading: COLOR_ROW_ALT }), dataCell('PHP 8.3-Apache', 3263, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('Database', 2500), dataCell('MySQL 8.0 / TiDB Cloud', 3263), dataCell('MySQL 8.0, utf8mb4', 3263)] }),
        new TableRow({ children: [dataCell('Authentication', 2500, { shading: COLOR_ROW_ALT }), dataCell('JWT (HMAC-SHA256)', 3263, { shading: COLOR_ROW_ALT }), dataCell('firebase/php-jwt 6.0', 3263, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('Deployment', 2500), dataCell('Docker + Render.com', 3263), dataCell('Multi-stage builds', 3263)] }),
        new TableRow({ children: [dataCell('State Management', 2500, { shading: COLOR_ROW_ALT }), dataCell('Pinia', 3263, { shading: COLOR_ROW_ALT }), dataCell('Pinia 3.0', 3263, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('Charts', 2500), dataCell('Chart.js + vue-chartjs', 3263), dataCell('Chart.js 4.4', 3263)] }),
      ]
    }),
    emptyLine(),

    // 3. Features Summary
    heading('\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C\u0E2B\u0E25\u0E31\u0E01\u0E02\u0E2D\u0E07\u0E23\u0E30\u0E1A\u0E1A'),
    para([txt('\u0E23\u0E30\u0E1A\u0E1A Smart Port \u0E1B\u0E23\u0E30\u0E01\u0E2D\u0E1A\u0E14\u0E49\u0E27\u0E22\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C\u0E2B\u0E25\u0E31\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14 12 \u0E42\u0E21\u0E14\u0E39\u0E25 \u0E41\u0E1A\u0E48\u0E07\u0E40\u0E1B\u0E47\u0E19 10 \u0E40\u0E1F\u0E2A\u0E01\u0E32\u0E23\u0E1E\u0E31\u0E12\u0E19\u0E32:', { size: 30 })]),
    emptyLine(),

    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [500, 3500, 5026],
      rows: [
        new TableRow({ children: [headerCell('#', 500), headerCell('\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C', 3500), headerCell('\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14', 5026)] }),
        new TableRow({ children: [dataCell('1', 500, { align: AlignmentType.CENTER }), dataCell('Executive Dashboard', 3500), dataCell('\u0E41\u0E14\u0E0A\u0E1A\u0E2D\u0E23\u0E4C\u0E14\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E2A\u0E39\u0E07', 5026)] }),
        new TableRow({ children: [dataCell('2', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('Dashboard', 3500, { shading: COLOR_ROW_ALT }), dataCell('\u0E2A\u0E23\u0E38\u0E1B\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E1A\u0E38\u0E04\u0E25\u0E32\u0E01\u0E23, \u0E2A\u0E16\u0E34\u0E15\u0E34\u0E2A\u0E33\u0E04\u0E31\u0E0D', 5026, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('3', 500, { align: AlignmentType.CENTER }), dataCell('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E49\u0E32\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23', 3500), dataCell('\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27, \u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07, \u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19, \u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32, \u0E2D\u0E1A\u0E23\u0E21, \u0E27\u0E34\u0E19\u0E31\u0E22', 5026)] }),
        new TableRow({ children: [dataCell('4', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23', 3500, { shading: COLOR_ROW_ALT }), dataCell('\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E02\u0E49\u0E32\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23\u0E1A\u0E23\u0E23\u0E08\u0E38\u0E43\u0E2B\u0E21\u0E48, \u0E04\u0E33\u0E19\u0E27\u0E13\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14', 5026, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('5', 500, { align: AlignmentType.CENTER }), dataCell('Candidate Lists', 3500), dataCell('\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E21\u0E35\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E23\u0E30\u0E14\u0E31\u0E1A (\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B, \u0E27\u0E34\u0E0A\u0E32\u0E01\u0E32\u0E23, \u0E2D\u0E33\u0E19\u0E27\u0E22\u0E01\u0E32\u0E23, \u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23)', 5026)] }),
        new TableRow({ children: [dataCell('6', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('\u0E01\u0E32\u0E23\u0E19\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21', 3500, { shading: COLOR_ROW_ALT }), dataCell('\u0E19\u0E31\u0E1A\u0E40\u0E01\u0E37\u0E49\u0E2D\u0E01\u0E39\u0E25, \u0E19\u0E31\u0E1A\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07, \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07', 5026, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('7', 500, { align: AlignmentType.CENTER }), dataCell('\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E23\u0E32\u0E0A\u0E2D\u0E34\u0E2A\u0E23\u0E34\u0E22\u0E32\u0E20\u0E23\u0E13\u0E4C', 3500), dataCell('\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E23\u0E32\u0E0A', 5026)] }),
        new TableRow({ children: [dataCell('8', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1C\u0E39\u0E49\u0E40\u0E01\u0E29\u0E35\u0E22\u0E13', 3500, { shading: COLOR_ROW_ALT }), dataCell('\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1C\u0E39\u0E49\u0E40\u0E01\u0E29\u0E35\u0E22\u0E13\u0E2D\u0E32\u0E22\u0E38\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23', 5026, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('9', 500, { align: AlignmentType.CENTER }), dataCell('\u0E01\u0E32\u0E23\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E07\u0E32\u0E19', 3500), dataCell('Task Management + WFH, \u0E1C\u0E25\u0E07\u0E32\u0E19\u0E41\u0E25\u0E30\u0E02\u0E49\u0E2D\u0E40\u0E2A\u0E19\u0E2D', 5026)] }),
        new TableRow({ children: [dataCell('10', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('KM & SOP', 3500, { shading: COLOR_ROW_ALT }), dataCell('\u0E01\u0E32\u0E23\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E04\u0E27\u0E32\u0E21\u0E23\u0E39\u0E49\u0E41\u0E25\u0E30\u0E21\u0E32\u0E15\u0E23\u0E10\u0E32\u0E19\u0E01\u0E32\u0E23\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E07\u0E32\u0E19', 5026, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('11', 500, { align: AlignmentType.CENTER }), dataCell('\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E14\u0E35\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E2D\u0E1A', 3500), dataCell('\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E41\u0E25\u0E30\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25', 5026)] }),
        new TableRow({ children: [dataCell('12', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('AI Integration', 3500, { shading: COLOR_ROW_ALT }), dataCell('Agentic RAG, AI Assistant \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E0A\u0E48\u0E27\u0E22\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E07\u0E32\u0E19', 5026, { shading: COLOR_ROW_ALT })] }),
      ]
    }),
    emptyLine(),

    // 4. Current Status
    heading('\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19'),
    para([txt('\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07 Phase 1-2 \u0E42\u0E14\u0E22\u0E21\u0E35\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E44\u0E14\u0E49\u0E41\u0E25\u0E49\u0E27 10 \u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C:', { size: 30 })]),
    bullet('Dashboard \u0E2A\u0E23\u0E38\u0E1B\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E1A\u0E38\u0E04\u0E25\u0E32\u0E01\u0E23'),
    bullet('Candidate Lists \u0E23\u0E30\u0E14\u0E31\u0E1A\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B (K2, K3, K4) \u0E41\u0E25\u0E30\u0E27\u0E34\u0E0A\u0E32\u0E01\u0E32\u0E23 (O2, O3)'),
    bullet('\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23 \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E04\u0E33\u0E19\u0E27\u0E13\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14'),
    bullet('\u0E01\u0E32\u0E23\u0E19\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 (\u0E19\u0E31\u0E1A\u0E40\u0E01\u0E37\u0E49\u0E2D\u0E01\u0E39\u0E25, \u0E19\u0E31\u0E1A\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07, \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07)'),
    bullet('\u0E23\u0E30\u0E1A\u0E1A Authentication \u0E41\u0E25\u0E30\u0E01\u0E32\u0E23\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E'),
    emptyLine(),

    // 5. Benefits
    heading('\u0E1B\u0E23\u0E30\u0E42\u0E22\u0E0A\u0E19\u0E4C\u0E17\u0E35\u0E48\u0E04\u0E32\u0E14\u0E27\u0E48\u0E32\u0E08\u0E30\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A'),
    bullet('\u0E25\u0E14\u0E40\u0E27\u0E25\u0E32\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E1C\u0E39\u0E49\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E08\u0E32\u0E01\u0E2B\u0E25\u0E32\u0E22\u0E27\u0E31\u0E19\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E44\u0E21\u0E48\u0E01\u0E35\u0E48\u0E19\u0E32\u0E17\u0E35'),
    bullet('\u0E04\u0E33\u0E19\u0E27\u0E13\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 \u0E25\u0E14\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14\u0E08\u0E32\u0E01\u0E01\u0E32\u0E23\u0E04\u0E33\u0E19\u0E27\u0E13\u0E14\u0E49\u0E27\u0E22\u0E21\u0E37\u0E2D'),
    bullet('\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E44\u0E14\u0E49\u0E41\u0E1A\u0E1A real-time \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E2B\u0E23\u0E37\u0E2D\u0E42\u0E17\u0E23\u0E28\u0E31\u0E1E\u0E17\u0E4C'),
    bullet('\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E42\u0E22\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E31\u0E1A\u0E23\u0E30\u0E1A\u0E1A DPIS \u0E41\u0E25\u0E30\u0E23\u0E30\u0E1A\u0E1A\u0E2D\u0E37\u0E48\u0E19\u0E46 \u0E43\u0E19\u0E2D\u0E19\u0E32\u0E04\u0E15'),
    bullet('\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 AI \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E0A\u0E48\u0E27\u0E22\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E41\u0E25\u0E30\u0E15\u0E31\u0E14\u0E2A\u0E34\u0E19\u0E43\u0E08'),
    emptyLine(),

    // 6. Database Stats
    heading('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E0A\u0E34\u0E07\u0E2A\u0E16\u0E34\u0E15\u0E34'),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [4513, 4513],
      rows: [
        new TableRow({ children: [headerCell('\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23', 4513), headerCell('\u0E08\u0E33\u0E19\u0E27\u0E19', 4513)] }),
        new TableRow({ children: [dataCell('\u0E15\u0E32\u0E23\u0E32\u0E07\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25', 4513), dataCell('45+ \u0E15\u0E32\u0E23\u0E32\u0E07', 4513)] }),
        new TableRow({ children: [dataCell('Database Views', 4513, { shading: COLOR_ROW_ALT }), dataCell('4 views', 4513, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('API Endpoints', 4513), dataCell('30+ endpoints', 4513)] }),
        new TableRow({ children: [dataCell('\u0E2B\u0E19\u0E49\u0E32\u0E08\u0E2D (Pages)', 4513, { shading: COLOR_ROW_ALT }), dataCell('8 \u0E2B\u0E19\u0E49\u0E32 (6 \u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E44\u0E14\u0E49 + 2 \u0E01\u0E33\u0E25\u0E31\u0E07\u0E1E\u0E31\u0E12\u0E19\u0E32)', 4513, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('Vue Components', 4513), dataCell('8 components', 4513)] }),
        new TableRow({ children: [dataCell('Composables', 4513, { shading: COLOR_ROW_ALT }), dataCell('7 composables', 4513, { shading: COLOR_ROW_ALT })] }),
      ]
    }),
  ];

  return { children, headerText: '\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E2A\u0E23\u0E38\u0E1B\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23 \u2014 \u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E21\u0E38\u0E14\u0E1E\u0E01 Smart Port' };
}


// ═══════════════════════════════════════════════════════════════════════
// DOCUMENT 2: Development Roadmap
// ═══════════════════════════════════════════════════════════════════════
function createRoadmap() {
  const phases = [
    {
      name: 'Phase 1',
      title: '\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23 + Candidate Lists (\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B, \u0E27\u0E34\u0E0A\u0E32\u0E01\u0E32\u0E23) + \u0E19\u0E31\u0E1A\u0E40\u0E01\u0E37\u0E49\u0E2D\u0E01\u0E39\u0E25',
      status: '\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E41\u0E25\u0E49\u0E27',
      statusColor: COLOR_GREEN,
      details: [
        '\u0E23\u0E30\u0E1A\u0E1A\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23 \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E04\u0E33\u0E19\u0E27\u0E13\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34',
        '\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E21\u0E35\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E2A\u0E32\u0E22\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B (K2, K3, K4) \u0E41\u0E25\u0E30\u0E2A\u0E32\u0E22\u0E27\u0E34\u0E0A\u0E32\u0E01\u0E32\u0E23 (O2, O3)',
        '\u0E01\u0E32\u0E23\u0E19\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 \u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E19\u0E31\u0E1A\u0E40\u0E01\u0E37\u0E49\u0E2D\u0E01\u0E39\u0E25',
        'Overview Dashboard \u0E41\u0E2A\u0E14\u0E07\u0E2A\u0E23\u0E38\u0E1B\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21'
      ]
    },
    {
      name: 'Phase 2',
      title: 'Candidate Lists (\u0E2D\u0E33\u0E19\u0E27\u0E22\u0E01\u0E32\u0E23, \u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23) + \u0E19\u0E31\u0E1A\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07 + \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07',
      status: '\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E41\u0E25\u0E49\u0E27',
      statusColor: COLOR_GREEN,
      details: [
        '\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E21\u0E35\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E2A\u0E32\u0E22\u0E2D\u0E33\u0E19\u0E27\u0E22\u0E01\u0E32\u0E23\u0E41\u0E25\u0E30\u0E2A\u0E32\u0E22\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23',
        '\u0E01\u0E32\u0E23\u0E19\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 \u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E19\u0E31\u0E1A\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07\u0E41\u0E25\u0E30\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07',
        'Approval Workflow \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07 (PENDING \u2192 APPROVED/REJECTED)'
      ]
    },
    {
      name: 'Phase 3',
      title: 'Executive Dashboard',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E2A\u0E39\u0E07 \u0E23\u0E30\u0E14\u0E31\u0E1A\u0E15\u0E49\u0E19 \u0E01\u0E23\u0E30\u0E17\u0E23\u0E27\u0E07\u0E22\u0E38\u0E15\u0E34\u0E18\u0E23\u0E23\u0E21',
        '\u0E2D\u0E33\u0E19\u0E27\u0E22\u0E01\u0E32\u0E23\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E2A\u0E39\u0E07/\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E15\u0E49\u0E19 \u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E23\u0E31\u0E10\u0E21\u0E19\u0E15\u0E23\u0E35 \u0E01\u0E23\u0E30\u0E17\u0E23\u0E27\u0E07\u0E22\u0E38\u0E15\u0E34\u0E18\u0E23\u0E23\u0E21 \u0E41\u0E25\u0E30\u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E1B\u0E25\u0E31\u0E14\u0E01\u0E23\u0E30\u0E17\u0E23\u0E27\u0E07\u0E22\u0E38\u0E15\u0E34\u0E18\u0E23\u0E23\u0E21',
        'Data Visualization \u0E14\u0E49\u0E27\u0E22 Chart.js'
      ]
    },
    {
      name: 'Phase 4',
      title: '\u0E23\u0E30\u0E1A\u0E1A\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B \u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A Career Path',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        '\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E41\u0E04\u0E19\u0E14\u0E34\u0E40\u0E14\u0E17\u0E25\u0E34\u0E2A\u0E17\u0E4C\u0E02\u0E2D\u0E07\u0E15\u0E19\u0E40\u0E2D\u0E07',
        '\u0E41\u0E2A\u0E14\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 Career Path \u0E2A\u0E48\u0E27\u0E19\u0E1A\u0E38\u0E04\u0E04\u0E25',
        'Self-service \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E32\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23'
      ]
    },
    {
      name: 'Phase 5',
      title: '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E49\u0E32\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23\u0E04\u0E23\u0E1A\u0E27\u0E07\u0E08\u0E23',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        '\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B, \u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07, \u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E40\u0E07\u0E34\u0E19\u0E40\u0E14\u0E37\u0E2D\u0E19',
        '\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32, \u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E2D\u0E1A\u0E23\u0E21',
        '\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E23\u0E32\u0E0A\u0E2D\u0E34\u0E2A\u0E23\u0E34\u0E22\u0E32\u0E20\u0E23\u0E13\u0E4C, \u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E27\u0E34\u0E19\u0E31\u0E22'
      ]
    },
    {
      name: 'Phase 6',
      title: '\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1C\u0E39\u0E49\u0E40\u0E01\u0E29\u0E35\u0E22\u0E13',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        '\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1C\u0E39\u0E49\u0E40\u0E01\u0E29\u0E35\u0E22\u0E13\u0E2D\u0E32\u0E22\u0E38\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23',
        '\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E25\u0E30\u0E27\u0E32\u0E07\u0E41\u0E1C\u0E19\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E01\u0E33\u0E25\u0E31\u0E07'
      ]
    },
    {
      name: 'Phase 7',
      title: '\u0E01\u0E32\u0E23\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E07\u0E32\u0E19 + WFH + \u0E1C\u0E25\u0E07\u0E32\u0E19\u0E41\u0E25\u0E30\u0E02\u0E49\u0E2D\u0E40\u0E2A\u0E19\u0E2D',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        'Task Management \u0E23\u0E30\u0E1A\u0E1A\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E07\u0E32\u0E19\u0E41\u0E25\u0E30\u0E21\u0E2D\u0E1A\u0E2B\u0E21\u0E32\u0E22\u0E07\u0E32\u0E19',
        '\u0E23\u0E30\u0E1A\u0E1A Work From Home',
        '\u0E1C\u0E25\u0E07\u0E32\u0E19\u0E41\u0E25\u0E30\u0E02\u0E49\u0E2D\u0E40\u0E2A\u0E19\u0E2D\u0E41\u0E19\u0E27\u0E04\u0E34\u0E14'
      ]
    },
    {
      name: 'Phase 8',
      title: 'KM & SOP',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        '\u0E23\u0E30\u0E1A\u0E1A\u0E01\u0E32\u0E23\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E04\u0E27\u0E32\u0E21\u0E23\u0E39\u0E49 (Knowledge Management)',
        '\u0E21\u0E32\u0E15\u0E23\u0E10\u0E32\u0E19\u0E01\u0E32\u0E23\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E07\u0E32\u0E19 (Standard Operating Procedure)'
      ]
    },
    {
      name: 'Phase 9',
      title: '\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E14\u0E35\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E2D\u0E1A',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        '\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E41\u0E25\u0E30\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25\u0E02\u0E49\u0E32\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23',
        '\u0E01\u0E32\u0E23\u0E1B\u0E23\u0E30\u0E40\u0E21\u0E34\u0E19\u0E04\u0E27\u0E32\u0E21\u0E14\u0E35\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E2D\u0E1A'
      ]
    },
    {
      name: 'Phase 10',
      title: 'AI Integration',
      status: '\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21',
      statusColor: COLOR_ORANGE,
      details: [
        'Integrate AI into key areas',
        '\u0E2A\u0E23\u0E49\u0E32\u0E07 skills.md, Agent \u0E2B\u0E23\u0E37\u0E2D Agentic RAG',
        'AI Assistant \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E40\u0E1B\u0E47\u0E19\u0E1C\u0E39\u0E49\u0E0A\u0E48\u0E27\u0E22\u0E43\u0E19\u0E01\u0E32\u0E23\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E07\u0E32\u0E19'
      ]
    }
  ];

  const children = [
    ...coverPage(
      '\u0E41\u0E1C\u0E19\u0E01\u0E32\u0E23\u0E1E\u0E31\u0E12\u0E19\u0E32',
      'Development Roadmap',
      '\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 26 \u0E21\u0E35\u0E19\u0E32\u0E04\u0E21 2569'
    ),

    heading('\u0E20\u0E32\u0E1E\u0E23\u0E27\u0E21\u0E41\u0E1C\u0E19\u0E01\u0E32\u0E23\u0E1E\u0E31\u0E12\u0E19\u0E32'),
    para([txt('\u0E23\u0E30\u0E1A\u0E1A Smart Port \u0E41\u0E1A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E1E\u0E31\u0E12\u0E19\u0E32\u0E2D\u0E2D\u0E01\u0E40\u0E1B\u0E47\u0E19 10 \u0E40\u0E1F\u0E2A \u0E42\u0E14\u0E22\u0E40\u0E23\u0E34\u0E48\u0E21\u0E08\u0E32\u0E01\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C\u0E2B\u0E25\u0E31\u0E01\u0E17\u0E35\u0E48\u0E2A\u0E33\u0E04\u0E31\u0E0D\u0E17\u0E35\u0E48\u0E2A\u0E38\u0E14\u0E01\u0E48\u0E2D\u0E19 \u0E41\u0E25\u0E30\u0E02\u0E22\u0E32\u0E22\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C\u0E40\u0E2A\u0E23\u0E34\u0E21\u0E15\u0E48\u0E32\u0E07\u0E46 \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E07\u0E32\u0E19\u0E1A\u0E38\u0E04\u0E04\u0E25\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E04\u0E23\u0E1A\u0E27\u0E07\u0E08\u0E23:', { size: 30 })]),
    emptyLine(),
  ];

  // Phase detail sections
  phases.forEach((phase, i) => {
    const bgColor = phase.statusColor === COLOR_GREEN ? 'E8F8F0' : 'FEF5E7';
    children.push(
      // Phase header
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [1500, 6026, 1500],
        rows: [new TableRow({
          children: [
            new TableCell({
              borders, margins: cellMargins,
              width: { size: 1500, type: WidthType.DXA },
              shading: { fill: COLOR_PRIMARY, type: ShadingType.CLEAR },
              verticalAlign: 'center',
              children: [para([txt(phase.name, { bold: true, color: 'FFFFFF', size: 28 })], { alignment: AlignmentType.CENTER })]
            }),
            new TableCell({
              borders, margins: cellMargins,
              width: { size: 6026, type: WidthType.DXA },
              shading: { fill: bgColor, type: ShadingType.CLEAR },
              children: [para([txt(phase.title, { bold: true, size: 30, color: COLOR_PRIMARY })])]
            }),
            statusCell(phase.status, 1500, phase.statusColor, bgColor)
          ]
        })]
      })
    );

    // Details
    phase.details.forEach(detail => {
      children.push(bullet(detail));
    });
    children.push(emptyLine());
  });

  // Note
  children.push(
    heading('\u0E2B\u0E21\u0E32\u0E22\u0E40\u0E2B\u0E15\u0E38', HeadingLevel.HEADING_2),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      rows: [new TableRow({
        children: [new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 6, color: 'E74C3C' }, bottom: border, left: border, right: border },
          shading: { fill: 'FDEDEC', type: ShadingType.CLEAR },
          margins: { top: 120, bottom: 120, left: 200, right: 200 },
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          children: [
            para([txt('\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E44\u0E21\u0E40\u0E01\u0E23\u0E17\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 \u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E42\u0E22\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E31\u0E1A\u0E23\u0E30\u0E1A\u0E1A DPIS \u0E41\u0E25\u0E30\u0E23\u0E30\u0E1A\u0E1A\u0E2D\u0E37\u0E48\u0E19\u0E46 \u0E43\u0E19\u0E2D\u0E19\u0E32\u0E04\u0E15', { size: 30, bold: true, color: 'C0392B' })])
          ]
        })]
      })]
    })
  );

  return { children, headerText: '\u0E41\u0E1C\u0E19\u0E01\u0E32\u0E23\u0E1E\u0E31\u0E12\u0E19\u0E32 \u2014 \u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E21\u0E38\u0E14\u0E1E\u0E01 Smart Port' };
}


// ═══════════════════════════════════════════════════════════════════════
// DOCUMENT 3: Progress Report
// ═══════════════════════════════════════════════════════════════════════
function createProgressReport() {
  const children = [
    ...coverPage(
      '\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E04\u0E27\u0E32\u0E21\u0E01\u0E49\u0E32\u0E27\u0E2B\u0E19\u0E49\u0E32',
      'Progress Report',
      '\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 26 \u0E21\u0E35\u0E19\u0E32\u0E04\u0E21 2569'
    ),

    // 1. Status Summary
    heading('\u0E2A\u0E23\u0E38\u0E1B\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E42\u0E04\u0E23\u0E07\u0E01\u0E32\u0E23'),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [3008, 3009, 3009],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders, margins: { top: 100, bottom: 100, left: 150, right: 150 },
              width: { size: 3008, type: WidthType.DXA },
              shading: { fill: 'E8F8F0', type: ShadingType.CLEAR },
              children: [
                para([txt('\u0E40\u0E1F\u0E2A\u0E17\u0E35\u0E48\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27', { size: 28, color: '666666' })], { alignment: AlignmentType.CENTER }),
                para([txt('2', { size: 56, bold: true, color: COLOR_GREEN })], { alignment: AlignmentType.CENTER }),
                para([txt('Phase 1 + 2', { size: 24, color: '999999' })], { alignment: AlignmentType.CENTER })
              ]
            }),
            new TableCell({
              borders, margins: { top: 100, bottom: 100, left: 150, right: 150 },
              width: { size: 3009, type: WidthType.DXA },
              shading: { fill: 'FEF5E7', type: ShadingType.CLEAR },
              children: [
                para([txt('\u0E40\u0E1F\u0E2A\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E25\u0E37\u0E2D', { size: 28, color: '666666' })], { alignment: AlignmentType.CENTER }),
                para([txt('8', { size: 56, bold: true, color: COLOR_ORANGE })], { alignment: AlignmentType.CENTER }),
                para([txt('Phase 3 \u2013 10', { size: 24, color: '999999' })], { alignment: AlignmentType.CENTER })
              ]
            }),
            new TableCell({
              borders, margins: { top: 100, bottom: 100, left: 150, right: 150 },
              width: { size: 3009, type: WidthType.DXA },
              shading: { fill: 'EBF5FB', type: ShadingType.CLEAR },
              children: [
                para([txt('\u0E04\u0E27\u0E32\u0E21\u0E01\u0E49\u0E32\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E23\u0E27\u0E21', { size: 28, color: '666666' })], { alignment: AlignmentType.CENTER }),
                para([txt('20%', { size: 56, bold: true, color: COLOR_ACCENT })], { alignment: AlignmentType.CENTER }),
                para([txt('2 / 10 \u0E40\u0E1F\u0E2A', { size: 24, color: '999999' })], { alignment: AlignmentType.CENTER })
              ]
            }),
          ]
        })
      ]
    }),
    emptyLine(),

    // 2. Phase Status Table
    heading('\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E41\u0E15\u0E48\u0E25\u0E30\u0E40\u0E1F\u0E2A'),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [1000, 4526, 1500, 2000],
      rows: [
        new TableRow({ children: [
          headerCell('\u0E40\u0E1F\u0E2A', 1000),
          headerCell('\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14', 4526),
          headerCell('\u0E2A\u0E16\u0E32\u0E19\u0E30', 1500),
          headerCell('% \u0E40\u0E2A\u0E23\u0E47\u0E08', 2000),
        ]}),
        new TableRow({ children: [dataCell('1', 1000, { align: AlignmentType.CENTER }), dataCell('\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07 + Candidates (\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B/\u0E27\u0E34\u0E0A\u0E32\u0E01\u0E32\u0E23) + \u0E19\u0E31\u0E1A\u0E40\u0E01\u0E37\u0E49\u0E2D\u0E01\u0E39\u0E25', 4526), statusCell('\u0E40\u0E2A\u0E23\u0E47\u0E08', 1500, COLOR_GREEN, 'E8F8F0'), dataCell('100%', 2000, { align: AlignmentType.CENTER, textOpts: { bold: true, color: COLOR_GREEN } })]}),
        new TableRow({ children: [dataCell('2', 1000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('Candidates (\u0E2D\u0E33\u0E19\u0E27\u0E22\u0E01\u0E32\u0E23/\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23) + \u0E19\u0E31\u0E1A\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07 + \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07', 4526, { shading: COLOR_ROW_ALT }), statusCell('\u0E40\u0E2A\u0E23\u0E47\u0E08', 1500, COLOR_GREEN, 'E8F8F0'), dataCell('100%', 2000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT, textOpts: { bold: true, color: COLOR_GREEN } })]}),
        new TableRow({ children: [dataCell('3', 1000, { align: AlignmentType.CENTER }), dataCell('Executive Dashboard', 4526), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, textOpts: { color: COLOR_GRAY } })]}),
        new TableRow({ children: [dataCell('4', 1000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B Career Path', 4526, { shading: COLOR_ROW_ALT }), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT, textOpts: { color: COLOR_GRAY } })]}),
        new TableRow({ children: [dataCell('5', 1000, { align: AlignmentType.CENTER }), dataCell('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E49\u0E32\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23\u0E04\u0E23\u0E1A\u0E27\u0E07\u0E08\u0E23', 4526), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, textOpts: { color: COLOR_GRAY } })]}),
        new TableRow({ children: [dataCell('6', 1000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1C\u0E39\u0E49\u0E40\u0E01\u0E29\u0E35\u0E22\u0E13', 4526, { shading: COLOR_ROW_ALT }), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT, textOpts: { color: COLOR_GRAY } })]}),
        new TableRow({ children: [dataCell('7', 1000, { align: AlignmentType.CENTER }), dataCell('Task Management + WFH', 4526), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, textOpts: { color: COLOR_GRAY } })]}),
        new TableRow({ children: [dataCell('8', 1000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('KM & SOP', 4526, { shading: COLOR_ROW_ALT }), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT, textOpts: { color: COLOR_GRAY } })]}),
        new TableRow({ children: [dataCell('9', 1000, { align: AlignmentType.CENTER }), dataCell('\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E14\u0E35\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E2D\u0E1A', 4526), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, textOpts: { color: COLOR_GRAY } })]}),
        new TableRow({ children: [dataCell('10', 1000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('AI Integration', 4526, { shading: COLOR_ROW_ALT }), statusCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21', 1500, COLOR_ORANGE, 'FEF5E7'), dataCell('0%', 2000, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT, textOpts: { color: COLOR_GRAY } })]}),
      ]
    }),
    emptyLine(),

    // 3. Completed work details
    heading('\u0E1C\u0E25\u0E07\u0E32\u0E19\u0E17\u0E35\u0E48\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E41\u0E25\u0E49\u0E27 (Phase 1-2)'),

    heading('Dashboard', HeadingLevel.HEADING_2),
    bullet('\u0E41\u0E2A\u0E14\u0E07\u0E08\u0E33\u0E19\u0E27\u0E19\u0E1A\u0E38\u0E04\u0E25\u0E32\u0E01\u0E23\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14, \u0E08\u0E33\u0E19\u0E27\u0E19\u0E1C\u0E39\u0E49\u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E17\u0E14\u0E25\u0E2D\u0E07, \u0E08\u0E33\u0E19\u0E27\u0E19\u0E41\u0E04\u0E19\u0E14\u0E34\u0E40\u0E14\u0E17\u0E25\u0E34\u0E2A\u0E17\u0E4C\u0E41\u0E22\u0E01\u0E15\u0E32\u0E21\u0E23\u0E30\u0E14\u0E31\u0E1A'),
    bullet('\u0E41\u0E2A\u0E14\u0E07\u0E2A\u0E16\u0E34\u0E15\u0E34\u0E01\u0E32\u0E23\u0E19\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32 (\u0E19\u0E31\u0E1A\u0E40\u0E01\u0E37\u0E49\u0E2D\u0E01\u0E39\u0E25, \u0E19\u0E31\u0E1A\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07, \u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07)'),

    heading('Candidate Lists', HeadingLevel.HEADING_2),
    bullet('\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E2A\u0E32\u0E22\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B (K2, K3, K4) \u0E41\u0E25\u0E30\u0E2A\u0E32\u0E22\u0E27\u0E34\u0E0A\u0E32\u0E01\u0E32\u0E23 (O2, O3)'),
    bullet('Qualification Engine \u0E04\u0E33\u0E19\u0E27\u0E13\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34 \u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E28\u0E36\u0E01\u0E29\u0E32, \u0E2D\u0E32\u0E22\u0E38\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23, \u0E40\u0E27\u0E25\u0E32\u0E04\u0E23\u0E1A\u0E40\u0E01\u0E13\u0E11\u0E4C'),
    bullet('\u0E41\u0E2A\u0E14\u0E07\u0E2A\u0E16\u0E32\u0E19\u0E30: \u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27 / \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E04\u0E23\u0E1A / \u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25'),
    bullet('\u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A\u0E2A\u0E32\u0E22\u0E2D\u0E33\u0E19\u0E27\u0E22\u0E01\u0E32\u0E23\u0E41\u0E25\u0E30\u0E2A\u0E32\u0E22\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23'),

    heading('\u0E1E\u0E49\u0E19\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E1B\u0E0F\u0E34\u0E1A\u0E31\u0E15\u0E34\u0E23\u0E32\u0E0A\u0E01\u0E32\u0E23', HeadingLevel.HEADING_2),
    bullet('\u0E25\u0E07\u0E17\u0E30\u0E40\u0E1A\u0E35\u0E22\u0E19 (Enrollment) \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E04\u0E33\u0E19\u0E27\u0E13\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E25\u0E37\u0E2D'),
    bullet('\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E2A\u0E16\u0E32\u0E19\u0E30: \u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E17\u0E14\u0E25\u0E2D\u0E07, \u0E43\u0E01\u0E25\u0E49\u0E04\u0E23\u0E1A, \u0E40\u0E25\u0E22\u0E01\u0E33\u0E2B\u0E19\u0E14'),
    bullet('\u0E01\u0E32\u0E23\u0E41\u0E01\u0E49\u0E44\u0E02\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E41\u0E25\u0E30\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E2A\u0E16\u0E32\u0E19\u0E30'),

    heading('\u0E01\u0E32\u0E23\u0E19\u0E31\u0E1A\u0E40\u0E27\u0E25\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21', HeadingLevel.HEADING_2),
    bullet('\u0E19\u0E31\u0E1A\u0E40\u0E01\u0E37\u0E49\u0E2D\u0E01\u0E39\u0E25 (Supportive Experience) \u0E1E\u0E23\u0E49\u0E2D\u0E21 CRUD \u0E04\u0E23\u0E1A'),
    bullet('\u0E19\u0E31\u0E1A\u0E41\u0E15\u0E01\u0E15\u0E48\u0E32\u0E07 (Diverse Experience) \u0E1E\u0E23\u0E49\u0E2D\u0E21 CRUD \u0E04\u0E23\u0E1A'),
    bullet('\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07 (Position Equivalence) \u0E1E\u0E23\u0E49\u0E2D\u0E21 Approval Workflow'),
    emptyLine(),

    // 4. Issues / Risks
    heading('\u0E1B\u0E31\u0E0D\u0E2B\u0E32\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2A\u0E35\u0E48\u0E22\u0E07'),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [500, 3500, 2513, 2513],
      rows: [
        new TableRow({ children: [headerCell('#', 500), headerCell('\u0E1B\u0E31\u0E0D\u0E2B\u0E32', 3500), headerCell('\u0E1C\u0E25\u0E01\u0E23\u0E30\u0E17\u0E1A', 2513), headerCell('\u0E41\u0E19\u0E27\u0E17\u0E32\u0E07\u0E41\u0E01\u0E49\u0E44\u0E02', 2513)] }),
        new TableRow({ children: [dataCell('1', 500, { align: AlignmentType.CENTER }), dataCell('\u0E22\u0E31\u0E07\u0E43\u0E0A\u0E49 Hardcoded credentials \u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A dev', 3500), dataCell('\u0E04\u0E27\u0E32\u0E21\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22', 2513), dataCell('\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D DPIS Authentication', 2513)] }),
        new TableRow({ children: [dataCell('2', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('CORS \u0E22\u0E31\u0E07 hardcode \u0E2D\u0E22\u0E39\u0E48', 3500, { shading: COLOR_ROW_ALT }), dataCell('\u0E08\u0E33\u0E01\u0E31\u0E14 domain', 2513, { shading: COLOR_ROW_ALT }), dataCell('\u0E22\u0E49\u0E32\u0E22\u0E44\u0E1B Environment Variable', 2513, { shading: COLOR_ROW_ALT })] }),
        new TableRow({ children: [dataCell('3', 500, { align: AlignmentType.CENTER }), dataCell('\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35 Role-based access control', 3500), dataCell('\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E40\u0E17\u0E48\u0E32\u0E01\u0E31\u0E19', 2513), dataCell('\u0E40\u0E1E\u0E34\u0E48\u0E21 RBAC \u0E43\u0E19 Phase \u0E16\u0E31\u0E14\u0E44\u0E1B', 2513)] }),
        new TableRow({ children: [dataCell('4', 500, { align: AlignmentType.CENTER, shading: COLOR_ROW_ALT }), dataCell('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E42\u0E22\u0E07\u0E01\u0E31\u0E1A DPIS', 3500, { shading: COLOR_ROW_ALT }), dataCell('\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E21\u0E48 sync', 2513, { shading: COLOR_ROW_ALT }), dataCell('\u0E27\u0E32\u0E07\u0E41\u0E1C\u0E19\u0E44\u0E21\u0E40\u0E01\u0E23\u0E17/\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E42\u0E22\u0E07', 2513, { shading: COLOR_ROW_ALT })] }),
      ]
    }),
    emptyLine(),

    // 5. Next Steps
    heading('\u0E41\u0E1C\u0E19\u0E07\u0E32\u0E19\u0E16\u0E31\u0E14\u0E44\u0E1B'),
    para([txt('\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E04\u0E27\u0E32\u0E21\u0E2A\u0E33\u0E04\u0E31\u0E0D\u0E02\u0E2D\u0E07\u0E07\u0E32\u0E19\u0E17\u0E35\u0E48\u0E08\u0E30\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E43\u0E19\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E16\u0E31\u0E14\u0E44\u0E1B:', { size: 30 })]),
    new Paragraph({
      numbering: { reference: 'numbers', level: 0 },
      children: [txt('Phase 3: Executive Dashboard \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1C\u0E39\u0E49\u0E1A\u0E23\u0E34\u0E2B\u0E32\u0E23\u0E23\u0E30\u0E14\u0E31\u0E1A\u0E2A\u0E39\u0E07', { size: 30, bold: true })],
      spacing: { after: 60 }
    }),
    new Paragraph({
      numbering: { reference: 'numbers', level: 0 },
      children: [txt('Phase 4: \u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B \u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A Career Path', { size: 30, bold: true })],
      spacing: { after: 60 }
    }),
    new Paragraph({
      numbering: { reference: 'numbers', level: 0 },
      children: [txt('\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E42\u0E22\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E31\u0E1A DPIS', { size: 30, bold: true })],
      spacing: { after: 60 }
    }),
    new Paragraph({
      numbering: { reference: 'numbers', level: 0 },
      children: [txt('\u0E41\u0E01\u0E49\u0E44\u0E02\u0E23\u0E30\u0E1A\u0E1A Authentication \u0E43\u0E2B\u0E49\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D DPIS \u0E41\u0E17\u0E19 hardcoded credentials', { size: 30, bold: true })],
      spacing: { after: 60 }
    }),
  ];

  return { children, headerText: '\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E04\u0E27\u0E32\u0E21\u0E01\u0E49\u0E32\u0E27\u0E2B\u0E19\u0E49\u0E32 \u2014 \u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E21\u0E38\u0E14\u0E1E\u0E01 Smart Port' };
}


// ═══════════════════════════════════════════════════════════════════════
// MAIN: Generate combined document
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  const outDir = path.join(__dirname);

  console.log('\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23\u0E23\u0E27\u0E21...\n');

  const part1 = createExecutiveSummary();
  const part2 = createRoadmap();
  const part3 = createProgressReport();

  const sectionProps = {
    page: { size: { width: PAGE_WIDTH, height: PAGE_HEIGHT }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } }
  };

  const combined = new Document({
    styles: commonStyles,
    numbering,
    sections: [
      {
        properties: sectionProps,
        headers: { default: makeHeader(part1.headerText) },
        footers: { default: makeFooter() },
        children: part1.children
      },
      {
        properties: sectionProps,
        headers: { default: makeHeader(part2.headerText) },
        footers: { default: makeFooter() },
        children: part2.children
      },
      {
        properties: sectionProps,
        headers: { default: makeHeader(part3.headerText) },
        footers: { default: makeFooter() },
        children: part3.children
      }
    ]
  });

  const buf = await Packer.toBuffer(combined);
  const filePath = path.join(outDir, 'smart-port-report.docx');
  fs.writeFileSync(filePath, buf);
  console.log('\u2713 ' + filePath);
  console.log('\n\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23\u0E23\u0E27\u0E21\u0E40\u0E2A\u0E23\u0E47\u0E08!');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
