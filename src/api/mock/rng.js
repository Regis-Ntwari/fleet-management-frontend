/** Small deterministic PRNG (mulberry32) so seed data is stable across reloads. */
export class Rng {
  state
  constructor(seed) {
    this.state = seed >>> 0
  }
  next() {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
  float(min, max, decimals = 1) {
    const v = this.next() * (max - min) + min
    const f = 10 ** decimals
    return Math.round(v * f) / f
  }
  pick(items) {
    return items[Math.floor(this.next() * items.length)]
  }
  chance(probability) {
    return this.next() < probability
  }
  shuffle(items) {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }
}
