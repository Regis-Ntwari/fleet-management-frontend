import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDuration, formatKm, humanize, initials } from '@/utils/format'
import { parseCsv, toCsv } from '@/utils/csv'

describe('formatting helpers', () => {
  it('formats Rwandan francs without decimals and compacts large values', () => {
    expect(formatCurrency(1234567)).toBe('RWF 1,234,567')
    expect(formatCurrency(2_500_000, { compact: true })).toBe('RWF 2.5M')
    expect(formatCurrency(null)).toBe('—')
  })
  it('formats durations, distances and labels', () => {
    expect(formatDuration(135)).toBe('2 h 15 min')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatKm(12345)).toBe('12,345 km')
    expect(humanize('IN_MAINTENANCE')).toBe('In maintenance')
    expect(initials('Jean Bosco Habimana')).toBe('JB')
  })
})

describe('csv helpers', () => {
  it('round-trips quoted fields', () => {
    const csv = toCsv(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      [{ a: 'x,y', b: 'he said "hi"' }],
    )
    expect(csv).toBe('A,B\n"x,y","he said ""hi"""')
    const parsed = parseCsv(csv)
    expect(parsed.rows[0]).toEqual({ A: 'x,y', B: 'he said "hi"' })
  })
})
