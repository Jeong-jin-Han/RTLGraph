// A workbook, written by hand. The same reason as the PDF writer: one dependency
// for one file format is a dependency to keep forever, and what Excel needs is a
// zip of five small XML files.
//
// Entries are stored, not deflated — a spreadsheet of a truth table is a few
// kilobytes either way, and "stored" is a length and a checksum instead of a
// compressor.

export interface Sheet {
  name: string // what the tab is called
  rows: (string | number)[][]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// 1 -> A, 26 -> Z, 27 -> AA
export function columnName(index: number): string {
  let out = ''
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out
  return out
}

// Excel's own rules: 31 characters, none of []:*?/\, and not empty.
export const sheetName = (name: string): string => (name.replace(/[[\]:*?/\\]/g, '_').slice(0, 31) || 'Sheet')

const cell = (ref: string, value: string | number) =>
  typeof value === 'number'
    ? `<c r="${ref}"><v>${value}</v></c>`
    : value === ''
      ? ''
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows.map((row, r) =>
    `<row r="${r + 1}">${row.map((value, c) => cell(`${columnName(c + 1)}${r + 1}`, value)).join('')}</row>`)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface Entry {
  name: string
  data: Uint8Array
}

// A zip archive of stored entries: each file, then a directory of where they are.
function zip(entries: Entry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0

  const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true)
  const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true)

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name)
    const sum = crc32(entry.data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    u32(lv, 0, 0x04034b50)
    u16(lv, 4, 20) // version needed
    u16(lv, 8, 0) // stored
    u32(lv, 14, sum)
    u32(lv, 18, entry.data.length)
    u32(lv, 22, entry.data.length)
    u16(lv, 26, name.length)
    local.set(name, 30)
    chunks.push(local, entry.data)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    u32(cv, 0, 0x02014b50)
    u16(cv, 4, 20) // made by
    u16(cv, 6, 20) // version needed
    u16(cv, 10, 0) // stored
    u32(cv, 16, sum)
    u32(cv, 20, entry.data.length)
    u32(cv, 24, entry.data.length)
    u16(cv, 28, name.length)
    u32(cv, 42, offset)
    central.set(name, 46)
    directory.push(central)
    offset += local.length + entry.data.length
  }

  const size = directory.reduce((n, d) => n + d.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  u32(ev, 0, 0x06054b50)
  u16(ev, 8, entries.length)
  u16(ev, 10, entries.length)
  u32(ev, 12, size)
  u32(ev, 16, offset)

  const all = [...chunks, ...directory, end]
  const out = new Uint8Array(all.reduce((n, part) => n + part.length, 0))
  let at = 0
  for (const part of all) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const text = (s: string) => new TextEncoder().encode(s)

export function renderXlsx(sheets: readonly Sheet[]): Uint8Array {
  const used = sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }]
  // Two tabs of the same name is a broken workbook, and long names are cut to fit,
  // so what collides is numbered.
  const seen = new Map<string, number>()
  const names = used.map((sheet, i) => {
    const wanted = sheetName(sheet.name || `Sheet${i + 1}`)
    const before = seen.get(wanted)
    seen.set(wanted, (before ?? 0) + 1)
    return before === undefined ? wanted : sheetName(`${wanted.slice(0, 27)} ${before + 1}`)
  })
  return zip([
    {
      name: '[Content_Types].xml',
      data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${
        used.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      }</Types>`),
    },
    {
      name: '_rels/.rels',
      data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      name: 'xl/workbook.xml',
      data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
        names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      }</sheets></workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: text(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
        used.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      }</Relationships>`),
    },
    ...used.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: text(sheetXml(sheet)) })),
  ])
}
