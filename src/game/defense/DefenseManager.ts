import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import type { Slot } from '../world/CityManager'
import { DEFENSES, type DefenseDef, type DefenseType } from '../../data/defenses'
import { buildCannon, buildBallista, buildWatchtower, buildTrap, buildRepairStation, buildBarracks, buildInnerLine } from '../models/PropModels'
import { buildSupply } from '../models/BuildingModels'
import { getMaterials } from '../models/VoxelBuilder'
import type { Titan } from '../titans/TitanManager'
import { clamp, rand } from '../../utils/math'

export class Facility {
  def: DefenseDef
  level = 1
  alive = true
  hp = 400
  group = new THREE.Group()
  pivot: THREE.Object3D | null = null
  cd = rand(0.5, 2)
  target: Titan | null = null
  armedT = 0
  manual = false
  private manualDir = new THREE.Vector3()
  spawnT = 5

  constructor(private g: GameEngine, public type: DefenseType, public slot: Slot) {
    this.def = DEFENSES[type]
    this.rebuild()
    g.scene.add(this.group)
  }

  get pos() {
    return this.slot.pos
  }
  get range() {
    return this.def.range[this.level - 1]
  }
  get power() {
    return this.def.power[this.level - 1]
  }
  get interval() {
    return this.def.interval[this.level - 1]
  }

  rebuild() {
    this.group.clear()
    this.pivot = null
    let obj: THREE.Object3D
    switch (this.type) {
      case 'cannon': {
        const c = buildCannon(this.level)
        obj = c.group
        this.pivot = c.pivot
        break
      }
      case 'ballista': {
        const c = buildBallista(this.level)
        obj = c.group
        this.pivot = c.pivot
        break
      }
      case 'watchtower':
        obj = buildWatchtower(this.level)
        break
      case 'trap':
        obj = buildTrap(this.level, this.armedT <= 0)
        break
      case 'repair':
        obj = buildRepairStation(this.level)
        break
      case 'barracks':
        obj = buildBarracks(this.level)
        break
      case 'supply': {
        const m = new THREE.Mesh(buildSupply(0, 30 + this.level), getMaterials())
        m.castShadow = true
        obj = m
        break
      }
      case 'innerline': {
        const ring = new THREE.Group()
        for (let i = 0; i < 5; i++) {
          const piece = buildInnerLine(this.level, this.hp / this.maxHp > 0.6 ? 0 : this.hp > 0 ? 1 : 2)
          const a = Math.PI * (0.1 + (i / 4) * 0.8)
          const r = 26
          piece.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
          piece.rotation.y = a + Math.PI / 2
          ring.add(piece)
        }
        obj = ring
        break
      }
    }
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    this.group.add(obj)
    this.group.position.copy(this.slot.pos)
    if (this.type !== 'innerline') this.group.rotation.y = this.slot.yaw
    else this.group.position.set(this.g.city.core.x, 0, this.g.city.core.z + (this.g.map.layout === 'district' ? 8 : 12))
  }

  get maxHp() {
    return this.type === 'innerline' ? this.power : 400 + this.level * 150
  }

  manualAim(dir: THREE.Vector3) {
    this.manual = true
    this.manualDir.copy(dir)
    if (!this.pivot) return
    const yaw = Math.atan2(dir.x, dir.z) - this.slot.yaw
    this.pivot.rotation.set(-Math.asin(clamp(dir.y, -0.9, 0.9)), yaw, 0, 'YXZ')
  }

  manualFire() {
    if (this.cd > 0) return
    this.cd = this.type === 'cannon' ? 1.4 : 2.2
    const muzzle = this.muzzle()
    if (this.type === 'cannon') this.g.projectiles.cannonDir(muzzle, this.manualDir, this.power * 1.3)
    else this.g.projectiles.bolt(muzzle, muzzle.clone().addScaledVector(this.manualDir, 200), this.power * 1.2)
    this.g.camCtl.addTrauma(0.25)
  }

  private muzzle() {
    const p = this.pivot ? this.pivot.getWorldPosition(new THREE.Vector3()) : this.pos.clone().setY(this.pos.y + 1.4)
    const f = this.manual ? this.manualDir.clone() : this.target ? this.target.pos.clone().setY(this.target.height * 0.6).sub(p).normalize() : this.slot.out.clone()
    return p.addScaledVector(f, 2.5)
  }

  private garrisonBonus() {
    // manned cannons fire faster
    return this.g.npcs.soldiers.some((s) => s.alive && s.kind === 'garrison' && s.pos.distanceTo(this.pos) < 6) ? 0.75 : 1
  }

  update(dt: number) {
    const g = this.g
    if (!this.alive) return
    this.cd -= dt
    switch (this.type) {
      case 'cannon':
      case 'ballista': {
        if (this.manual && g.player.manning === this) return
        this.manual = false
        if (!this.target || !this.target.alive || this.target.pos.distanceTo(this.pos) > this.range) {
          this.target = null
          let best: Titan | null = null, bs = Infinity
          for (const t of g.titans.list) {
            if (!t.alive) continue
            const d = t.pos.distanceTo(this.pos)
            if (d > this.range || d < 8) continue
            // wall guns fire outward (and down into breaches)
            const rel = t.pos.clone().sub(this.pos).setY(0)
            if (rel.dot(this.slot.out) < -10 && this.slot.kind === 'wall') continue
            const s = d - t.def.threat * 15 + (t.inside ? -40 : 0)
            if (s < bs) {
              bs = s
              best = t
            }
          }
          this.target = best
        }
        const t = this.target
        if (!t) return
        const aimP = t.pos.clone().setY(t.height * (this.type === 'ballista' ? 0.55 : 0.5))
        if (this.pivot) {
          const pw = this.pivot.getWorldPosition(new THREE.Vector3())
          const d = aimP.clone().sub(pw)
          const yaw = Math.atan2(d.x, d.z) - this.slot.yaw
          const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
          this.pivot.rotation.set(-pitch, yaw, 0, 'YXZ')
        }
        if (this.cd <= 0) {
          this.cd = this.interval * this.garrisonBonus()
          const m = this.muzzle()
          // lead the target a little
          const lead = aimP.clone().addScaledVector(t.forward, t.currentSpeed() * 1.2)
          if (this.type === 'cannon') g.projectiles.cannonball(m, lead, this.power)
          else g.projectiles.bolt(m, lead, this.power)
        }
        break
      }
      case 'trap': {
        if (this.armedT > 0) {
          this.armedT -= dt
          if (this.armedT <= 0) this.rebuild()
          return
        }
        for (const t of g.titans.list) {
          if (!t.alive || t.state === 'bound') continue
          if (Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < this.range + t.radius) {
            t.bind(t.def.boss ? this.power * 0.5 : this.power)
            t.slowT = Math.max(t.slowT, this.power + 4)
            this.armedT = this.interval
            this.rebuild()
            g.audio.play('trap', { pos: this.pos })
            g.effects.ring(this.pos.clone().setY(0.4), this.range, 0xd9c08a, 0.6)
            g.banner('巨人陷阱触发！', 'good')
            break
          }
        }
        break
      }
      case 'repair': {
        if (this.cd > 0) return
        this.cd = this.interval
        if (g.resources.materials < 1) return
        let best: { f: number; fn: () => number } | null = null
        for (const s of g.walls.breakable) {
          if (s.gate || s.hp >= s.maxHp || s.mid.distanceTo(this.pos) > this.range) continue
          if (!best || s.hpFrac < best.f) best = { f: s.hpFrac, fn: () => g.destruction.repairSegment(s, this.power * 2) }
        }
        const gate = g.walls.gate
        if (gate.hp < gate.maxHp && gate.seg.mid.distanceTo(this.pos) < this.range && (!best || gate.hp / gate.maxHp < best.f)) best = { f: gate.hp / gate.maxHp, fn: () => g.destruction.repairGate(this.power * 1.5) }
        for (const b of g.city.buildings) {
          if (b.hp >= b.maxHp || b.pos.distanceTo(this.pos) > this.range) continue
          const f = b.hp / b.maxHp
          if (!best || f < best.f - 0.2) best = { f, fn: () => g.destruction.repairBuilding(b, this.power) }
        }
        if (best) {
          const done = best.fn()
          g.resources.materials = Math.max(0, g.resources.materials - done * 0.08)
        }
        break
      }
      case 'barracks': {
        if (g.waves.phase !== 'combat') return
        this.spawnT -= dt
        if (this.spawnT <= 0) {
          this.spawnT = this.interval
          const cap = this.range
          const mine = g.npcs.soldiers.filter((s) => s.alive && s.kind === 'survey').length
          if (mine < g.npcs.maxSurvey + cap) g.npcs.barracksSpawn(this.pos.clone().setY(2))
        }
        break
      }
    }
  }

  destroy() {
    if (!this.alive) return
    this.alive = false
    this.g.particles.chunks(this.pos.x, this.pos.y + 1, this.pos.z, 10, '#6a4a2e', 9, 0.8)
    this.g.particles.emit('smoke', this.pos.x, this.pos.y + 1, this.pos.z, 12, { size: 2 })
    this.g.audio.play('collapse', { pos: this.pos, volume: 0.6, pitch: 1.4 })
    this.g.scene.remove(this.group)
  }

  dispose() {
    this.g.scene.remove(this.group)
  }
}

/** Defence facilities on build slots: build / upgrade / sell, targeting, detection & the inner defence line. */
export class DefenseManager {
  facilities: Facility[] = []
  constructor(private g: GameEngine) {}

  bySlot(id: number) {
    return this.facilities.find((f) => f.slot.id === id && f.alive) ?? null
  }

  get innerLine() {
    const f = this.facilities.find((x) => x.type === 'innerline' && x.alive)
    return f ? { hp: f.hp, pos: f.group.position } : null
  }

  damageInnerLine(dmg: number) {
    const f = this.facilities.find((x) => x.type === 'innerline' && x.alive)
    if (!f) return
    const before = f.hp / f.maxHp
    f.hp -= dmg
    this.g.particles.chunks(f.group.position.x, 2, f.group.position.z, 4, '#a49a86', 6, 0.8)
    this.g.audio.play('wallCrack', { pos: f.group.position })
    const after = f.hp / f.maxHp
    if (f.hp <= 0) {
      f.destroy()
      this.g.banner('内城防线被突破！', 'danger')
    } else if ((before > 0.6 && after <= 0.6) || (before > 0.3 && after <= 0.3)) f.rebuild()
  }

  canBuild(slot: Slot, type: DefenseType) {
    return DEFENSES[type].slot === slot.kind && !this.bySlot(slot.id)
  }

  build(slot: Slot, type: DefenseType, free = false): boolean {
    const def = DEFENSES[type]
    if (!this.canBuild(slot, type)) return false
    if (!free && !this.g.resources.spend(def.cost)) return false
    if (slot.kind === 'wall') {
      const seg = this.g.walls.segments[slot.segIndex]
      if (seg && seg.state === 2) return false
    }
    const f = new Facility(this.g, type, slot)
    f.hp = f.maxHp
    this.facilities.push(f)
    if (type === 'cannon' || type === 'ballista') this.g.npcs.assignGarrison(slot.pos, slot.out)
    if (!free) {
      this.g.audio.play('build', { pos: slot.pos })
      this.g.banner(`已建造：${def.name}`, 'good')
    }
    return true
  }

  upgrade(slot: Slot): boolean {
    const f = this.bySlot(slot.id)
    if (!f || f.level >= 3) return false
    if (!this.g.resources.spend(f.def.upgrade[f.level - 1])) return false
    f.level++
    f.hp = f.maxHp
    f.rebuild()
    this.g.audio.play('build', { pos: slot.pos, pitch: 1.2 })
    this.g.banner(`${f.def.name} 升级至 Lv.${f.level}`, 'good')
    return true
  }

  sell(slot: Slot) {
    const f = this.bySlot(slot.id)
    if (!f) return
    this.g.resources.add(Math.round(f.def.cost.funds * 0.5), Math.round(f.def.cost.materials * 0.5))
    f.destroy()
    this.facilities = this.facilities.filter((x) => x !== f)
  }

  /** how well a point is covered by guns (abnormals avoid covered areas) */
  coverage(p: THREE.Vector3) {
    let c = 0
    for (const f of this.facilities) if (f.alive && (f.type === 'cannon' || f.type === 'ballista') && f.pos.distanceTo(p) < f.range) c++
    return c
  }

  smashOnSegment(segIndex: number) {
    for (const f of this.facilities) if (f.alive && f.slot.kind === 'wall' && f.slot.segIndex === segIndex) f.destroy()
    for (const s of this.g.npcs.soldiers) {
      if (!s.alive || s.kind !== 'garrison') continue
      const seg = this.g.walls.segments[segIndex]
      if (seg && s.pos.distanceTo(seg.top) < seg.len / 2 + 2) s.kill()
    }
  }

  damageAt(p: THREE.Vector3, r: number, dmg: number) {
    for (const f of this.facilities) {
      if (!f.alive || f.type === 'innerline') continue
      if (f.pos.distanceTo(p) < r + 2) {
        f.hp -= dmg
        if (f.hp <= 0) {
          f.destroy()
          this.g.banner(`${f.def.name}被摧毁！`, 'warn')
        }
      }
    }
  }

  nearestCannon(p: THREE.Vector3, r: number) {
    let best: Facility | null = null, bd = r
    for (const f of this.facilities) {
      if (!f.alive || (f.type !== 'cannon' && f.type !== 'ballista')) continue
      const d = f.pos.distanceTo(p)
      if (d < bd) {
        bd = d
        best = f
      }
    }
    return best
  }

  supplies() {
    return this.facilities.filter((f) => f.alive && f.type === 'supply')
  }

  /** detection sources for the minimap: [x, z, r] */
  detection(): [number, number, number][] {
    const out: [number, number, number][] = []
    const g = this.g
    const gate = g.walls.gate.seg
    out.push([gate.mid.x, gate.mid.z, 170])
    for (const s of g.walls.breakable) if (s.index % 3 === 0) out.push([s.mid.x, s.mid.z, 110])
    for (const f of this.facilities) if (f.alive && f.type === 'watchtower') out.push([f.pos.x, f.pos.z, f.range])
    if (g.city.tower && g.city.tower.alive) out.push([g.city.tower.x, g.city.tower.z, 200])
    out.push([g.player.pos.x, g.player.pos.z, 130])
    return out
  }

  update(dt: number) {
    for (const f of this.facilities) f.update(dt)
  }

  dispose() {
    for (const f of this.facilities) f.dispose()
    this.facilities.length = 0
  }
}
