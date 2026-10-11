import type { CollisionWorld } from '../core/Collision'

/** 2 m ground navigation grid for walking NPCs (civilians, engineers, medics). */
export class NavGrid {
  readonly cell = 2
  w: number
  h: number
  blocked: Uint8Array
  private g: Float32Array
  private f: Float32Array
  private parent: Int32Array
  private closed: Uint8Array
  private openStamp: Uint32Array
  private stamp = 1

  constructor(public x0: number, public z0: number, x1: number, z1: number, private collision: CollisionWorld, private inside: (x: number, z: number) => boolean) {
    this.w = Math.ceil((x1 - x0) / this.cell)
    this.h = Math.ceil((z1 - z0) / this.cell)
    const n = this.w * this.h
    this.blocked = new Uint8Array(n)
    this.g = new Float32Array(n)
    this.f = new Float32Array(n)
    this.parent = new Int32Array(n)
    this.closed = new Uint8Array(n)
    this.openStamp = new Uint32Array(n)
    this.rebuild(x0, z0, x1, z1)
  }

  private filter = (c: { kind: string }) => c.kind === 'building' || c.kind === 'core' || c.kind === 'wall' || c.kind === 'innerline' || c.kind === 'gate' || c.kind === 'prop'

  rebuild(ax: number, az: number, bx: number, bz: number) {
    const i0 = Math.max(0, Math.floor((ax - this.x0) / this.cell)), i1 = Math.min(this.w - 1, Math.ceil((bx - this.x0) / this.cell))
    const j0 = Math.max(0, Math.floor((az - this.z0) / this.cell)), j1 = Math.min(this.h - 1, Math.ceil((bz - this.z0) / this.cell))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * this.cell, z = this.z0 + (j + 0.5) * this.cell
        const b = !this.inside(x, z) || !!this.collision.pointBlocked(x, 1, z, this.filter) || !!this.collision.pointBlocked(x + 0.7, 1, z + 0.7, this.filter) || !!this.collision.pointBlocked(x - 0.7, 1, z - 0.7, this.filter)
        this.blocked[j * this.w + i] = b ? 1 : 0
      }
  }

  idx(x: number, z: number) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell)
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1
    return j * this.w + i
  }
  isFree(x: number, z: number) {
    const k = this.idx(x, z)
    return k >= 0 && !this.blocked[k]
  }
  /** nearest free cell (spiral search) */
  nearestFree(x: number, z: number, maxR = 12): [number, number] | null {
    if (this.isFree(x, z)) return [x, z]
    for (let r = 1; r <= maxR; r++)
      for (let a = 0; a < 8 * r; a++) {
        const ang = (a / (8 * r)) * Math.PI * 2
        const px = x + Math.cos(ang) * r * this.cell, pz = z + Math.sin(ang) * r * this.cell
        if (this.isFree(px, pz)) return [px, pz]
      }
    return null
  }

  /** A* returning a smoothed list of waypoints (x,z pairs) or null */
  path(sx: number, sz: number, tx: number, tz: number, maxNodes = 5000): [number, number][] | null {
    const s0 = this.nearestFree(sx, sz, 4), t0 = this.nearestFree(tx, tz, 8)
    if (!s0 || !t0) return null
    const start = this.idx(s0[0], s0[1]), goal = this.idx(t0[0], t0[1])
    if (start < 0 || goal < 0) return null
    const st = ++this.stamp
    const W = this.w
    const gx = goal % W, gz = Math.floor(goal / W)
    const heap: number[] = []
    const push = (n: number) => {
      heap.push(n)
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (this.f[heap[p]] <= this.f[heap[i]]) break
        ;[heap[p], heap[i]] = [heap[i], heap[p]]
        i = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1, r = l + 1
          let m = i
          if (l < heap.length && this.f[heap[l]] < this.f[heap[m]]) m = l
          if (r < heap.length && this.f[heap[r]] < this.f[heap[m]]) m = r
          if (m === i) break
          ;[heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top
    }
    const hfn = (n: number) => {
      const dx = Math.abs((n % W) - gx), dz = Math.abs(Math.floor(n / W) - gz)
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz)
    }
    this.g[start] = 0
    this.f[start] = hfn(start)
    this.parent[start] = -1
    this.openStamp[start] = st
    this.closed[start] = 0
    push(start)
    const closedStamp = new Set<number>()
    let found = false
    let nodes = 0
    while (heap.length && nodes++ < maxNodes) {
      const cur = pop()
      if (cur === goal) {
        found = true
        break
      }
      if (closedStamp.has(cur)) continue
      closedStamp.add(cur)
      const cx = cur % W, cz = Math.floor(cur / W)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue
          const nx = cx + dx, nz = cz + dz
          if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue
          const n = nz * W + nx
          if (this.blocked[n] || closedStamp.has(n)) continue
          if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue
          const ng = this.g[cur] + (dx && dz ? 1.414 : 1)
          if (this.openStamp[n] !== st || ng < this.g[n]) {
            this.openStamp[n] = st
            this.g[n] = ng
            this.f[n] = ng + hfn(n)
            this.parent[n] = cur
            push(n)
          }
        }
    }
    if (!found) return null
    const raw: number[] = []
    for (let n = goal; n !== -1; n = this.parent[n]) raw.push(n)
    raw.reverse()
    // string pulling via line-of-sight
    const pts: [number, number][] = []
    const toW = (n: number): [number, number] => [this.x0 + ((n % W) + 0.5) * this.cell, this.z0 + (Math.floor(n / W) + 0.5) * this.cell]
    let anchor = 0
    pts.push(toW(raw[0]))
    for (let i = 2; i < raw.length; i++) {
      if (!this.los(raw[anchor], raw[i])) {
        pts.push(toW(raw[i - 1]))
        anchor = i - 1
      }
    }
    pts.push([tx, tz])
    return pts
  }

  private los(a: number, b: number) {
    const W = this.w
    let x0 = a % W, z0 = Math.floor(a / W)
    const x1 = b % W, z1 = Math.floor(b / W)
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0)
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1
    let err = dx - dz
    for (;;) {
      if (this.blocked[z0 * W + x0]) return false
      if (x0 === x1 && z0 === z1) return true
      const e2 = 2 * err
      if (e2 > -dz) {
        err -= dz
        x0 += sx
      }
      if (e2 < dx) {
        err += dx
        z0 += sz
      }
    }
  }
}
