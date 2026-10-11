import * as THREE from 'three'
import type { MapDef } from '../../data/maps'
import type { CollisionWorld, Collider } from '../core/Collision'
import { RNG } from '../../utils/math'
import { getMaterials } from '../models/VoxelBuilder'
import { getPattern } from '../../utils/textures'
import {
  buildHouse, buildBellTower, buildHQ, buildSupply, buildCoreGate, houseHeight, roofHeight,
  HOUSE_DIMS, type HouseKind, type HouseSpec, type BState,
} from '../models/BuildingModels'
import { buildTree } from '../models/PropModels'
import type { WallSystem } from './WallSystem'
import { NavGrid } from './NavGrid'
import type { SlotKind } from '../../data/defenses'

export type BuildingKind = 'house' | 'tower' | 'hq' | 'supply' | 'core'

interface Template {
  spec: HouseSpec
  meshes: THREE.InstancedMesh[]
  count: number
  cap: number
}

export class Building {
  hp: number
  state: BState = 0
  colliders: Collider[] = []
  tpl: Template | null = null
  inst = -1
  mesh: THREE.Mesh | null = null
  geos: THREE.BufferGeometry[] = []
  fire = 0
  burning = 0
  lastHit = -99
  attackers = 0
  constructor(public id: number, public kind: BuildingKind, public x: number, public z: number, public yaw: number, public w: number, public d: number, public h: number, public maxHp: number, public roofH = 0) {
    this.hp = maxHp
  }
  get pos() {
    return new THREE.Vector3(this.x, 0, this.z)
  }
  get radius() {
    return Math.max(this.w, this.d) / 2
  }
  get alive() {
    return this.state < 2
  }
}

export interface Slot {
  id: number
  kind: SlotKind
  pos: THREE.Vector3
  yaw: number
  /** facing outward (for wall weapons) */
  out: THREE.Vector3
  segIndex: number
}

export interface TreeInfo {
  x: number
  z: number
  r: number
  h: number
  giant: boolean
}

export class CityManager {
  buildings: Building[] = []
  houses: Building[] = []
  templates: Template[] = []
  slots: Slot[] = []
  trees: TreeInfo[] = []
  core!: Building
  supplyDepots: Building[] = []
  hq!: Building
  tower: Building | null = null
  group = new THREE.Group()
  nav!: NavGrid
  wanderPoints: THREE.Vector3[] = []
  safePoint = new THREE.Vector3()
  playerStart = new THREE.Vector3()
  playerStartYaw = 0
  respawnPoint = new THREE.Vector3()
  private nextId = 1
  private m4 = new THREE.Matrix4()
  private zero = new THREE.Matrix4().makeScale(0, 0, 0)
  private reserved: { x: number; z: number; r: number }[] = []

  constructor(public map: MapDef, private scene: THREE.Scene, private collision: CollisionWorld, private walls: WallSystem) {
    const rng = new RNG(map.seed * 3 + 1)
    this.buildGround()
    this.placeLandmarks(rng)
    this.placeSlots(rng)
    this.placeHouses(rng)
    this.placeTrees(rng)
    this.finalizeInstances()
    scene.add(this.group)
    // nav grid over the defended area
    if (map.layout === 'district') this.nav = new NavGrid(-map.radius, 0, map.radius, map.radius, collision, (x, z) => walls.isInside(x, z))
    else this.nav = new NavGrid(-map.radius, -260, map.radius, 0, collision, (x, z) => walls.isInside(x, z) && z > -255)
    for (let i = 0; i < 160 && this.wanderPoints.length < 60; i++) {
      const p = this.randomInsidePoint(rng)
      if (p && this.nav.isFree(p.x, p.z)) this.wanderPoints.push(p)
    }
  }

  private reserve(x: number, z: number, r: number) {
    this.reserved.push({ x, z, r })
  }
  private isReserved(x: number, z: number, r: number) {
    return this.reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r)
  }

  randomInsidePoint(rng: RNG = new RNG((Math.random() * 1e9) | 0)): THREE.Vector3 | null {
    const m = this.map
    for (let i = 0; i < 30; i++) {
      const p = m.layout === 'district'
        ? new THREE.Vector3(rng.range(-m.radius, m.radius), 0, rng.range(10, m.radius))
        : new THREE.Vector3(rng.range(-m.radius + 10, m.radius - 10), 0, rng.range(-240, -15))
      if (this.walls.isInside(p.x, p.z)) return p
    }
    return null
  }

  private buildGround() {
    const m = this.map
    const tex = getPattern('cobble').clone()
    tex.needsUpdate = true
    let geo: THREE.BufferGeometry
    if (m.layout === 'district') {
      geo = new THREE.CircleGeometry(m.radius + 2, 72, Math.PI, Math.PI)
      tex.repeat.set(m.radius / 2, m.radius / 2)
    } else {
      geo = new THREE.PlaneGeometry(m.radius * 2 + 40, 300)
      geo.translate(0, 150, 0)
      tex.repeat.set((m.radius * 2 + 40) / 2, 150)
    }
    // repeat via uv scale
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getY(i) / 2)
    tex.repeat.set(1, 1)
    const mat = new THREE.MeshLambertMaterial({ color: '#a8a296', map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    const g = new THREE.Mesh(geo, mat)
    g.rotation.x = -Math.PI / 2
    g.position.y = 0.02
    g.receiveShadow = true
    this.group.add(g)
    // dirt road outside the gate
    const gate = this.walls.gate.seg
    const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 420), new THREE.MeshLambertMaterial({ color: '#8a7656', map: getPattern('plain') }))
    road.rotation.x = -Math.PI / 2
    road.rotation.z = -gate.yaw
    road.position.copy(gate.mid).addScaledVector(gate.out, 215).setY(0.03)
    road.receiveShadow = true
    this.group.add(road)
  }

  private addUnique(b: Building, geos: THREE.BufferGeometry[]) {
    b.geos = geos
    b.mesh = new THREE.Mesh(geos[0], getMaterials())
    b.mesh.castShadow = true
    b.mesh.receiveShadow = true
    b.mesh.position.set(b.x, 0, b.z)
    b.mesh.rotation.y = b.yaw
    this.group.add(b.mesh)
    this.buildings.push(b)
    this.setColliders(b)
  }

  private placeLandmarks(rng: RNG) {
    const m = this.map
    if (m.layout === 'district') {
      const R = m.radius
      // inner gate (core) on the inner wall
      this.core = new Building(this.nextId++, 'core', 0, 5, 0, 28, 10, 30, m.coreHP)
      this.addUnique(this.core, [buildCoreGate(0, 'gate'), buildCoreGate(1, 'gate'), buildCoreGate(2, 'gate')])
      this.core.mesh!.position.z = 5
      this.reserve(0, 14, 22)
      this.safePoint.set(0, 0, 22)
      // avenue gate→core
      for (let z = 20; z < R; z += 10) this.reserve(0, z, 8)
      // plaza + bell tower
      const pz = R * 0.52
      this.reserve(0, pz, 20)
      const tw = new Building(this.nextId++, 'tower', 26, pz - 18, 0, 10, 24, 28, 1200)
      this.addUnique(tw, [buildBellTower(0), buildBellTower(1), buildBellTower(2)])
      this.tower = tw
      this.reserve(26, pz - 12, 14)
      this.reserve(26, pz, 10)
      // garrison HQ
      this.hq = new Building(this.nextId++, 'hq', -38, 34, 0, 16, 12, 16, 1500)
      this.addUnique(this.hq, [buildHQ(0), buildHQ(1), buildHQ(2)])
      this.reserve(-38, 34, 14)
      // supply depots: near HQ and inside the outer gate
      const s1 = new Building(this.nextId++, 'supply', 36, 32, 0, 12, 10, 6, 600)
      this.addUnique(s1, [buildSupply(0), buildSupply(1), buildSupply(2)])
      this.reserve(36, 32, 10)
      const s2 = new Building(this.nextId++, 'supply', 22, R - 34, Math.PI, 12, 10, 6, 600)
      this.addUnique(s2, [buildSupply(0, 12), buildSupply(1, 12), buildSupply(2, 12)])
      this.reserve(22, R - 34, 10)
      this.supplyDepots.push(s1, s2)
      // inside gate square
      this.reserve(0, R - 22, 16)
      this.respawnPoint.set(-38, 18, 34)
    } else {
      this.core = new Building(this.nextId++, 'core', 0, -120, 0, 24, 20, 24, m.coreHP)
      this.addUnique(this.core, [buildCoreGate(0, 'fort'), buildCoreGate(1, 'fort'), buildCoreGate(2, 'fort')])
      this.reserve(0, -120, 26)
      this.safePoint.set(0, 0, -96)
      for (let z = -20; z > -100; z -= 10) this.reserve(0, z, 8)
      this.hq = new Building(this.nextId++, 'hq', -50, -60, 0, 16, 12, 16, 1500)
      this.addUnique(this.hq, [buildHQ(0), buildHQ(1), buildHQ(2)])
      this.reserve(-50, -60, 14)
      const s1 = new Building(this.nextId++, 'supply', 40, -45, 0, 12, 10, 6, 600)
      this.addUnique(s1, [buildSupply(0), buildSupply(1), buildSupply(2)])
      this.reserve(40, -45, 10)
      const s2 = new Building(this.nextId++, 'supply', -30, -24, Math.PI, 12, 10, 6, 600)
      this.addUnique(s2, [buildSupply(0, 12), buildSupply(1, 12), buildSupply(2, 12)])
      this.reserve(-30, -24, 10)
      this.supplyDepots.push(s1, s2)
      const tw = new Building(this.nextId++, 'tower', 70, -150, 0, 10, 24, 28, 1200)
      this.addUnique(tw, [buildBellTower(0), buildBellTower(1), buildBellTower(2)])
      this.tower = tw
      this.reserve(70, -144, 14)
      this.reserve(70, -132, 10)
      this.reserve(0, -22, 16)
      this.respawnPoint.set(-50, 18, -60)
    }
    const gs = this.walls.gate.seg
    this.playerStart.copy(gs.mid).setY(gs.height + 1).addScaledVector(gs.out, -1.5)
    this.playerStartYaw = Math.atan2(gs.out.x, gs.out.z)
    void rng
  }

  private placeSlots(rng: RNG) {
    const m = this.map
    let id = 0
    const gate = this.walls.gate.seg
    // wall slots: every other breakable segment, ordered by distance to the gate
    const segs = this.walls.breakable.filter((s) => !s.gate).sort((a, b) => a.mid.distanceTo(gate.mid) - b.mid.distanceTo(gate.mid))
    const used = new Set<number>()
    for (const s of segs) {
      if (used.has(s.index - 1) || used.has(s.index + 1)) continue
      used.add(s.index)
      for (const off of [-s.len * 0.22, s.len * 0.22]) {
        const p = s.mid.clone().addScaledVector(s.dir, off).addScaledVector(s.out, 0.5).setY(s.height)
        this.slots.push({ id: id++, kind: 'wall', pos: p, yaw: Math.atan2(s.out.x, s.out.z), out: s.out.clone(), segIndex: s.index })
      }
    }
    // ground slots inside
    const ground: [number, number][] = m.layout === 'district'
      ? [[-14, m.radius - 24], [14, m.radius - 14], [-22, m.radius * 0.52], [16, m.radius * 0.52 + 10], [-60, 40], [56, 52], [-70, m.radius * 0.45], [70, m.radius * 0.45], [-16, 40], [16, 44]]
      : [[-20, -24], [20, -24], [-80, -40], [80, -40], [-40, -90], [40, -90], [-120, -60], [120, -60], [0, -60], [-150, -30]]
    for (const [x, z] of ground) {
      this.reserve(x, z, 7)
      this.slots.push({ id: id++, kind: 'ground', pos: new THREE.Vector3(x, 0, z), yaw: 0, out: gate.out.clone(), segIndex: -1 })
    }
    // trap slots: outside in front of the gate and along the wall, plus inside the gate
    const tr: THREE.Vector3[] = []
    for (const lat of [-34, 0, 34]) for (const dist of [30, 70]) tr.push(gate.mid.clone().addScaledVector(gate.out, dist).addScaledVector(gate.dir, lat))
    tr.push(gate.mid.clone().addScaledVector(gate.out, -26))
    for (const s of [segs[3], segs[4], segs[7], segs[8]]) if (s) tr.push(s.mid.clone().addScaledVector(s.out, 30))
    for (const p of tr) {
      p.y = 0
      this.reserve(p.x, p.z, 8)
      this.slots.push({ id: id++, kind: 'trap', pos: p, yaw: 0, out: gate.out.clone(), segIndex: -1 })
    }
    // core (inner defence line)
    const cp = m.layout === 'district' ? new THREE.Vector3(0, 0, 30) : new THREE.Vector3(0, 0, -92)
    this.slots.push({ id: id++, kind: 'core', pos: cp, yaw: 0, out: gate.out.clone(), segIndex: -1 })
    void rng
  }

  private template(kind: HouseKind, rng: RNG, floorsAdd: number): Template {
    const existing = this.templates.filter((t) => t.spec.kind === kind && t.spec.floors === HOUSE_DIMS[kind].floors + floorsAdd)
    if (existing.length >= 2 && rng.chance(0.85)) return rng.pick(existing)
    const d = HOUSE_DIMS[kind]
    const spec: HouseSpec = {
      kind, w: d.w, d: d.d, floors: d.floors + floorsAdd, roof: rng.pick(this.map.roofPalette), wall: rng.pick(['#e9e0cc', '#e2d6bc', '#efe8d8', '#d8ccb0', '#e6dcc4', '#d2c4a4']),
      timber: rng.pick(['#4a3020', '#3a2618', '#5a3a24']), shutter: rng.pick(['#3a5a3a', '#5a3a2a', '#3a4a5a', '#6a5a3a']), seed: this.templates.length * 97 + this.map.seed,
    }
    const t: Template = { spec, meshes: [], count: 0, cap: 0 }
    this.templates.push(t)
    return t
  }

  private placeHouses(rng: RNG) {
    const m = this.map
    const B = m.block, S = m.street
    const q = (B - S) / 2
    const kinds: HouseKind[] = ['cottage', 'town', 'wide', 'shop', 'tall']
    const xR = m.radius
    const zA = m.layout === 'district' ? 0 : -250, zB = m.layout === 'district' ? m.radius : -12
    for (let bx = -xR; bx < xR; bx += B)
      for (let bz = zA; bz < zB; bz += B) {
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            if (!rng.chance(m.density)) continue
            const cx = bx + B / 2 + sx * (q / 2), cz = bz + B / 2 + sz * (q / 2)
            // must be well inside walls
            const margin = 11
            const ok = [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([ox, oz]) => {
              const x = cx + ox * (q / 2 + margin * 0.5), z = cz + oz * (q / 2 + margin * 0.5)
              if (m.layout === 'district') return this.walls.isInside(x, z) && Math.hypot(x, z) < m.radius - margin && z > 14
              return this.walls.isInside(x, z) && z < -margin && Math.abs(x) < m.radius - margin
            })
            if (!ok || this.isReserved(cx, cz, q / 2)) continue
            const faceX = rng.chance(0.5)
            const yaw = faceX ? (sx > 0 ? Math.PI / 2 : -Math.PI / 2) : sz > 0 ? 0 : Math.PI
            const fits = kinds.filter((k) => {
              const d = HOUSE_DIMS[k]
              return d.w <= q + 0.6 && d.d <= q + 0.6
            })
            if (!fits.length) continue
            const kind = rng.pick(fits)
            const add = rng.int(m.floors[0], m.floors[1]) - 2
            const tpl = this.template(kind, rng, Math.max(0, kind === 'tall' ? add - 1 : add))
            const s = tpl.spec
            const hgt = houseHeight(s)
            const rh = roofHeight(s)
            const maxHp = 220 + s.floors * 90 + s.w * s.d * 2
            const b = new Building(this.nextId++, 'house', cx, cz, yaw, s.w, s.d, hgt, maxHp, rh)
            b.tpl = tpl
            b.inst = tpl.count++
            this.buildings.push(b)
            this.houses.push(b)
          }
      }
  }

  private placeTrees(rng: RNG) {
    const m = this.map
    const f = m.forest
    const trees: { kind: 'oak' | 'pine' | 'giant'; x: number; z: number; yaw: number }[] = []
    const gate = this.walls.gate.seg
    const nearRoad = (x: number, z: number) => {
      const rel = new THREE.Vector3(x - gate.mid.x, 0, z - gate.mid.z)
      const along = rel.dot(gate.out)
      const lat = Math.abs(rel.dot(gate.dir))
      return along > -5 && lat < 14
    }
    for (let i = 0; i < f.trees * 3 && trees.length < f.trees; i++) {
      let x: number, z: number
      if (m.layout === 'district') {
        const a = rng.range(0.15, 1.1)
        const r = rng.range(m.radius + 50, m.radius + 260)
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        if (rng.chance(0.3)) {
          const a2 = rng.range(0.1, Math.PI - 0.1)
          x = Math.cos(a2) * rng.range(m.radius + 40, m.radius + 330)
          z = Math.sin(a2) * rng.range(m.radius + 40, m.radius + 330)
        }
      } else {
        x = rng.range(-m.radius - 60, m.radius + 60)
        z = rng.range(f.zMin, f.zMax)
      }
      if (nearRoad(x, z) || this.isReserved(x, z, 6)) continue
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < (f.giant ? 26 : 7))) continue
      trees.push({ kind: f.giant ? 'giant' : rng.chance(0.6) ? 'oak' : 'pine', x, z, yaw: rng.range(0, 6.28) })
    }
    // some normal trees inside the city yards & extra small trees in the giant forest
    if (f.giant)
      for (let i = 0; i < 60; i++) {
        const x = rng.range(-m.radius, m.radius), z = rng.range(f.zMin - 30, f.zMax + 40)
        if (!nearRoad(x, z) && !trees.some((t) => Math.hypot(t.x - x, t.z - z) < 9)) trees.push({ kind: 'pine', x, z, yaw: rng.range(0, 6.28) })
      }
    const kinds: ('oak' | 'pine' | 'giant')[] = ['oak', 'pine', 'giant']
    for (const kind of kinds) {
      const list = trees.filter((t) => t.kind === kind)
      if (!list.length) continue
      const variants = kind === 'giant' ? 3 : 3
      for (let v = 0; v < variants; v++) {
        const sub = list.filter((_, i) => i % variants === v)
        if (!sub.length) continue
        const geo = buildTree(kind, m.seed + v * 17 + kind.length)
        geo.computeBoundingBox()
        const hgt = geo.boundingBox!.max.y
        const im = new THREE.InstancedMesh(geo, getMaterials(), sub.length)
        im.castShadow = true
        im.receiveShadow = true
        sub.forEach((t, i) => {
          im.setMatrixAt(i, this.m4.makeRotationY(t.yaw).setPosition(t.x, 0, t.z))
          if (kind === 'giant') {
            const r = 3.2
            this.collision.add({ x: t.x, y: hgt / 2, z: t.z, w: r * 2, h: hgt, d: r * 2, kind: 'tree' })
            this.collision.add({ x: t.x, y: hgt, z: t.z, w: 22, h: 8, d: 22, kind: 'tree', solid: true })
            this.trees.push({ x: t.x, z: t.z, r: 4, h: hgt, giant: true })
          } else {
            this.collision.add({ x: t.x, y: hgt * 0.4, z: t.z, w: 1, h: hgt * 0.8, d: 1, kind: 'tree' })
            this.collision.add({ x: t.x, y: hgt * 0.85, z: t.z, w: 4.5, h: hgt * 0.4, d: 4.5, kind: 'tree', solid: true })
            this.trees.push({ x: t.x, z: t.z, r: 1, h: hgt, giant: false })
          }
        })
        im.computeBoundingSphere()
        this.group.add(im)
      }
    }
  }

  private finalizeInstances() {
    for (const t of this.templates) {
      t.cap = Math.max(1, t.count)
      for (let st = 0; st < 3; st++) {
        const geo = buildHouse(t.spec, st as BState)
        const im = new THREE.InstancedMesh(geo, getMaterials(), t.cap)
        im.castShadow = true
        im.receiveShadow = true
        for (let i = 0; i < t.cap; i++) im.setMatrixAt(i, this.zero)
        t.meshes.push(im)
        this.group.add(im)
      }
    }
    for (const b of this.houses) {
      this.m4.makeRotationY(b.yaw).setPosition(b.x, 0, b.z)
      b.tpl!.meshes[0].setMatrixAt(b.inst, this.m4)
      this.setColliders(b)
    }
    for (const t of this.templates)
      for (const im of t.meshes) {
        im.instanceMatrix.needsUpdate = true
        im.computeBoundingSphere()
      }
  }

  setColliders(b: Building) {
    for (const c of b.colliders) this.collision.remove(c)
    b.colliders.length = 0
    const kind = b.kind === 'core' ? 'core' : 'building'
    if (b.state === 2) {
      b.colliders.push(this.collision.add({ x: b.x, y: 1.2, z: b.z, w: b.w * 0.9, h: 2.4, d: b.d * 0.9, yaw: b.yaw, kind: 'rubble', hookable: false, owner: b }))
      if (b.kind === 'core') b.colliders.push(this.collision.add({ x: b.x, y: 3, z: b.z, w: b.w, h: 6, d: b.d, yaw: b.yaw, kind, owner: b }))
      return
    }
    if (b.kind === 'house') {
      const hh = b.state === 1 ? b.h - 1 : b.h
      b.colliders.push(this.collision.add({ x: b.x, y: hh / 2, z: b.z, w: b.w, h: hh, d: b.d, yaw: b.yaw, kind, owner: b }))
      b.colliders.push(this.collision.add({ x: b.x, y: b.h + b.roofH * 0.4, z: b.z, w: b.w + 0.6, h: b.roofH * 0.8, d: b.d * 0.55, yaw: b.yaw, kind, owner: b }))
    } else if (b.kind === 'tower') {
      const mz = b.z
      const th = b.state === 1 ? 22 : 37
      b.colliders.push(this.collision.add({ x: b.x, y: th / 2, z: mz, w: 7, h: th, d: 7, kind, owner: b }))
      b.colliders.push(this.collision.add({ x: b.x, y: 6, z: mz + 12, w: 10, h: 12, d: 17, kind, owner: b }))
    } else if (b.kind === 'core') {
      if (this.map.layout === 'district') {
        b.colliders.push(this.collision.add({ x: -11.5, y: 15, z: 10, w: 5, h: 30, d: 10, kind, owner: b }))
        b.colliders.push(this.collision.add({ x: 11.5, y: 15, z: 10, w: 5, h: 30, d: 10, kind, owner: b }))
        b.colliders.push(this.collision.add({ x: 0, y: 27, z: 10, w: 28, h: 7, d: 10, kind, owner: b }))
        b.colliders.push(this.collision.add({ x: 0, y: b.state === 1 ? 9 : 12, z: 9.6, w: 18, h: b.state === 1 ? 18 : 24, d: 1.4, kind, owner: b }))
      } else {
        const hh = b.state === 1 ? 16 : 22
        b.colliders.push(this.collision.add({ x: b.x, y: hh / 2, z: b.z, w: 24, h: hh, d: 20, kind, owner: b }))
        if (b.state === 0) b.colliders.push(this.collision.add({ x: b.x, y: 30, z: b.z, w: 10, h: 16, d: 10, kind, owner: b }))
      }
    } else {
      const hh = b.kind === 'hq' ? (b.state === 1 ? 9 : 14) : 5.5
      b.colliders.push(this.collision.add({ x: b.x, y: hh / 2, z: b.z, w: b.w, h: hh, d: b.d, yaw: b.yaw, kind, owner: b, solid: b.kind !== 'supply' }))
      if (b.kind === 'supply') b.colliders.push(this.collision.add({ x: b.x, y: 6, z: b.z, w: b.w, h: 1.2, d: b.d, yaw: b.yaw, kind, owner: b }))
    }
  }

  /** swap visual & collision state of a building */
  setState(b: Building, st: BState) {
    if (b.state === st) return
    const old = b.state
    b.state = st
    if (b.tpl) {
      this.m4.makeRotationY(b.yaw).setPosition(b.x, 0, b.z)
      b.tpl.meshes[old].setMatrixAt(b.inst, this.zero)
      b.tpl.meshes[st].setMatrixAt(b.inst, this.m4)
      b.tpl.meshes[old].instanceMatrix.needsUpdate = true
      b.tpl.meshes[st].instanceMatrix.needsUpdate = true
    } else if (b.mesh) b.mesh.geometry = b.geos[st]
    this.setColliders(b)
    if (st === 2) this.nav.rebuild(b.x - b.radius - 4, b.z - b.radius - 4, b.x + b.radius + 4, b.z + b.radius + 4)
  }

  /** world-space top-centre of a building (for perching soldiers / hooks) */
  roofPoint(b: Building, out = new THREE.Vector3()) {
    return out.set(b.x, b.h + b.roofH * 0.8, b.z)
  }

  integrity() {
    let hp = 0, max = 0
    for (const b of this.buildings) {
      if (b.kind === 'core') continue
      hp += b.hp
      max += b.maxHp
    }
    return max ? hp / max : 1
  }

  nearestSupply(p: THREE.Vector3): Building | null {
    let best: Building | null = null, bd = Infinity
    for (const s of this.supplyDepots) {
      if (s.state === 2) continue
      const d = Math.hypot(s.x - p.x, s.z - p.z)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }

  buildingsNear(x: number, z: number, r: number) {
    return this.buildings.filter((b) => b.state < 2 && Math.hypot(b.x - x, b.z - z) < r + b.radius)
  }

  dispose() {
    this.scene.remove(this.group)
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry.dispose()
    })
  }
}
