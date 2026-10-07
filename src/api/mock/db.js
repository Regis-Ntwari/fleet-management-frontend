import { buildSeed, SEED_VERSION } from './seed'
import { format } from 'date-fns'
const STORAGE_KEY = 'limoz.mockdb'
let db = null
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Regenerate when the seed changes or when a new calendar day starts so
    // "today" figures stay meaningful during demos.
    if (parsed.version !== SEED_VERSION || parsed.seededOn !== format(new Date(), 'yyyy-MM-dd')) return null
    return parsed
  } catch {
    return null
  }
}
export function getDb() {
  if (!db) db = load() ?? buildSeed()
  return db
}
let persistTimer = null
/** Debounced persistence so bursts of mutations don't serialise repeatedly. */
export function persist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getDb()))
    } catch {
      /* storage may be unavailable (private mode, quota) – mutations still live in memory */
    }
  }, 150)
}
export function resetDb() {
  db = buildSeed()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return db
}
export function nextId(key) {
  const d = getDb()
  d.sequences[key] = (d.sequences[key] ?? 0) + 1
  return d.sequences[key]
}
