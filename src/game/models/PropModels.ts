import * as THREE from 'three'
import { VoxelBuilder } from './VoxelBuilder'
import { RNG } from '../../utils/math'

export function buildTree(kind: 'oak' | 'pine' | 'giant', seed: number): THREE.BufferGeometry {
  const b = new VoxelBuilder(1, seed)
  const rng = new RNG(seed)
  if (kind === 'oak') {
    const h = rng.range(5, 8)
    b.span(-0.5, 0, -0.5, 0.5, h, 0.5, '#6a4a2e', 'bark')
    const leaf = rng.pick(['#4f7a32', '#5a8a3a', '#46702c'])
    b.box(0, h, 0, 5, 3, 5, leaf, 'leaves', { jitter: 0.05 })
    b.box(0, h + 2, 0, 3.2, 2, 3.2, leaf, 'leaves', { jitter: 0.05 })
    b.box(rng.range(-1, 1), h - 1, rng.range(-1, 1), 3.5, 1.5, 3.5, leaf, 'leaves', { jitter: 0.05 })
  } else if (kind === 'pine') {
    const h = rng.range(8, 13)
    b.span(-0.45, 0, -0.45, 0.45, h, 0.45, '#5a3a24', 'bark')
    const leaf = '#2f5a32'
    for (let i = 0; i < 5; i++) {
      const s = 5 - i * 0.9
      b.box(0, h * 0.35 + i * (h * 0.14), 0, s, h * 0.14, s, leaf, 'leaves', { jitter: 0.05 })
    }
  } else {
    // 巨大树: ~80 m giant trees with massive trunks and branch stubs for hooks
    const h = rng.range(72, 90)
    const r = rng.range(2.8, 3.6)
    b.span(-r, 0, -r, r, h, r, '#6b4a30', 'bark', { jitter: 0.02 })
    // root flares
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.box(x * (r + 1), 2.5, z * (r + 1), x ? 2.5 : 3, 5, z ? 2.5 : 3, '#5e4028', 'bark')
    // branches
    for (let i = 0; i < 7; i++) {
      const y = h * rng.range(0.35, 0.85)
      const a = rng.range(0, Math.PI * 2)
      const len = rng.range(8, 16)
      const m = new THREE.Matrix4().makeRotationY(a).setPosition(Math.cos(a) * 0, y, 0)
      b.box(len / 2 + r * 0.6, 0, 0, len, 1.6, 1.6, '#5e4028', 'bark', { m })
      b.box(len + r * 0.6, 1.5, 0, 7, 3, 7, '#3f6a2e', 'leaves', { m, jitter: 0.05 })
    }
    const leaf = '#3a6a2c'
    b.box(0, h, 0, 26, 8, 26, leaf, 'leaves', { jitter: 0.04 })
    b.box(0, h + 6, 0, 18, 6, 18, '#457a34', 'leaves', { jitter: 0.04 })
    b.box(rng.range(-4, 4), h - 6, rng.range(-4, 4), 20, 5, 20, leaf, 'leaves', { jitter: 0.04 })
  }
  return b.build()
}

/** Garrison wall cannon on a wooden carriage. Barrel pivot faces +z. */
export function buildCannon(level: number) {
  const base = new VoxelBuilder(1, 3)
  const wood = level >= 3 ? '#4a3a2a' : '#6a4a2e'
  base.span(-1.1, 0, -1.6, 1.1, 0.6, 1.6, wood, 'plank')
  base.span(-1.1, 0.6, -1.4, -0.7, 1.6, 1.0, wood, 'plank')
  base.span(0.7, 0.6, -1.4, 1.1, 1.6, 1.0, wood, 'plank')
  for (const x of [-1.2, 1.2]) for (const z of [-1.1, 1.1]) base.span(x - 0.2, 0, z - 0.45, x + 0.2, 0.9, z + 0.45, '#3a2a1a', 'plank')
  const barrel = new VoxelBuilder(1, 4)
  barrel.span(-0.45, -0.45, -1.4, 0.45, 0.45, 2.2 + level * 0.3, '#2e3236', 'metal')
  barrel.span(-0.55, -0.55, 1.9 + level * 0.3, 0.55, 0.55, 2.4 + level * 0.3, '#3a3e42', 'metal')
  barrel.span(-0.55, -0.55, -1.6, 0.55, 0.55, -1.1, '#3a3e42', 'metal')
  barrel.span(-0.15, -0.15, -1.9, 0.15, 0.15, -1.6, '#3a3e42', 'metal')
  const g = new THREE.Group()
  const bm = base.mesh()
  g.add(bm)
  const pivot = new THREE.Group()
  pivot.position.set(0, 1.35, 0)
  pivot.add(barrel.mesh())
  g.add(pivot)
  return { group: g, pivot }
}

/** Fixed ballista: wooden bow-frame with a huge steel bolt. */
export function buildBallista(level: number) {
  const base = new VoxelBuilder(1, 5)
  base.span(-1.2, 0, -1.2, 1.2, 0.5, 1.2, '#5a3e26', 'plank')
  base.span(-0.3, 0.5, -0.3, 0.3, 1.6, 0.3, '#5a3e26', 'plank')
  const top = new VoxelBuilder(1, 6)
  top.span(-0.35, -0.25, -2.4, 0.35, 0.25, 2.4, '#6a4a2e', 'plank')
  top.span(-3 - level * 0.2, -0.15, 1.4, 3 + level * 0.2, 0.15, 1.8, '#4a3220', 'plank')
  top.span(-3.2 - level * 0.2, -0.3, 1.2, -2.8 - level * 0.2, 0.3, 1.9, '#3a3a3a', 'metal')
  top.span(2.8 + level * 0.2, -0.3, 1.2, 3.2 + level * 0.2, 0.3, 1.9, '#3a3a3a', 'metal')
  top.span(-0.12, 0.25, -2.4, 0.12, 0.45, 3.2, '#b8c0c8', 'metal') // bolt
  top.span(-0.3, 0.2, 3.0, 0.3, 0.5, 3.6, '#d0d8e0', 'metal')
  const g = new THREE.Group()
  g.add(base.mesh())
  const pivot = new THREE.Group()
  pivot.position.set(0, 1.8, 0)
  pivot.add(top.mesh())
  g.add(pivot)
  return { group: g, pivot }
}

export function buildWatchtower(level: number) {
  const b = new VoxelBuilder(1, 7)
  const H = 12 + level * 3
  const wood = '#6a4a2e'
  for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) b.span(x - 0.25, 0, z - 0.25, x + 0.25, H, z + 0.25, wood, 'plank')
  for (let y = 3; y < H; y += 3) {
    b.span(-1.8, y, -2, 1.8, y + 0.25, -1.6, wood, 'plank')
    b.span(-1.8, y, 1.6, 1.8, y + 0.25, 2, wood, 'plank')
  }
  b.span(-2.6, H, -2.6, 2.6, H + 0.4, 2.6, '#7a5a3a', 'plank')
  for (const s of [-1, 1]) {
    b.span(-2.6, H + 0.4, s * 2.6 - 0.15, 2.6, H + 1.4, s * 2.6 + 0.15, wood, 'plank')
    b.span(s * 2.6 - 0.15, H + 0.4, -2.6, s * 2.6 + 0.15, H + 1.4, 2.6, wood, 'plank')
  }
  for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) b.span(x - 0.15, H + 0.4, z - 0.15, x + 0.15, H + 3.6, z + 0.15, wood, 'plank')
  for (let i = 0; i < 4; i++) b.span(-3 + i * 0.5, H + 3.6 + i * 0.5, -3 + i * 0.5, 3 - i * 0.5, H + 4.1 + i * 0.5, 3 - i * 0.5, '#8a3a2a', 'tile')
  b.span(-0.5, H + 2, -0.5, 0.5, H + 3, 0.5, '#b08a3a', 'metal') // alarm bell
  return b.mesh()
}

export function buildTrap(level: number, armed: boolean) {
  const b = new VoxelBuilder(1, 8)
  const r = 4 + level
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    b.span(x - 0.3, 0, z - 0.3, x + 0.3, 2.2, z + 0.3, '#5a3e26', 'plank')
    b.span(x - 0.5, 1.4, z - 0.5, x + 0.5, 2.0, z + 0.5, '#3a3a3a', 'metal') // harpoon launcher
  }
  if (armed) for (let i = 0; i < 6; i++) b.span(-r + i * (r / 3), 0.05, -r, -r + i * (r / 3) + 0.12, 0.15, r, '#9a9a9a', 'metal')
  b.span(-0.8, 0, -0.8, 0.8, 1, 0.8, '#6a5a3a', 'plank')
  return b.mesh(true, true)
}

export function buildRepairStation(level: number) {
  const b = new VoxelBuilder(1, 9)
  const wood = '#7a5232'
  b.span(-3, 0, -2, 3, 1.1, 2, wood, 'plank') // workbench
  for (const x of [-3.5, 3.5]) b.span(x - 0.2, 0, -2.5, x + 0.2, 6 + level, -2.1, wood, 'plank')
  b.span(-3.7, 6 + level, -2.5, 3.7, 6.4 + level, -2.1, wood, 'plank') // crane beam
  b.span(1.8, 3 + level, -2.4, 1.95, 6 + level, -2.25, '#9a9a9a', 'metal')
  b.span(1.2, 2.2 + level, -2.9, 2.6, 3 + level, -1.8, '#888', 'brick')
  for (let i = 0; i < 4; i++) b.span(-2.6 + i * 1.1, 1.1, -1.5, -1.8 + i * 1.1, 1.9, -0.6, '#cfc4ae', 'brick')
  b.span(1, 1.1, 0.3, 2.6, 1.4, 1.5, '#5a5a5a', 'metal')
  b.span(-0.2, 0, 2.2, 3, 2.2, 3.4, '#8a6038', 'plank')
  return b.mesh()
}

export function buildBarracks(level: number) {
  const b = new VoxelBuilder(1, 10)
  const tents = 1 + level
  for (let t = 0; t < tents; t++) {
    const x0 = -6 + t * 5
    for (let i = 0; i < 5; i++) b.span(x0 - 2 + i * 0.4, i * 0.7, -3, x0 + 2 - i * 0.4, (i + 1) * 0.7, 3, t % 2 ? '#d8cdb0' : '#c8bc9c', 'cloth')
    b.span(x0 - 0.5, 0, 3, x0 + 0.5, 2.6, 3.1, '#3a2a1a')
  }
  b.span(5, 0, 2.5, 5.2, 9, 2.7, '#3a3a3a', 'metal')
  b.span(5.2, 6.8, 2.55, 8, 8.8, 2.65, '#2e5a3a', 'cloth')
  b.span(-7, 0, -4.5, 7, 0.15, 4.5, '#7a6a4a', 'plank')
  b.span(1, 0.15, -4, 4, 1.2, -3, '#6a4a2e', 'plank') // weapon rack
  return b.mesh()
}

/** Second defence ring: stone revetment with cheval-de-frise stakes, built as a 24m arc piece. */
export function buildInnerLine(level: number, state: 0 | 1 | 2) {
  const b = new VoxelBuilder(1, 12)
  const rng = new RNG(level * 7 + state)
  const n = 9
  for (let i = 0; i < n; i++) {
    const x = -12 + i * 3
    if (state === 2 && rng.chance(0.6)) {
      b.box(x, 0.5, rng.range(-1, 1), 2, 1, 1.5, '#8f8a80', 'brick')
      continue
    }
    const h = (state === 1 ? rng.range(1.5, 3) : 3) + level * 0.6
    b.span(x - 1.45, 0, -0.9, x + 1.45, h, 0.9, '#a49a86', 'brick')
    for (let k = -1; k <= 1; k += 2) {
      const m = new THREE.Matrix4().makeRotationX(k * 0.7).setPosition(x, 1.2, k * -1.6)
      b.box(0, 0, 0, 0.25, 0.25, 3.4, '#6a4a2e', 'plank', { m })
    }
  }
  return b.mesh()
}

export function buildRock(seed: number) {
  const b = new VoxelBuilder(1, seed)
  const rng = new RNG(seed)
  for (let i = 0; i < 6; i++) b.box(rng.range(-0.8, 0.8), rng.range(-0.8, 0.8), rng.range(-0.8, 0.8), rng.range(1.2, 2.2), rng.range(1.2, 2.2), rng.range(1.2, 2.2), rng.pick(['#8a857a', '#76726a', '#9a958a']), 'cobble')
  return b.build()
}

/** Hange's capture net: ring of harpoons + steel cable dome (shown when titans are restrained). */
export function buildCaptureNet() {
  const b = new VoxelBuilder(1, 14)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const m = new THREE.Matrix4().makeRotationY(-a).setPosition(Math.cos(a) * 9, 0, Math.sin(a) * 9)
    b.box(0, 1, 0, 0.6, 2, 0.6, '#3a3a3a', 'metal', { m })
    b.box(-4.5, 6, 0, 9, 0.12, 0.12, '#c8c8c8', 'metal', { m: m.clone().multiply(new THREE.Matrix4().makeRotationZ(-0.9)) })
  }
  return b.mesh(false, false)
}

/** Mountains ring on the horizon (blocky). */
export function buildHorizon(radius: number, seed = 99) {
  const b = new VoxelBuilder(16, seed)
  const rng = new RNG(seed)
  const n = 90
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = radius + rng.range(-60, 60)
    const h = rng.range(40, 160)
    const w = rng.range(70, 140)
    const m = new THREE.Matrix4().makeRotationY(-a).setPosition(Math.cos(a) * r, 0, Math.sin(a) * r)
    const c = new THREE.Color().setHSL(0.3 - rng.range(0, 0.06), 0.18, 0.32 + rng.range(-0.04, 0.05))
    b.box(0, h / 2, 0, 50, h, w, c, 'grass', { m })
    b.box(0, h * 0.75, 0, 36, h * 0.6, w * 0.7, c.clone().multiplyScalar(0.9), 'grass', { m })
    if (h > 120) b.box(0, h + 6, 0, 26, 12, w * 0.4, '#e8eef2', 'plain', { m })
  }
  return b.mesh(false, false)
}
