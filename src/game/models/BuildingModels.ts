import * as THREE from 'three'
import { VoxelBuilder, yawMatrix } from './VoxelBuilder'
import { RNG } from '../../utils/math'

/** All dimensions in metres. Buildings face +z (door side). */
export type HouseKind = 'cottage' | 'town' | 'wide' | 'shop' | 'tall'
export type BState = 0 | 1 | 2 // intact, damaged, collapsed

export interface HouseSpec {
  kind: HouseKind
  w: number
  d: number
  floors: number
  roof: string
  wall: string
  timber: string
  shutter: string
  seed: number
}

export const HOUSE_DIMS: Record<HouseKind, { w: number; d: number; floors: number }> = {
  cottage: { w: 8, d: 7, floors: 2 },
  town: { w: 7, d: 10, floors: 3 },
  wide: { w: 12, d: 8, floors: 2 },
  shop: { w: 9, d: 9, floors: 2 },
  tall: { w: 7, d: 7, floors: 4 },
}

const FLOOR_H = 3.4

export function houseHeight(s: HouseSpec) {
  return 0.6 + s.floors * FLOOR_H
}
export function roofHeight(s: HouseSpec) {
  return (s.d / 2 + 0.6) * (s.kind === 'tall' ? 1.15 : 0.75)
}

/**
 * Half-timbered townhouse in the Shiganshina style: stone plinth, plaster walls with dark
 * timber framing, shuttered windows and a stepped red tile gable roof.
 */
export function buildHouse(s: HouseSpec, state: BState): THREE.BufferGeometry {
  const b = new VoxelBuilder(2, s.seed)
  const rng = new RNG(s.seed * 13 + state * 7)
  const W = s.w / 2, D = s.d / 2
  const top = houseHeight(s)
  const dmg = state === 1
  if (state === 2) return buildRubble(b, s, rng)

  const char = '#3a3430'
  const wallC = (y: number) => (dmg && rng.chance(0.15 + y * 0.02) ? char : s.wall)
  // plinth
  b.span(-W - 0.15, 0, -D - 0.15, W + 0.15, 0.6, D + 0.15, '#8f8a80', 'cobble')
  // walls per floor so damage can remove upper chunks
  for (let f = 0; f < s.floors; f++) {
    const y0 = 0.6 + f * FLOOR_H, y1 = y0 + FLOOR_H
    if (dmg && f === s.floors - 1) {
      // damaged: top floor partially torn open on one side
      b.span(-W, y0, -D, 0, y1, D, wallC(f), 'plaster')
      b.span(0, y0, -D, W, y0 + FLOOR_H * 0.45, D, wallC(f), 'plaster')
      b.span(W * 0.2, y0 + FLOOR_H * 0.45, -D, W * 0.6, y0 + FLOOR_H * 0.75, -D + 1.2, char, 'plaster')
    } else {
      b.span(-W, y0, -D, W, y1, D, wallC(f), f === 0 && s.kind === 'shop' ? 'brick' : 'plaster')
    }
    // timber beam at floor line
    b.span(-W - 0.12, y0 - 0.15, -D - 0.12, W + 0.12, y0 + 0.2, D + 0.12, s.timber, 'plank')
    // windows on long facades (+z/-z) and short facades (+x/-x)
    const nx = Math.max(1, Math.floor(s.w / 2.6))
    for (let i = 0; i < nx; i++) {
      const x = -W + (i + 0.5) * (s.w / nx)
      if (f === 0 && Math.abs(x) < 1.3) continue // door
      for (const side of [1, -1]) {
        const broken = dmg && rng.chance(0.5)
        if (dmg && f === s.floors - 1 && x > 0) continue
        win(b, x, y0 + 1, side * (D + 0.02), 0, broken, s, side)
      }
    }
    const nz = Math.max(1, Math.floor(s.d / 3))
    for (let i = 0; i < nz; i++) {
      const z = -D + (i + 0.5) * (s.d / nz)
      for (const side of [1, -1]) {
        if (dmg && f === s.floors - 1 && side > 0) continue
        win(b, side * (W + 0.02), y0 + 1, z, 1, dmg && rng.chance(0.5), s, side)
      }
    }
    // vertical studs & corner posts
    for (const sx of [-W, W]) for (const sz of [-D, D]) b.span(sx - 0.2, y0, sz - 0.2, sx + 0.2, y1, sz + 0.2, s.timber, 'plank')
    if (f > 0) {
      for (let i = 1; i < nx; i++) {
        const x = -W + i * (s.w / nx)
        b.span(x - 0.12, y0, D, x + 0.12, y1, D + 0.12, s.timber, 'plank')
        b.span(x - 0.12, y0, -D - 0.12, x + 0.12, y1, -D, s.timber, 'plank')
      }
      // diagonal brace approximation (stepped)
      for (let k = 0; k < 4; k++) {
        b.span(-W + 0.3 + k * 0.35, y0 + 0.3 + k * 0.7, D, -W + 0.65 + k * 0.35, y0 + 1.0 + k * 0.7, D + 0.1, s.timber, 'plank')
        b.span(W - 0.65 - k * 0.35, y0 + 0.3 + k * 0.7, D, W - 0.3 - k * 0.35, y0 + 1.0 + k * 0.7, D + 0.1, s.timber, 'plank')
      }
    }
  }
  b.span(-W - 0.15, top - 0.2, -D - 0.15, W + 0.15, top + 0.15, D + 0.15, s.timber, 'plank')
  // door
  b.span(-0.8, 0.6, D, 0.8, 3.0, D + 0.18, '#5a3a22', 'plank')
  b.span(-1.0, 3.0, D, 1.0, 3.3, D + 0.22, s.timber, 'plank')
  b.span(0.4, 1.6, D + 0.18, 0.55, 1.8, D + 0.28, '#c8a050', 'metal')
  if (s.kind === 'shop') {
    // striped awning + hanging sign
    for (let i = 0; i < 6; i++) {
      const x0 = -W + (i * s.w) / 6
      b.span(x0, 3.3, D, x0 + s.w / 6, 3.6, D + 1.8, i % 2 ? '#e8dcc0' : '#7a2e2a', 'cloth')
    }
    b.span(W - 0.2, 3.8, D + 0.2, W + 1.4, 3.9, D + 0.3, '#2a2a2a', 'metal')
    b.span(W + 0.3, 2.6, D + 0.2, W + 1.3, 3.7, D + 0.35, '#8a6a3a', 'plank')
  }
  // roof (gable, ridge along x) — stepped tiles like Minecraft stairs
  const roofH = roofHeight(s)
  const steps = Math.ceil((D + 0.6) / 0.5)
  const stepH = roofH / steps
  for (let i = 0; i < steps; i++) {
    const zo = D + 0.6 - i * 0.5
    const y = top + i * stepH
    if (dmg && i > 1 && i < steps - 1) {
      // hole in the roof on the damaged side
      b.span(-W - 0.5, y, -zo, W + 0.5, y + stepH + 0.05, -zo + 0.55, s.roof, 'tile')
      b.span(-W - 0.5, y, zo - 0.55, -W * 0.1, y + stepH + 0.05, zo, s.roof, 'tile')
      b.span(-W * 0.1, y - 0.2, zo - 0.55, W * 0.15, y + 0.1, zo, '#2a2420', 'plank') // exposed rafters
      continue
    }
    b.span(-W - 0.5, y, -zo, W + 0.5, y + stepH + 0.05, -zo + 0.55, s.roof, 'tile', { jitter: 0.03 })
    b.span(-W - 0.5, y, zo - 0.55, W + 0.5, y + stepH + 0.05, zo, s.roof, 'tile', { jitter: 0.03 })
    // gable end fill
    b.span(-W, y, -zo + 0.55, -W + 0.3, y + stepH, zo - 0.55, s.wall, 'plaster')
    b.span(W - 0.3, y, -zo + 0.55, W, y + stepH, zo - 0.55, s.wall, 'plaster')
  }
  b.span(-W - 0.6, top + roofH - 0.05, -0.35, W + 0.6, top + roofH + 0.35, 0.35, new THREE.Color(s.roof).multiplyScalar(0.7), 'tile') // ridge cap
  // gable window
  b.span(-0.6, top + 0.5, D + 0.4, 0.6, top + 1.6, D + 0.55, '#2b3440', 'glass')
  if (s.kind === 'wide' || s.kind === 'cottage' || s.kind === 'town') {
    b.span(W * 0.45, top + roofH * 0.3, -1.2, W * 0.45 + 1.2, top + roofH + 1.4, 0, '#8a5a48', 'brick')
    b.span(W * 0.45 - 0.1, top + roofH + 1.3, -1.3, W * 0.45 + 1.3, top + roofH + 1.6, 0.1, '#5a4a40', 'brick')
  }
  if (s.kind === 'tall') {
    // dormer
    b.span(-1.2, top + 0.4, D - 1.5, 1.2, top + 2.4, D - 0.2, s.wall, 'plaster')
    b.span(-1.5, top + 2.4, D - 1.7, 1.5, top + 2.8, D, s.roof, 'tile')
    b.span(-0.6, top + 0.8, D - 0.18, 0.6, top + 2, D - 0.05, '#2b3440', 'glass')
  }
  if (dmg) {
    for (let i = 0; i < 6; i++) {
      const x = rng.range(-W - 1.5, W + 1.5), z = D + rng.range(0.3, 2)
      const sz = rng.range(0.4, 1)
      b.box(x, sz / 2, z, sz, sz, sz, rng.pick([s.roof, s.wall, s.timber, '#8f8a80']), 'plain')
    }
  }
  return b.build()
}

function win(b: VoxelBuilder, x: number, y: number, z: number, axis: 0 | 1, broken: boolean, s: HouseSpec, side: number) {
  const ww = 1.1, wh = 1.5
  const glass = broken ? '#141414' : '#3b4a5a'
  if (axis === 0) {
    b.span(x - ww / 2 - 0.12, y - 0.12, z - 0.06 * side, x + ww / 2 + 0.12, y + wh + 0.12, z + 0.1 * side, s.timber, 'plank')
    b.span(x - ww / 2, y, z, x + ww / 2, y + wh, z + 0.13 * side, glass, broken ? 'plain' : 'glass')
    b.span(x - 0.05, y, z, x + 0.05, y + wh, z + 0.16 * side, s.timber)
    if (!broken) {
      b.span(x - ww / 2 - 0.5, y, z, x - ww / 2 - 0.05, y + wh, z + 0.14 * side, s.shutter, 'plank')
      b.span(x + ww / 2 + 0.05, y, z, x + ww / 2 + 0.5, y + wh, z + 0.14 * side, s.shutter, 'plank')
    }
    b.span(x - ww / 2 - 0.15, y - 0.25, z, x + ww / 2 + 0.15, y - 0.05, z + 0.35 * side, s.timber, 'plank')
  } else {
    b.span(x - 0.06 * side, y - 0.12, z - ww / 2 - 0.12, x + 0.1 * side, y + wh + 0.12, z + ww / 2 + 0.12, s.timber, 'plank')
    b.span(x, y, z - ww / 2, x + 0.13 * side, y + wh, z + ww / 2, glass, broken ? 'plain' : 'glass')
  }
}

function buildRubble(b: VoxelBuilder, s: HouseSpec, rng: RNG) {
  const W = s.w / 2, D = s.d / 2
  b.span(-W - 0.15, 0, -D - 0.15, W + 0.15, 0.6, D + 0.15, '#7f7a70', 'cobble')
  // stumps of the walls
  const seg = 4
  for (let i = 0; i < seg; i++) {
    const x0 = -W + (i * s.w) / seg, x1 = x0 + s.w / seg
    const z0 = -D + (i * s.d) / seg, z1 = z0 + s.d / seg
    const c = () => (rng.chance(0.3) ? '#3a3430' : s.wall)
    b.span(x0, 0.6, D - 0.5, x1, 0.6 + rng.range(0.4, 3.2), D, c(), 'plaster')
    b.span(x0, 0.6, -D, x1, 0.6 + rng.range(0.4, 3.2), -D + 0.5, c(), 'plaster')
    b.span(-W, 0.6, z0, -W + 0.5, 0.6 + rng.range(0.4, 3.2), z1, c(), 'plaster')
    b.span(W - 0.5, 0.6, z0, W, 0.6 + rng.range(0.4, 3.2), z1, c(), 'plaster')
  }
  // heap
  const n = 38
  for (let i = 0; i < n; i++) {
    const r = rng.range(0, 1)
    const x = rng.range(-W, W) * (1 - r * 0.3), z = rng.range(-D, D) * (1 - r * 0.3)
    const hgt = (1 - Math.hypot(x / W, z / D) * 0.7) * 3
    const sz = rng.range(0.7, 1.6)
    const c = rng.pick([s.roof, s.roof, s.wall, s.timber, '#8f8a80', '#4a4038'])
    b.box(x, Math.max(0.6, hgt * rng.range(0.3, 1)), z, sz, sz * 0.8, sz, c, c === s.roof ? 'tile' : c === s.timber ? 'plank' : 'plain', { jitter: 0.08 })
  }
  // broken beams sticking out
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng.range(-0.7, 0.7), rng.range(0, 3), rng.range(-0.6, 0.6)))
    m.setPosition(rng.range(-W * 0.6, W * 0.6), 1.5, rng.range(-D * 0.6, D * 0.6))
    b.box(0, 0, 0, 0.3, 0.3, rng.range(3, 6), s.timber, 'plank', { m })
  }
  return b.build()
}

// ------------------------------------------------------------------ city walls
export interface WallSegSpec {
  len: number
  height: number
  thick: number
  stone: string
  seed: number
  gate?: boolean
  rails?: boolean
}

/** Wall segment in local frame: runs along x (−len/2..len/2), outer face at −z. */
export function buildWallSegment(s: WallSegSpec, state: BState): THREE.BufferGeometry {
  const b = new VoxelBuilder(2, s.seed)
  const rng = new RNG(s.seed * 31 + state)
  const L = s.len / 2 + 0.05, T = s.thick / 2, H = s.height
  const stone = s.stone
  const dark = new THREE.Color(stone).multiplyScalar(0.72).getStyle()
  const gateW = 16, gateH = 22
  const hole = state === 2 ? { w: 20 + rng.range(-3, 3), h: 26 + rng.range(-3, 3), x: rng.range(-2, 2) } : null
  const parts: [number, number, number, number][] = [] // x0,x1,y0,y1 solid rects of the face
  if (s.gate) {
    parts.push([-L, -gateW / 2, 0, H], [gateW / 2, L, 0, H], [-gateW / 2, gateW / 2, gateH, H])
  } else if (hole) {
    const hx0 = hole.x - hole.w / 2, hx1 = hole.x + hole.w / 2
    parts.push([-L, hx0, 0, H], [hx1, L, 0, H], [hx0, hx1, hole.h, H])
  } else parts.push([-L, L, 0, H])
  for (const [x0, x1, y0, y1] of parts) {
    // body in horizontal courses for texture variation
    const courses = Math.ceil((y1 - y0) / 6)
    for (let c = 0; c < courses; c++) {
      const cy0 = y0 + c * 6, cy1 = Math.min(y1, cy0 + 6)
      b.span(x0, cy0, -T, x1, cy1, T, c % 2 ? stone : new THREE.Color(stone).multiplyScalar(0.95).getStyle(), 'brick', { jitter: 0.03 })
    }
  }
  // base plinth (outer face) and buttress lines
  b.span(-L, 0, -T - 1.2, L, 3, -T, dark, 'brick')
  for (let x = -L + 6; x < L - 3; x += 12) {
    if (s.gate && Math.abs(x) < gateW / 2 + 2) continue
    if (hole && Math.abs(x - hole.x) < hole.w / 2 + 2) continue
    b.span(x - 1.2, 0, -T - 0.8, x + 1.2, H - 4, -T, dark, 'brick')
  }
  // top cornice + parapet + rails (cannons run on rails along the top in the series)
  b.span(-L, H - 1.2, -T - 0.6, L, H, T + 0.4, dark, 'brick')
  b.span(-L, H, -T - 0.6, L, H + 1.4, -T + 0.4, stone, 'brick')
  if (s.rails !== false) {
    b.span(-L, H, -0.9, L, H + 0.15, -0.6, '#4a4a4a', 'metal')
    b.span(-L, H, 0.6, L, H + 0.15, 0.9, '#4a4a4a', 'metal')
    for (let x = -L + 1; x < L; x += 2) b.span(x - 0.2, H, -1.2, x + 0.2, H + 0.08, 1.2, '#5a4632', 'plank')
  }
  if (state >= 1) {
    // cracks and missing blocks
    for (let i = 0; i < (state === 2 ? 30 : 16); i++) {
      const x = rng.range(-L + 1, L - 1), y = rng.range(2, H - 2)
      if (hole && Math.abs(x - hole.x) < hole.w / 2 && y < hole.h) continue
      if (s.gate && Math.abs(x) < gateW / 2 && y < gateH) continue
      const w = rng.range(0.6, 2.4), h = rng.range(0.4, 2.2)
      b.span(x - w / 2, y - h / 2, -T - 0.08, x + w / 2, y + h / 2, -T + 0.02, '#3a3632')
    }
    for (let i = 0; i < 6; i++) {
      const x = rng.range(-L + 2, L - 2)
      b.span(x - 1.5, H - rng.range(1, 3.5), -T - 0.7, x + 1.5, H + 1.5, -T + 1.3, '#2c2a28')
    }
  }
  if (hole) {
    // rubble pile spilling both sides of the breach, and jagged hole edges
    for (let i = 0; i < 60; i++) {
      const x = hole.x + rng.range(-hole.w / 2 - 4, hole.w / 2 + 4)
      const z = rng.range(-T - 10, T + 10)
      const hgt = Math.max(0, 5 - Math.abs(z) * 0.35) * rng.range(0.2, 1)
      const sz = rng.range(1.2, 3.2)
      b.box(x, hgt + sz / 2 - 0.4, z, sz, sz, sz, rng.chance(0.5) ? stone : dark, 'brick', { jitter: 0.1 })
    }
    for (let y = 0; y < hole.h; y += 2.5) {
      const jl = rng.range(0, 2.2), jr = rng.range(0, 2.2)
      b.span(hole.x - hole.w / 2, y, -T, hole.x - hole.w / 2 + jl, y + 2.5, T, stone, 'brick')
      b.span(hole.x + hole.w / 2 - jr, y, -T, hole.x + hole.w / 2, y + 2.5, T, stone, 'brick')
    }
  }
  if (s.gate) {
    // arch frame
    b.span(-gateW / 2 - 1.2, 0, -T - 1, -gateW / 2, gateH + 1.2, -T + 0.2, dark, 'brick')
    b.span(gateW / 2, 0, -T - 1, gateW / 2 + 1.2, gateH + 1.2, -T + 0.2, dark, 'brick')
    b.span(-gateW / 2 - 1.2, gateH, -T - 1, gateW / 2 + 1.2, gateH + 1.8, -T + 0.2, dark, 'brick')
    b.span(-gateW / 2 - 0.2, 0, -T, -gateW / 2, gateH, T, dark)
    b.span(gateW / 2, 0, -T, gateW / 2 + 0.2, gateH, T, dark)
    b.span(-gateW / 2, gateH - 0.2, -T, gateW / 2, gateH, T, dark)
  }
  return b.build()
}

/** Heavy wooden gate doors with iron bands (separate so it can break independently). */
export function buildGateDoor(state: BState, seed = 3, w = 16, h = 22): THREE.BufferGeometry {
  const b = new VoxelBuilder(2, seed)
  const rng = new RNG(seed + state * 17)
  if (state === 2) {
    for (let i = 0; i < 24; i++) {
      const x = rng.range(-w / 2, w / 2)
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng.range(-1.4, 1.4), rng.range(-0.5, 0.5), rng.range(-0.4, 0.4)))
      m.setPosition(x, rng.range(0.3, 1.2), rng.range(-6, 6))
      b.box(0, 0, 0, rng.range(0.8, 1.6), rng.range(3, 8), 0.6, i % 3 ? '#5a3a22' : '#3a3a3a', i % 3 ? 'plank' : 'metal', { m })
    }
    b.span(-w / 2, h - 6, -0.4, w / 2, h, 0.4, '#4a3020', 'plank')
    return b.build()
  }
  const planks = 8
  for (let i = 0; i < planks; i++) {
    const x0 = -w / 2 + (i * w) / planks, x1 = x0 + w / planks - 0.05
    const top = state === 1 && (i === 3 || i === 4) ? h * rng.range(0.4, 0.7) : h
    b.span(x0, 0, -0.5, x1, top, 0.5, i % 2 ? '#5a3a22' : '#4f331e', 'plank')
  }
  for (let y = 2; y < h; y += 4.5) b.span(-w / 2, y, -0.65, w / 2, y + 0.6, 0.65, '#3a3a3a', 'metal')
  for (let y = 2; y < h; y += 4.5) for (let x = -w / 2 + 1; x < w / 2; x += 2) b.span(x - 0.15, y + 0.15, -0.75, x + 0.15, y + 0.45, -0.65, '#8a8a8a', 'metal')
  b.span(-0.15, 0, -0.7, 0.15, h, 0.7, '#2a2a2a', 'metal')
  if (state === 1) for (let i = 0; i < 6; i++) b.box(rng.range(-w / 2, w / 2), rng.range(0, h), -0.55, rng.range(1, 2), rng.range(1, 2.5), 0.2, '#1a120a')
  return b.build()
}

// ------------------------------------------------------------------ landmarks
export function buildBellTower(state: BState, seed = 5) {
  const b = new VoxelBuilder(2, seed)
  const rng = new RNG(seed + state)
  const stone = '#cfc4ae', dark = '#9a907e', roof = '#5a6a78'
  const H = state === 2 ? 8 : state === 1 ? 22 : 28
  // nave
  if (state < 2) {
    b.span(-5, 0, 3.5, 5, 11, 20, stone, 'brick')
    for (let i = 0; i < 9; i++) {
      const zo = 5.4 - i * 0.6
      b.span(-zo, 11 + i * 0.6, 3.2, zo, 11.65 + i * 0.6, 20.4, roof, 'tile')
    }
    for (let z = 6; z < 19; z += 3.2) for (const s of [-1, 1]) b.span(s * 5 - 0.1, 3, z, s * 5 + 0.1, 8.5, z + 1.4, '#3b4a6a', 'glass')
    b.span(-1.5, 4, 19.9, 1.5, 9, 20.1, '#8a3a7a', 'glass') // rose window
  } else {
    for (let i = 0; i < 40; i++) b.box(rng.range(-5, 5), rng.range(0.5, 3), rng.range(3, 20), rng.range(1, 2.4), rng.range(1, 2), rng.range(1, 2.4), rng.pick([stone, dark, roof]), 'brick')
  }
  // tower
  b.span(-3.5, 0, -3.5, 3.5, Math.min(H, 20), 3.5, stone, 'brick')
  if (state === 0) {
    // belfry open arches with bell
    for (const [x, z] of [[-3.5, -3.5], [2.5, -3.5], [-3.5, 2.5], [2.5, 2.5]]) b.span(x, 20, z, x + 1, 25, z + 1, stone, 'brick')
    b.span(-3.7, 25, -3.7, 3.7, 26, 3.7, dark, 'brick')
    b.span(-1.2, 21, -1.2, 1.2, 23.6, 1.2, '#b08a3a', 'metal')
    b.span(-0.8, 23.6, -0.8, 0.8, 24.4, 0.8, '#b08a3a', 'metal')
    b.span(-0.2, 24.4, -0.2, 0.2, 25, 0.2, '#3a3a3a', 'metal')
    for (let i = 0; i < 10; i++) b.span(-3.9 + i * 0.39, 26 + i * 1.1, -3.9 + i * 0.39, 3.9 - i * 0.39, 27.1 + i * 1.1, 3.9 - i * 0.39, roof, 'tile')
    b.span(-0.12, 37, -0.12, 0.12, 39.5, 0.12, '#c8a050', 'metal')
    b.span(-0.8, 38.4, -0.1, 0.8, 38.6, 0.1, '#c8a050', 'metal')
    b.span(-1.2, 15, 3.5, 1.2, 17.4, 3.7, '#eae4d4') // clock face
    b.span(-0.1, 16.1, 3.7, 0.1, 17.1, 3.8, '#222')
  } else if (state === 1) {
    for (let i = 0; i < 4; i++) b.span(-3.5 + i * 1.6, 20, -3.5, -2.5 + i * 1.6, 20 + rng.range(0, 2), 3.5, stone, 'brick')
    b.span(-3.7, 14, 3.4, 3.7, 20, 3.6, '#3a3632')
  }
  b.span(-1.2, 0, 3.4, 1.2, 4.5, 3.7, '#5a3a22', 'plank')
  return b.build()
}

/** Garrison headquarters: stone hall with banners. */
export function buildHQ(state: BState, seed = 9) {
  const b = new VoxelBuilder(2, seed)
  const rng = new RNG(seed + state)
  const stone = '#bdb29c', roof = '#6a3a2e'
  if (state === 2) {
    for (let i = 0; i < 70; i++) b.box(rng.range(-8, 8), rng.range(0.5, 3.5), rng.range(-6, 6), rng.range(1, 2.5), rng.range(1, 2), rng.range(1, 2.5), rng.pick([stone, roof, '#6a5a4a']), 'brick')
    return b.build()
  }
  const H = state === 1 ? 9 : 12
  b.span(-8, 0, -6, 8, H, 6, stone, 'brick')
  for (let x = -6; x <= 6; x += 3) for (let y = 2; y < H - 1; y += 4) b.span(x - 0.6, y, 6, x + 0.6, y + 2, 6.15, '#36404c', 'glass')
  b.span(-1.6, 0, 6, 1.6, 4, 6.3, '#4a3020', 'plank')
  if (state === 0) {
    for (let i = 0; i < 8; i++) b.span(-8.5, 12 + i * 0.7, -6.5 + i * 0.75, 8.5, 12.7 + i * 0.7, 6.5 - i * 0.75, roof, 'tile')
    // banners (garrison red)
    for (const x of [-5, 5]) {
      b.span(x - 1.1, 5, 6.2, x + 1.1, 10.5, 6.35, '#7a2020', 'cloth')
      b.span(x - 0.5, 7.2, 6.36, x + 0.5, 8.4, 6.42, '#e05a5a', 'cloth')
    }
    b.span(7, 12, -0.15, 7.2, 20, 0.15, '#3a3a3a', 'metal')
    b.span(7.2, 17.5, -0.1, 10, 19.5, 0.1, '#7a2020', 'cloth')
  }
  return b.build()
}

/** Supply depot: open shed with stacked gas canisters, blade crates. */
export function buildSupply(state: BState, seed = 11) {
  const b = new VoxelBuilder(2, seed)
  const rng = new RNG(seed + state)
  const wood = '#7a5232'
  if (state === 2) {
    for (let i = 0; i < 30; i++) b.box(rng.range(-5, 5), rng.range(0.3, 1.5), rng.range(-4, 4), rng.range(0.6, 1.6), rng.range(0.5, 1.2), rng.range(0.6, 1.6), rng.pick([wood, '#555', '#2a2a2a', '#8a8c8f']), 'plank')
    return b.build()
  }
  for (const [x, z] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) b.span(x - 0.3, 0, z - 0.3, x + 0.3, 5, z + 0.3, wood, 'plank')
  if (state === 0) for (let i = 0; i < 5; i++) b.span(-5.8, 5 + i * 0.4, -4.8 + i * 0.6, 5.8, 5.45 + i * 0.4, 4.8 - i * 0.6, '#5a6a4a', 'plank')
  b.span(-5.5, 0, -4.5, 5.5, 0.3, 4.5, '#6a5a4a', 'plank')
  // gas canisters on rack
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) b.span(-4.6 + i * 1.3, 0.3 + j * 1.2, -3.8, -3.7 + i * 1.3, 1.4 + j * 1.2, -1.6, '#9da2a6', 'metal')
  // crates
  for (let i = 0; i < 4; i++) b.span(-4 + i * 2, 0.3, 1, -2.4 + i * 2, 1.9, 2.6, '#8a6038', 'plank')
  b.span(-1, 1.9, 1, 0.6, 3.5, 2.6, '#8a6038', 'plank')
  // flag
  b.span(5.4, 0, 4.4, 5.6, 9, 4.6, '#3a3a3a', 'metal')
  b.span(5.6, 7, 4.45, 8.2, 8.8, 4.55, '#2e5a3a', 'cloth')
  if (state === 1) for (let i = 0; i < 6; i++) b.box(rng.range(-5, 5), 0.5, rng.range(-4, 4), 1, 0.8, 1, '#2a2420')
  return b.build()
}

/** Inner gate / fortress core. state 0..2 */
export function buildCoreGate(state: BState, kind: 'gate' | 'fort', seed = 13) {
  const b = new VoxelBuilder(2, seed)
  const rng = new RNG(seed + state)
  const stone = '#c9bea6', dark = '#958a76'
  if (kind === 'gate') {
    // gatehouse protruding inward from the inner wall with massive doors
    b.span(-14, 0, 0, -9, 30, 10, stone, 'brick')
    b.span(9, 0, 0, 14, 30, 10, stone, 'brick')
    b.span(-14, 24, 0, 14, 30, 10, stone, 'brick')
    b.span(-14.5, 30, -0.5, 14.5, 31.5, 10.5, dark, 'brick')
    for (const x of [-12, 12]) b.span(x - 1.6, 31.5, 8, x + 1.6, 35, 10.5, dark, 'brick')
    const doorTop = state === 2 ? 6 : state === 1 ? 18 : 24
    for (let i = 0; i < 6; i++) {
      const x0 = -9 + i * 3
      const top = state === 1 && (i === 2 || i === 3) ? doorTop * 0.6 : doorTop
      b.span(x0, 0, 4, x0 + 2.95, top, 5.2, i % 2 ? '#4f331e' : '#5a3a22', 'plank')
    }
    for (let y = 3; y < doorTop; y += 5) b.span(-9, y, 3.8, 9, y + 0.6, 5.4, '#3a3a3a', 'metal')
    if (state === 2) for (let i = 0; i < 20; i++) b.box(rng.range(-9, 9), rng.range(0.4, 1.4), rng.range(5, 14), rng.range(1, 3), 0.6, rng.range(1, 4), '#4f331e', 'plank')
  } else {
    // fortress keep
    const H = state === 2 ? 6 : state === 1 ? 16 : 22
    b.span(-12, 0, -10, 12, H, 10, stone, 'brick')
    if (state === 0) {
      for (let x = -12; x < 12; x += 3) b.span(x, 22, -10.5, x + 1.5, 24, 10.5, dark, 'brick')
      b.span(-5, 22, -5, 5, 34, 5, stone, 'brick')
      for (let i = 0; i < 6; i++) b.span(-5.5 + i * 0.9, 34 + i, -5.5 + i * 0.9, 5.5 - i * 0.9, 35 + i, 5.5 - i * 0.9, '#6a3a2e', 'tile')
      b.span(-0.15, 40, -0.15, 0.15, 46, 0.15, '#3a3a3a', 'metal')
      b.span(0.15, 43, -0.08, 4, 45.6, 0.08, '#7a2020', 'cloth')
    }
    b.span(-3, 0, 10, 3, 8, 10.4, '#4f331e', 'plank')
    if (state > 0) for (let i = 0; i < 30; i++) b.box(rng.range(-12, 12), rng.range(H, H + 2), rng.range(-10, 10), rng.range(1, 3), rng.range(1, 2), rng.range(1, 3), rng.pick([stone, dark]), 'brick')
  }
  return b.build()
}

export function placeMatrix(x: number, z: number, yaw: number, y = 0) {
  return yawMatrix(yaw, x, y, z)
}
