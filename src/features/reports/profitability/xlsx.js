/**
 * Minimal .xlsx reader for the browser (and jsdom in tests): unzips with the native
 * DecompressionStream and parses the sheet XML with DOMParser. It reads cell values only:
 * shared strings, inline strings, numbers and booleans. Styles, formulas and merged ranges
 * are ignored, and dates stored as numbers come back as Excel serial numbers.
 *
 * Returns [{ name, rows }] where rows[i][j] is the value of row i+1, column j+1 (or null).
 */
export async function readWorkbook(buffer) {
  const files = unzipIndex(buffer)
  const text = async (path) => {
    const entry = files.get(path.replace(/^\/+/, ''))
    return entry ? new TextDecoder().decode(await inflate(buffer, entry)) : null
  }

  const workbookXml = await text('xl/workbook.xml')
  if (!workbookXml) throw new Error('This file is not an Excel workbook (.xlsx).')
  const workbook = parseXml(workbookXml)
  const rels = parseXml((await text('xl/_rels/workbook.xml.rels')) ?? '<Relationships/>')
  const targets = new Map(byTag(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]))

  const sharedXml = await text('xl/sharedStrings.xml')
  const shared = sharedXml ? byTag(parseXml(sharedXml), 'si').map(textOf) : []

  const sheets = []
  for (const sheet of byTag(workbook, 'sheet')) {
    const relId = attrNS(sheet, 'id')
    const target = targets.get(relId)
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    const xml = await text(path)
    if (xml) sheets.push({ name: sheet.getAttribute('name'), rows: readRows(parseXml(xml), shared) })
  }
  return sheets
}

function readRows(doc, shared) {
  const rows = []
  for (const row of byTag(doc, 'row')) {
    const r = Number(row.getAttribute('r')) - 1 || rows.length
    const cells = []
    for (const c of byTag(row, 'c')) {
      const ref = c.getAttribute('r')
      const col = ref ? columnIndex(ref) : cells.length
      cells[col] = cellValue(c, shared)
    }
    rows[r] = Array.from(cells, (v) => (v === undefined ? null : v))
  }
  return Array.from(rows, (r) => r ?? [])
}

function cellValue(c, shared) {
  const type = c.getAttribute('t')
  if (type === 'inlineStr') return textOf(c) || null
  const v = byTag(c, 'v')[0]?.textContent
  if (v == null || v === '') return null
  if (type === 's') return shared[Number(v)] ?? null
  if (type === 'b') return v === '1'
  if (type === 'str' || type === 'e') return v
  const n = Number(v)
  return Number.isNaN(n) ? v : n
}

const columnIndex = (ref) => {
  let n = 0
  for (const ch of ref.match(/^[A-Z]+/i)[0].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

/* ---------- XML helpers (namespace-agnostic) ---------- */

const parseXml = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The workbook contains malformed XML.')
  return doc
}
const byTag = (node, name) => Array.from(node.getElementsByTagNameNS('*', name))
/** Concatenates every <t> under a node (rich text runs included, phonetic hints skipped). */
const textOf = (node) =>
  byTag(node, 't')
    .filter((t) => t.parentNode?.localName !== 'rPh')
    .map((t) => t.textContent)
    .join('')
const attrNS = (el, local) => {
  for (const a of Array.from(el.attributes)) if (a.localName === local && a.prefix) return a.value
  return el.getAttribute(`r:${local}`)
}

/* ---------- ZIP ---------- */

function unzipIndex(buffer) {
  const view = new DataView(buffer)
  let eocd = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('This file is not an Excel workbook (.xlsx). Older .xls files must be saved as .xlsx first.')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const files = new Map()
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('The workbook archive is damaged.')
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decoder.decode(new Uint8Array(buffer, p + 46, nameLen))
    files.set(name, { method, compressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

async function inflate(buffer, { method, compressedSize, localOffset }) {
  const view = new DataView(buffer)
  const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
  const data = new Uint8Array(buffer, start, compressedSize)
  if (method === 0) return data
  if (method !== 8) throw new Error('The workbook uses an unsupported compression method.')
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  writer.write(data).catch(() => {})
  writer.close().catch(() => {})
  const reader = ds.readable.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
