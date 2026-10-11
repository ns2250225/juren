import * as THREE from 'three'

/**
 * Lightweight collision world: yaw-rotated boxes (OBB around Y) in a uniform XZ grid.
 * Supports ray casts (hook targeting, camera collision, line of sight) and sphere
 * push-out (player / NPC movement). Much cheaper in the browser than a full rigid-body engine,
 * and buildings swap colliders when they change damage state.
 */
export type ColliderKind = 'wall' | 'gate' | 'building' | 'tree' | 'core' | 'prop' | 'rubble' | 'innerline' | 'titan'

export interface Collider {
  id: number
  cx: number
  cy: number
  cz: number
  hx: number
  hy: number
  hz: number
  cos: number
  sin: number
  kind: ColliderKind
  hookable: boolean
  solid: boolean
  owner?: unknown
  stamp: number
  cells: number[]
}

export interface RayHit {
  t: number
  point: THREE.Vector3
  normal: THREE.Vector3
  collider: Collider | null
  ground?: boolean
}

const CELL = 24
const OFF = 4096
const key = (ix: number, iz: number) => (ix + OFF) * 8192 + (iz + OFF)

export class CollisionWorld {
  private colliders = new Map<number, Collider>()
  private grid = new Map<number, Collider[]>()
  private nextId = 1
  private stamp = 1

  add(o: { x: number; y: number; z: number; w: number; h: number; d: number; yaw?: number; kind: ColliderKind; hookable?: boolean; solid?: boolean; owner?: unknown }): Collider {
    const yaw = o.yaw ?? 0
    const c: Collider = {
      id: this.nextId++, cx: o.x, cy: o.y, cz: o.z, hx: o.w / 2, hy: o.h / 2, hz: o.d / 2,
      cos: Math.cos(yaw), sin: Math.sin(yaw), kind: o.kind, hookable: o.hookable ?? true, solid: o.solid ?? true,
      owner: o.owner, stamp: 0, cells: [],
    }
    this.colliders.set(c.id, c)
    const ex = Math.abs(c.cos) * c.hx + Math.abs(c.sin) * c.hz
    const ez = Math.abs(c.sin) * c.hx + Math.abs(c.cos) * c.hz
    const x0 = Math.floor((c.cx - ex) / CELL), x1 = Math.floor((c.cx + ex) / CELL)
    const z0 = Math.floor((c.cz - ez) / CELL), z1 = Math.floor((c.cz + ez) / CELL)
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz)
        let arr = this.grid.get(k)
        if (!arr) this.grid.set(k, (arr = []))
        arr.push(c)
        c.cells.push(k)
      }
    return c
  }

  remove(c: Collider | null | undefined) {
    if (!c || !this.colliders.has(c.id)) return
    this.colliders.delete(c.id)
    for (const k of c.cells) {
      const arr = this.grid.get(k)
      if (!arr) continue
      const i = arr.indexOf(c)
      if (i >= 0) arr.splice(i, 1)
    }
  }

  clear() {
    this.colliders.clear()
    this.grid.clear()
  }

  /** colliders whose cells overlap circle */
  query(x: number, z: number, r: number, out: Collider[] = []): Collider[] {
    out.length = 0
    const s = ++this.stamp
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL)
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL)
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.grid.get(key(ix, iz))
        if (!arr) continue
        for (const c of arr)
          if (c.stamp !== s) {
            c.stamp = s
            out.push(c)
          }
      }
    return out
  }

  /** ray vs single collider; returns t or -1 */
  rayBox(c: Collider, o: THREE.Vector3, d: THREE.Vector3, maxT: number, nOut?: THREE.Vector3): number {
    const wx = o.x - c.cx, wz = o.z - c.cz
    const lox = c.cos * wx - c.sin * wz, loz = c.sin * wx + c.cos * wz, loy = o.y - c.cy
    const ldx = c.cos * d.x - c.sin * d.z, ldz = c.sin * d.x + c.cos * d.z, ldy = d.y
    let tmin = 0, tmax = maxT, axis = -1, sign = 0
    const slab = (ro: number, rd: number, h: number, ax: number) => {
      if (Math.abs(rd) < 1e-9) return ro >= -h && ro <= h
      let t1 = (-h - ro) / rd, t2 = (h - ro) / rd
      let sg = -1
      if (t1 > t2) {
        const tmp = t1
        t1 = t2
        t2 = tmp
        sg = 1
      }
      if (t1 > tmin) {
        tmin = t1
        axis = ax
        sign = sg
      }
      if (t2 < tmax) tmax = t2
      return tmin <= tmax
    }
    if (!slab(lox, ldx, c.hx, 0) || !slab(loy, ldy, c.hy, 1) || !slab(loz, ldz, c.hz, 2)) return -1
    if (axis < 0) return -1 // origin inside
    if (nOut) {
      const lx = axis === 0 ? sign : 0, ly = axis === 1 ? sign : 0, lz = axis === 2 ? sign : 0
      nOut.set(c.cos * lx + c.sin * lz, ly, -c.sin * lx + c.cos * lz)
    }
    return tmin
  }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number, filter?: (c: Collider) => boolean, hitGround = true): RayHit | null {
    let best = maxDist
    let bestC: Collider | null = null
    const n = new THREE.Vector3()
    const bestN = new THREE.Vector3()
    const s = ++this.stamp
    // DDA over grid cells along the XZ projection
    let ix = Math.floor(o.x / CELL), iz = Math.floor(o.z / CELL)
    const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1
    const tDX = Math.abs(d.x) > 1e-9 ? CELL / Math.abs(d.x) : Infinity
    const tDZ = Math.abs(d.z) > 1e-9 ? CELL / Math.abs(d.z) : Infinity
    let tMX = Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? (ix + 1) * CELL - o.x : o.x - ix * CELL) / Math.abs(d.x)) : Infinity
    let tMZ = Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? (iz + 1) * CELL - o.z : o.z - iz * CELL) / Math.abs(d.z)) : Infinity
    let tCell = 0
    for (let guard = 0; guard < 200; guard++) {
      const arr = this.grid.get(key(ix, iz))
      if (arr)
        for (const c of arr) {
          if (c.stamp === s) continue
          c.stamp = s
          if (filter && !filter(c)) continue
          const t = this.rayBox(c, o, d, best, n)
          if (t >= 0 && t < best) {
            best = t
            bestC = c
            bestN.copy(n)
          }
        }
      if (tCell > best) break
      if (tMX < tMZ) {
        tCell = tMX
        tMX += tDX
        ix += stepX
      } else {
        tCell = tMZ
        tMZ += tDZ
        iz += stepZ
      }
      if (tCell > maxDist) break
    }
    if (hitGround && d.y < -1e-6) {
      const tg = -o.y / d.y
      if (tg >= 0 && tg < best) return { t: tg, point: o.clone().addScaledVector(d, tg), normal: new THREE.Vector3(0, 1, 0), collider: null, ground: true }
    }
    if (!bestC) return null
    return { t: best, point: o.clone().addScaledVector(d, best), normal: bestN, collider: bestC }
  }

  /**
   * Push a sphere out of all solid colliders. Returns the accumulated push and whether a
   * floor-like contact (normal.y > 0.55) was found.
   */
  sphere(p: THREE.Vector3, r: number, push: THREE.Vector3, filter?: (c: Collider) => boolean): { grounded: boolean; hit: boolean; normal: THREE.Vector3 } {
    push.set(0, 0, 0)
    let grounded = false, hit = false
    const normal = new THREE.Vector3()
    const list = this.query(p.x, p.z, r + 1, tmpList)
    for (const c of list) {
      if (!c.solid || (filter && !filter(c))) continue
      const wx = p.x - c.cx, wz = p.z - c.cz
      const lx = c.cos * wx - c.sin * wz, lz = c.sin * wx + c.cos * wz, ly = p.y - c.cy
      const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qy = Math.max(-c.hy, Math.min(c.hy, ly)), qz = Math.max(-c.hz, Math.min(c.hz, lz))
      let dx = lx - qx, dy = ly - qy, dz = lz - qz
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 > r * r) continue
      let nx: number, ny: number, nz: number, pen: number
      if (d2 > 1e-10) {
        const dd = Math.sqrt(d2)
        nx = dx / dd
        ny = dy / dd
        nz = dz / dd
        pen = r - dd
      } else {
        // centre inside: smallest axis
        const px = c.hx - Math.abs(lx), py = c.hy - Math.abs(ly), pz = c.hz - Math.abs(lz)
        if (py <= px && py <= pz) {
          nx = 0; ny = Math.sign(ly) || 1; nz = 0; pen = py + r
        } else if (px <= pz) {
          nx = Math.sign(lx) || 1; ny = 0; nz = 0; pen = px + r
        } else {
          nx = 0; ny = 0; nz = Math.sign(lz) || 1; pen = pz + r
        }
      }
      const wnx = c.cos * nx + c.sin * nz, wnz = -c.sin * nx + c.cos * nz
      p.x += wnx * pen
      p.y += ny * pen
      p.z += wnz * pen
      push.x += wnx * pen
      push.y += ny * pen
      push.z += wnz * pen
      normal.set(wnx, ny, wnz)
      hit = true
      if (ny > 0.55) grounded = true
      dx = dy = dz = 0
    }
    return { grounded, hit, normal }
  }

  /** is a point inside any solid collider? */
  pointBlocked(x: number, y: number, z: number, filter?: (c: Collider) => boolean) {
    for (const c of this.query(x, z, 0.5, tmpList)) {
      if (!c.solid || (filter && !filter(c))) continue
      const wx = x - c.cx, wz = z - c.cz
      const lx = c.cos * wx - c.sin * wz, lz = c.sin * wx + c.cos * wz
      if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz && Math.abs(y - c.cy) <= c.hy) return c
    }
    return null
  }
}

const tmpList: Collider[] = []
