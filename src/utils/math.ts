export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** frame-rate independent exponential smoothing */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt))
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
export const TAU = Math.PI * 2

export function angleDiff(a: number, b: number) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
export function dampAngle(a: number, b: number, lambda: number, dt: number) {
  return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt))
}

/** mulberry32 seeded RNG — city generation must be deterministic for save/restore */
export class RNG {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next() {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number) {
    return a + this.next() * (b - a)
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1))
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  chance(p: number) {
    return this.next() < p
  }
}

export function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function pointInPolygon(x: number, z: number, poly: { x: number; z: number }[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
