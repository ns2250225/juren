import * as THREE from 'three'
import type { MapDef } from '../../data/maps'
import type { CollisionWorld, Collider } from '../core/Collision'
import { buildWallSegment, buildGateDoor, type BState } from '../models/BuildingModels'
import { getMaterials } from '../models/VoxelBuilder'
import { RNG } from '../../utils/math'

export class Gate {
  hp: number
  state: BState = 0
  mesh: THREE.Mesh
  collider: Collider | null = null
  meshes: THREE.BufferGeometry[]
  constructor(public seg: WallSegment, public maxHp: number) {
    this.hp = maxHp
    this.meshes = [buildGateDoor(0), buildGateDoor(1), buildGateDoor(2)]
    this.mesh = new THREE.Mesh(this.meshes[0], getMaterials())
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.position.copy(seg.mid)
    this.mesh.rotation.y = seg.yaw
    this.mesh.translateZ(-seg.thick / 2 + 1.2)
  }
  get open() {
    return this.state === 2
  }
}

export class WallSegment {
  hp: number
  maxHp: number
  state: BState = 0
  mesh: THREE.Mesh
  geos: (THREE.BufferGeometry | null)[] = [null, null, null]
  colliders: Collider[] = []
  gate: Gate | null = null
  mid: THREE.Vector3
  dir: THREE.Vector3
  out: THREE.Vector3
  len: number
  yaw: number
  outside: THREE.Vector3
  inside: THREE.Vector3
  top: THREE.Vector3
  /** number of titans currently pounding it */
  attackers = 0
  lastHit = -99
  warnT = -99

  constructor(public index: number, p0: THREE.Vector3, p1: THREE.Vector3, public height: number, public thick: number, public breakable: boolean, isGate: boolean, public stone: string, center: THREE.Vector3, public seed: number) {
    this.mid = p0.clone().add(p1).multiplyScalar(0.5)
    this.dir = p1.clone().sub(p0)
    this.len = this.dir.length()
    this.dir.normalize()
    this.yaw = Math.atan2(-this.dir.z, this.dir.x)
    this.out = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    // ensure outward normal points away from the defended side
    const toMid = this.mid.clone().sub(center)
    if (this.out.dot(toMid) < 0) {
      this.dir.negate()
      this.yaw = Math.atan2(-this.dir.z, this.dir.x)
      this.out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    }
    this.maxHp = breakable ? 2600 : 1e9
    this.hp = this.maxHp
    this.outside = this.mid.clone().addScaledVector(this.out, thick / 2 + 4)
    this.inside = this.mid.clone().addScaledVector(this.out, -(thick / 2 + 8))
    this.top = this.mid.clone().setY(height)
    this.geos[0] = buildWallSegment(this.spec(isGate), 0)
    this.mesh = new THREE.Mesh(this.geos[0]!, getMaterials())
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.position.copy(this.mid)
    this.mesh.rotation.y = this.yaw
  }

  spec(isGate: boolean) {
    return { len: this.len, height: this.height, thick: this.thick, stone: this.stone, seed: this.seed, gate: isGate }
  }

  get isGate() {
    return !!this.gate
  }
  /** passable for titans */
  get open() {
    return this.state === 2 || (this.gate !== null && this.gate.open)
  }
  get hpFrac() {
    return this.hp / this.maxHp
  }
}

/**
 * Builds and owns the city walls. District maps: semicircular outer wall plus a straight inner
 * wall (Wall Maria/Rose) holding the inner gate. Line maps: one long straight wall with a gate.
 */
export class WallSystem {
  segments: WallSegment[] = []
  breakable: WallSegment[] = []
  gate!: Gate
  center: THREE.Vector3
  group = new THREE.Group()
  innerWallZ = 0

  constructor(private map: MapDef, private scene: THREE.Scene, private collision: CollisionWorld) {
    const rng = new RNG(map.seed)
    const H = map.wallHeight, T = map.wallThickness
    const stone = () => rng.pick(map.wallPalette)
    if (map.layout === 'district') {
      this.center = new THREE.Vector3(0, 0, 0)
      const R = map.radius
      const N = map.segments | 1
      const gateIdx = (N - 1) / 2
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI
        // overlap a little so segments meet without gaps on the outer face
        const r = R / Math.cos(Math.PI / (2 * N))
        const p0 = new THREE.Vector3(Math.cos(a0) * r, 0, Math.sin(a0) * r)
        const p1 = new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r)
        const ext = p1.clone().sub(p0).normalize().multiplyScalar(T * 0.35)
        p0.sub(ext)
        p1.add(ext)
        const seg = new WallSegment(i, p0, p1, H, T, true, i === gateIdx, stone(), this.center, map.seed + i * 7)
        this.segments.push(seg)
      }
      // inner wall (indestructible) along z = 0, with the inner gate (core) in the middle
      const W = R + 700
      const pieces: [number, number][] = [[-W, -R - 2], [-R - 2, -16], [16, R + 2], [R + 2, W]]
      for (const [x0, x1] of pieces) {
        const seg = new WallSegment(this.segments.length, new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x1, 0, 0), H, T + 1, false, false, stone(), new THREE.Vector3(0, 0, -100), map.seed + x0)
        this.segments.push(seg)
      }
      // lintel over the inner gate
      const lin = new WallSegment(this.segments.length, new THREE.Vector3(-16, 0, 0), new THREE.Vector3(16, 0, 0), H, T + 1, false, true, stone(), new THREE.Vector3(0, 0, -100), map.seed + 99)
      this.segments.push(lin)
      this.innerWallZ = 0
    } else {
      this.center = new THREE.Vector3(0, 0, -400)
      const L = map.radius
      const N = map.segments | 1
      const segLen = (2 * L) / N
      const gateIdx = (N - 1) / 2
      for (let i = 0; i < N; i++) {
        const x0 = -L + i * segLen - 0.2, x1 = x0 + segLen + 0.4
        this.segments.push(new WallSegment(i, new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x1, 0, 0), H, T, true, i === gateIdx, stone(), this.center, map.seed + i * 7))
      }
      for (const [x0, x1] of [[-L - 900, -L], [L, L + 900]] as const)
        this.segments.push(new WallSegment(this.segments.length, new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x1, 0, 0), H, T, false, false, stone(), this.center, map.seed + x0))
    }
    for (const s of this.segments) {
      if (s.breakable) this.breakable.push(s)
      this.group.add(s.mesh)
    }
    const gseg = this.segments.find((s) => s.breakable && s.geos[0] && s.index === ((map.segments | 1) - 1) / 2)!
    this.gate = new Gate(gseg, 1700)
    gseg.gate = this.gate
    gseg.maxHp = 1e9
    gseg.hp = 1e9
    this.group.add(this.gate.mesh)
    scene.add(this.group)
    for (const s of this.segments) this.rebuildColliders(s)
    this.rebuildGateCollider()
  }

  rebuildColliders(s: WallSegment) {
    for (const c of s.colliders) this.collision.remove(c)
    s.colliders.length = 0
    const H = s.height, T = s.thick
    const add = (lx: number, ly: number, w: number, h: number) => {
      const p = s.mid.clone().addScaledVector(s.dir, lx)
      s.colliders.push(this.collision.add({ x: p.x, y: ly, z: p.z, w, h, d: T + 1.2, yaw: s.yaw, kind: 'wall', owner: s }))
    }
    if (s.gate) {
      const gw = 16, gh = 22
      const side = (s.len - gw) / 2
      add(-(gw / 2 + side / 2), H / 2, side, H)
      add(gw / 2 + side / 2, H / 2, side, H)
      add(0, (gh + H) / 2, gw, H - gh)
    } else if (s.state === 2) {
      const hw = 20, hh = 26
      const side = (s.len - hw) / 2
      add(-(hw / 2 + side / 2), H / 2, side, H)
      add(hw / 2 + side / 2, H / 2, side, H)
      add(0, (hh + H) / 2, hw, H - hh)
    } else add(0, H / 2, s.len, H)
    // parapet on the outer edge so the player doesn't slide off the top too easily
    const pp = s.mid.clone().addScaledVector(s.out, T / 2 + 0.1)
    s.colliders.push(this.collision.add({ x: pp.x, y: H + 0.7, z: pp.z, w: s.len, h: 1.4, d: 1, yaw: s.yaw, kind: 'wall', owner: s }))
  }

  rebuildGateCollider() {
    const g = this.gate
    if (g.collider) this.collision.remove(g.collider)
    g.collider = null
    if (g.state < 2) {
      const s = g.seg
      g.collider = this.collision.add({ x: s.mid.x, y: 11, z: s.mid.z, w: 16, h: 22, d: s.thick, yaw: s.yaw, kind: 'gate', owner: g })
    }
  }

  /** swap mesh for new state */
  setSegmentState(s: WallSegment, st: BState) {
    if (s.state === st) return
    s.state = st
    if (!s.geos[st]) s.geos[st] = buildWallSegment(s.spec(s.isGate), st)
    s.mesh.geometry = s.geos[st]!
    this.rebuildColliders(s)
  }

  setGateState(st: BState) {
    const g = this.gate
    if (g.state === st) return
    g.state = st
    g.mesh.geometry = g.meshes[st]
    this.rebuildGateCollider()
  }

  isInside(x: number, z: number): boolean {
    if (this.map.layout === 'district') {
      const r = this.map.radius - this.map.wallThickness / 2
      return z > this.map.wallThickness / 2 && x * x + z * z < r * r
    }
    return z < -this.map.wallThickness / 2
  }
  /** outside, in titan territory */
  isOutside(x: number, z: number): boolean {
    if (this.map.layout === 'district') {
      const r = this.map.radius + this.map.wallThickness / 2
      return z > 0 && x * x + z * z > r * r
    }
    return z > this.map.wallThickness / 2
  }

  /** the wall-top walkway position closest to a point */
  nearestSegment(p: THREE.Vector3, breakableOnly = true): WallSegment {
    let best = this.segments[0], bd = Infinity
    for (const s of breakableOnly ? this.breakable : this.segments) {
      const d = s.mid.distanceToSquared(p)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }

  integrity() {
    let hp = 0, max = 0
    for (const s of this.breakable) {
      if (s.gate) continue
      hp += s.hp
      max += s.maxHp
    }
    return max ? hp / max : 1
  }

  dispose() {
    this.scene.remove(this.group)
    for (const s of this.segments) s.geos.forEach((g) => g?.dispose())
    this.gate.meshes.forEach((g) => g.dispose())
  }
}
