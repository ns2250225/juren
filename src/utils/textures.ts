import * as THREE from 'three'
import { RNG } from './math'

/**
 * Procedural 16×16 grayscale pixel textures (Minecraft-like). They are multiplied with
 * vertex colors so a single texture serves every tint of a surface type.
 */
export type PatternId =
  | 'plain'
  | 'brick'
  | 'tile'
  | 'plank'
  | 'cobble'
  | 'grass'
  | 'skin'
  | 'leaves'
  | 'plaster'
  | 'metal'
  | 'fur'
  | 'muscle'
  | 'bark'
  | 'cloth'

const SIZE = 16
const cache = new Map<PatternId, THREE.CanvasTexture>()

function makeCanvas(draw: (set: (x: number, y: number, v: number) => void, rng: RNG) => void, seed: number) {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(SIZE, SIZE)
  const set = (x: number, y: number, v: number) => {
    x = ((x % SIZE) + SIZE) % SIZE
    y = ((y % SIZE) + SIZE) % SIZE
    const i = (y * SIZE + x) * 4
    const g = Math.max(0, Math.min(255, Math.round(v * 255)))
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g
    img.data[i + 3] = 255
  }
  const rng = new RNG(seed)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, 1)
  draw(set, rng)
  ctx.putImageData(img, 0, 0)
  return c
}

const painters: Record<PatternId, (set: (x: number, y: number, v: number) => void, r: RNG) => void> = {
  plain: (set, r) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, r.range(0.86, 1))
  },
  skin: (set, r) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, r.range(0.93, 1))
  },
  cloth: (set, r) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) set(x, y, ((x + y) % 4 === 0 ? 0.9 : 1) * r.range(0.9, 1))
  },
  plaster: (set, r) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, r.range(0.9, 1) - (r.chance(0.05) ? 0.08 : 0))
  },
  brick: (set, r) => {
    // stone bricks: 8×4 bricks, staggered, dark mortar
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const row = Math.floor(y / 4)
        const off = row % 2 === 0 ? 0 : 4
        const mortar = y % 4 === 3 || (x + off) % 8 === 7
        set(x, y, mortar ? r.range(0.5, 0.58) : r.range(0.78, 0.98) - (y % 4 === 0 ? -0.03 : 0))
      }
  },
  tile: (set, r) => {
    // roof tiles: rows 4px, top highlight → bottom shadow, staggered seams
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const row = Math.floor(y / 4)
        const off = row % 2 === 0 ? 0 : 2
        const t = y % 4
        let v = [1, 0.92, 0.84, 0.66][t] * r.range(0.92, 1)
        if ((x + off) % 4 === 0 && t < 3) v *= 0.8
        set(x, y, v)
      }
  },
  plank: (set, r) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const seam = y % 4 === 3 || ((x + Math.floor(y / 4) * 5) % 16 === 0 && y % 4 !== 3)
        set(x, y, seam ? 0.6 : r.range(0.8, 0.97) - (r.chance(0.08) ? 0.08 : 0))
      }
  },
  cobble: (set, r) => {
    const pts: [number, number][] = []
    for (let i = 0; i < 9; i++) pts.push([r.range(0, SIZE), r.range(0, SIZE)])
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        let d1 = 1e9, d2 = 1e9
        for (const [px, py] of pts)
          for (let ox = -SIZE; ox <= SIZE; ox += SIZE)
            for (let oy = -SIZE; oy <= SIZE; oy += SIZE) {
              const d = Math.hypot(x - px - ox, y - py - oy)
              if (d < d1) { d2 = d1; d1 = d } else if (d < d2) d2 = d
            }
        set(x, y, d2 - d1 < 1.1 ? 0.55 : r.range(0.78, 0.98))
      }
  },
  grass: (set, r) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) set(x, y, r.range(0.78, 1) * (r.chance(0.1) ? 0.85 : 1))
  },
  leaves: (set, r) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) set(x, y, r.chance(0.15) ? r.range(0.45, 0.6) : r.range(0.75, 1))
  },
  bark: (set, r) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) set(x, y, (x % 4 === 0 ? 0.62 : r.range(0.78, 0.95)) * (r.chance(0.06) ? 0.8 : 1))
  },
  metal: (set, r) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) set(x, y, 0.8 + 0.2 * Math.sin((x + y) * 0.6) * 0.5 + r.range(-0.03, 0.03))
  },
  fur: (set, r) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) set(x, y, ((y + (x % 3)) % 3 === 0 ? 0.72 : r.range(0.85, 1)))
  },
  muscle: (set, r) => {
    // Colossal titan: striated skinless muscle
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) set(x, y, (x % 3 === 0 ? 0.7 : 0.95) * r.range(0.88, 1))
  },
}

export function getPattern(id: PatternId): THREE.CanvasTexture {
  let t = cache.get(id)
  if (!t) {
    const canvas = makeCanvas(painters[id], id.length * 977 + id.charCodeAt(0) * 31)
    t = new THREE.CanvasTexture(canvas)
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestMipmapNearestFilter
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    t.generateMipmaps = true
    cache.set(id, t)
  }
  return t
}

/** Small RGBA canvas for square pixel particles (soft speckled square). */
export function particleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 8
  const ctx = c.getContext('2d')!
  const rng = new RNG(42)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const edge = x === 0 || y === 0 || x === 7 || y === 7
      const a = edge ? (rng.chance(0.5) ? 0 : 0.6) : rng.range(0.75, 1)
      const g = Math.round(rng.range(200, 255))
      ctx.fillStyle = `rgba(${g},${g},${g},${a})`
      ctx.fillRect(x, y, 1, 1)
    }
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  return t
}

/** Pixel art emblem (original "wings" motif) used on capes & flags. */
export function emblemTexture(kind: 'survey' | 'garrison' | 'military' = 'survey'): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const ctx = c.getContext('2d')!
  const shield = kind === 'survey' ? '#1d2b45' : kind === 'garrison' ? '#7a2020' : '#20452a'
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, 16, 16)
  // shield silhouette
  ctx.fillStyle = '#d8cdb0'
  ctx.fillRect(3, 2, 10, 9)
  ctx.fillRect(4, 11, 8, 1)
  ctx.fillRect(5, 12, 6, 1)
  ctx.fillRect(6, 13, 4, 1)
  ctx.fillStyle = shield
  ctx.fillRect(4, 3, 8, 8)
  ctx.fillRect(5, 11, 6, 1)
  ctx.fillRect(6, 12, 4, 1)
  if (kind === 'survey') {
    // left wing white, right wing blue
    ctx.fillStyle = '#f2f2f2'
    ;[[5, 4], [6, 4], [5, 5], [6, 5], [7, 5], [6, 6], [7, 6], [7, 7], [6, 8], [7, 8], [7, 9]].forEach(([x, y]) => ctx.fillRect(x, y, 1, 1))
    ctx.fillStyle = '#5b8fd8'
    ;[[9, 4], [10, 4], [8, 5], [9, 5], [10, 5], [8, 6], [9, 6], [8, 7], [8, 8], [9, 8], [8, 9]].forEach(([x, y]) => ctx.fillRect(x, y, 1, 1))
  } else if (kind === 'garrison') {
    // twin roses
    ctx.fillStyle = '#e05a5a'
    ctx.fillRect(5, 5, 2, 2)
    ctx.fillRect(9, 5, 2, 2)
    ctx.fillStyle = '#3c8a3c'
    ctx.fillRect(7, 7, 2, 3)
  } else {
    ctx.fillStyle = '#e8e0c0'
    ctx.fillRect(6, 5, 4, 4)
  }
  const t = new THREE.CanvasTexture(c)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
