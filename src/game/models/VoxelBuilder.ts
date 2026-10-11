import * as THREE from 'three'
import { getPattern, type PatternId } from '../../utils/textures'

/**
 * VoxelBuilder — accumulates axis-aligned (optionally transformed) boxes with vertex colors and
 * bakes them into a single BufferGeometry with one draw group per surface material.
 * Every model in the game (characters, titans, buildings, walls, props) is built through this,
 * which keeps the Minecraft-like pixel look consistent and draw calls low.
 */
export const MAT_IDS: (PatternId | 'glow' | 'glass')[] = [
  'plain', 'brick', 'tile', 'plank', 'cobble', 'grass', 'skin', 'leaves', 'plaster', 'metal', 'fur', 'muscle', 'bark', 'cloth', 'glow', 'glass',
]
export type MatId = (typeof MAT_IDS)[number]
const MAT_INDEX = new Map<MatId, number>(MAT_IDS.map((m, i) => [m, i]))

let sharedMaterials: THREE.Material[] | null = null
export function getMaterials(): THREE.Material[] {
  if (!sharedMaterials) {
    sharedMaterials = MAT_IDS.map((id) => {
      if (id === 'glow') return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      if (id === 'glass')
        return new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: getPattern(id as PatternId) })
    })
  }
  return sharedMaterials
}

/** Materials clone with transparency, used for fade-out (titan dissolving into steam). */
export function makeFadeMaterials(): THREE.Material[] {
  return getMaterials().map((m) => {
    const c = m.clone()
    c.transparent = true
    return c
  })
}

interface Buf {
  pos: number[]
  nor: number[]
  uv: number[]
  col: number[]
  idx: number[]
}

// face definitions: normal, and 4 corners as (sx,sy,sz) signs; u/v axes for uv projection
const FACES: { n: [number, number, number]; c: [number, number, number][]; u: 0 | 1 | 2; v: 0 | 1 | 2; us: number }[] = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], u: 2, v: 1, us: -1 },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], u: 2, v: 1, us: 1 },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], u: 0, v: 2, us: 1 },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], u: 0, v: 2, us: 1 },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], u: 0, v: 1, us: 1 },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], u: 0, v: 1, us: -1 },
]
// face shading baked into vertex colour for a crisp voxel read even under flat light
const FACE_SHADE = [0.86, 0.86, 1.0, 0.6, 0.93, 0.8]

const _c = new THREE.Color()
const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _nm = new THREE.Matrix3()

export interface BoxOpts {
  /** random brightness jitter (0..1) per box */
  jitter?: number
  /** transform applied after building (rotation/translation) */
  m?: THREE.Matrix4
  /** skip faces: bitmask in FACES order (+x,-x,+y,-y,+z,-z) */
  skip?: number
  /** extra per-face colors: e.g. a face colour override for the +z face */
  faceColor?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5, THREE.ColorRepresentation>>
}

export class VoxelBuilder {
  private bufs = new Map<number, Buf>()
  /** world units per texture repeat */
  constructor(public uvScale = 1, public seed = 1) {}

  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647
    return (this.seed % 10000) / 10000
  }

  private buf(mat: MatId): Buf {
    const i = MAT_INDEX.get(mat) ?? 0
    let b = this.bufs.get(i)
    if (!b) {
      b = { pos: [], nor: [], uv: [], col: [], idx: [] }
      this.bufs.set(i, b)
    }
    return b
  }

  /** Box by centre & size. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, mat: MatId = 'plain', o: BoxOpts = {}) {
    if (w <= 0 || h <= 0 || d <= 0) return this
    const b = this.buf(mat)
    const hx = w / 2, hy = h / 2, hz = d / 2
    _c.set(color)
    const j = o.jitter ? 1 + (this.rnd() - 0.5) * 2 * o.jitter : 1
    if (o.m) _nm.getNormalMatrix(o.m)
    const shadeFaces = mat !== 'glow'
    for (let f = 0; f < 6; f++) {
      if (o.skip && o.skip & (1 << f)) continue
      const F = FACES[f]
      const base = b.pos.length / 3
      const fc = o.faceColor?.[f as 0]
      const col = fc !== undefined ? new THREE.Color(fc) : _c
      const s = (shadeFaces ? FACE_SHADE[f] : 1) * j
      for (const [sx, sy, sz] of F.c) {
        const lx = cx + sx * hx, ly = cy + sy * hy, lz = cz + sz * hz
        const arr = [lx, ly, lz]
        b.uv.push((arr[F.u] * F.us) / this.uvScale, arr[F.v] / this.uvScale)
        _v.set(lx, ly, lz)
        _n.set(F.n[0], F.n[1], F.n[2])
        if (o.m) {
          _v.applyMatrix4(o.m)
          _n.applyMatrix3(_nm).normalize()
        }
        b.pos.push(_v.x, _v.y, _v.z)
        b.nor.push(_n.x, _n.y, _n.z)
        b.col.push(col.r * s, col.g * s, col.b * s)
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    return this
  }

  /** Box by min corner & max corner. */
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: THREE.ColorRepresentation, mat: MatId = 'plain', o: BoxOpts = {}) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color, mat, o)
  }

  get empty() {
    return this.bufs.size === 0
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
    const keys = [...this.bufs.keys()].sort((a, b) => a - b)
    for (const k of keys) {
      const b = this.bufs.get(k)!
      const vBase = pos.length / 3
      const start = idx.length
      pos.push(...b.pos)
      nor.push(...b.nor)
      uv.push(...b.uv)
      col.push(...b.col)
      for (const i of b.idx) idx.push(i + vBase)
      geo.addGroup(start, b.idx.length, k)
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1))
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }

  mesh(castShadow = true, receiveShadow = true): THREE.Mesh {
    const m = new THREE.Mesh(this.build(), getMaterials())
    m.castShadow = castShadow
    m.receiveShadow = receiveShadow
    return m
  }
}

/** Helper: rotation around Y + translation */
export function yawMatrix(yaw: number, x = 0, y = 0, z = 0) {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z)
}
