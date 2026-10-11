import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import type { WallSegment } from './WallSystem'
import type { Building } from './CityManager'
import { rand } from '../../utils/math'

/**
 * Staged destruction (PRD §13.2): intact → damaged → collapsed models are swapped at HP thresholds,
 * colliders & nav data updated, plus a handful of block debris, dust and fire — no rigid bodies.
 */
export class DestructionSystem {
  buildingsLost = 0
  private smokeAcc = 0

  constructor(private g: GameEngine) {}

  private fx(at: THREE.Vector3, color: string, big: boolean) {
    const p = this.g.particles
    p.chunks(at.x, at.y, at.z, big ? 14 : 4, color, big ? 12 : 7, big ? 1.6 : 0.9)
    p.emit('dust', at.x, at.y, at.z, big ? 26 : 6, { size: big ? 3 : 1.5, spread: big ? 4 : 1.5, speed: 3 })
  }

  damageSegment(s: WallSegment, dmg: number, at?: THREE.Vector3) {
    if (!s.breakable || s.gate || s.state === 2) return
    s.hp = Math.max(0, s.hp - dmg)
    s.lastHit = this.g.time
    const p = at ?? s.mid.clone().setY(8)
    this.fx(p, s.stone, false)
    this.g.audio.play('wallCrack', { pos: p, volume: 0.8 })
    if (this.g.time - s.warnT > 20 && s.hpFrac < 0.6) {
      s.warnT = this.g.time
      this.g.banner('城墙正在遭受攻击！', 'warn')
    }
    if (s.state === 0 && s.hpFrac < 0.55) {
      this.g.walls.setSegmentState(s, 1)
      this.fx(s.top.clone().setY(s.height - 3), s.stone, true)
    }
    if (s.hp <= 0) this.breach(s)
  }

  breach(s: WallSegment) {
    if (s.state === 2) return
    this.g.walls.setSegmentState(s, 2)
    s.hp = 0
    const p = s.mid.clone().setY(10)
    for (let i = 0; i < 4; i++) this.fx(p.clone().add(new THREE.Vector3(rand(-8, 8), rand(0, 16), rand(-4, 4))), s.stone, true)
    this.g.particles.emit('dust', s.mid.x, 6, s.mid.z, 60, { size: 6, spread: 14, speed: 6, life: 4 })
    this.g.audio.play('collapse', { pos: p, volume: 1.6 })
    this.g.shake(p, 1.2)
    this.g.banner('巨人突破城墙！', 'danger')
    this.g.audio.play('alarm', {})
    this.g.defense.smashOnSegment(s.index)
    this.g.npcs.swatAt(s.top, 14)
    this.g.onBreach(s)
  }

  damageGate(dmg: number, at?: THREE.Vector3) {
    const gate = this.g.walls.gate
    if (gate.state === 2) return
    gate.hp = Math.max(0, gate.hp - dmg)
    const p = at ?? gate.seg.mid.clone().setY(8)
    this.fx(p, '#5a3a22', dmg > 300)
    this.g.audio.play('wallCrack', { pos: p, pitch: 0.7 })
    if (this.g.time - this.gateWarn > 12) {
      this.gateWarn = this.g.time
      this.g.banner('城门遭到攻击！', 'warn')
      this.g.audio.play('bell', {})
    }
    if (gate.state === 0 && gate.hp / gate.maxHp < 0.5) this.g.walls.setGateState(1)
    if (gate.hp <= 0) {
      this.g.walls.setGateState(2)
      for (let i = 0; i < 3; i++) this.fx(p.clone().add(new THREE.Vector3(rand(-6, 6), rand(0, 12), 0)), '#5a3a22', true)
      this.g.audio.play('collapse', { pos: p })
      this.g.shake(p, 1)
      this.g.banner('城门被攻破！巨人正在涌入！', 'danger')
      this.g.onBreach(gate.seg)
    }
  }
  private gateWarn = -99
  private coreWarn = -99

  damageBuilding(b: Building, dmg: number, at?: THREE.Vector3) {
    if (b.state === 2) return
    if (b.kind === 'core') return this.damageCore(dmg, at)
    b.hp = Math.max(0, b.hp - dmg)
    b.lastHit = this.g.time
    const p = at ?? new THREE.Vector3(b.x, b.h * 0.6, b.z)
    this.fx(p, b.tpl ? b.tpl.spec.wall : '#cfc4ae', false)
    this.g.audio.play('wallCrack', { pos: p, volume: 0.6, pitch: 1.3 })
    if (b.state === 0 && b.hp / b.maxHp < 0.6) {
      this.g.city.setState(b, 1)
      this.fx(p, b.tpl ? b.tpl.spec.roof : '#888', true)
      if (Math.random() < 0.35) b.fire = rand(15, 35)
    }
    if (b.hp <= 0) this.collapse(b)
  }

  collapse(b: Building) {
    this.g.city.setState(b, 2)
    this.buildingsLost++
    b.fire = 0
    const top = new THREE.Vector3(b.x, b.h * 0.5, b.z)
    for (let i = 0; i < 3; i++) this.fx(top.clone().add(new THREE.Vector3(rand(-3, 3), rand(0, 4), rand(-3, 3))), i ? (b.tpl?.spec.roof ?? '#888') : (b.tpl?.spec.wall ?? '#ccc'), true)
    this.g.particles.emit('dust', b.x, 3, b.z, 40, { size: 5, spread: b.radius, speed: 4, life: 3.5 })
    this.g.audio.play('collapse', { pos: top })
    this.g.shake(top, 0.7)
    this.g.npcs.swatAt(top.setY(1), b.radius + 2)
    if (b.kind === 'supply') this.g.banner('补给站被摧毁！', 'danger')
    else if (b.kind === 'hq') this.g.banner('驻屯兵团总部倒塌！援军减少', 'danger')
    else if (b.kind === 'tower') this.g.banner('钟楼倒塌了！', 'warn')
    this.g.onBuildingCollapsed(b)
  }

  damageCore(dmg: number, at?: THREE.Vector3) {
    const c = this.g.city.core
    if (c.hp <= 0) return
    c.hp = Math.max(0, c.hp - dmg)
    const p = at ?? new THREE.Vector3(c.x, 10, c.z + 8)
    this.fx(p, '#c9bea6', dmg > 200)
    this.g.audio.play('wallCrack', { pos: p, pitch: 0.6 })
    if (this.g.time - this.coreWarn > 10) {
      this.coreWarn = this.g.time
      this.g.banner(`${this.g.map.coreName}正在遭受攻击！`, 'danger')
      this.g.audio.play('alarm', {})
    }
    const f = c.hp / c.maxHp
    if (c.state === 0 && f < 0.5) this.g.city.setState(c, 1)
    if (c.hp <= 0) {
      this.g.city.setState(c, 2)
      this.g.audio.play('collapse', { pos: p, volume: 2 })
      for (let i = 0; i < 5; i++) this.fx(p.clone().add(new THREE.Vector3(rand(-10, 10), rand(0, 15), rand(-3, 3))), '#c9bea6', true)
      this.g.onCoreDestroyed()
    }
  }

  repairSegment(s: WallSegment, amount: number) {
    if (!s.breakable || s.gate) return 0
    const before = s.hp
    s.hp = Math.min(s.maxHp, s.hp + amount)
    if (s.state === 2 && s.hpFrac > 0.35) {
      this.g.walls.setSegmentState(s, 1)
      this.g.banner('城墙缺口已封堵！', 'good')
      this.g.onRepairedBreach(s)
    }
    if (s.state === 1 && s.hpFrac > 0.8) this.g.walls.setSegmentState(s, 0)
    return s.hp - before
  }

  repairGate(amount: number) {
    const gate = this.g.walls.gate
    const before = gate.hp
    gate.hp = Math.min(gate.maxHp, gate.hp + amount)
    if (gate.state === 2 && gate.hp / gate.maxHp > 0.35) {
      this.g.walls.setGateState(1)
      this.g.banner('城门已修复！', 'good')
    }
    if (gate.state === 1 && gate.hp / gate.maxHp > 0.8) this.g.walls.setGateState(0)
    return gate.hp - before
  }

  repairBuilding(b: Building, amount: number) {
    const before = b.hp
    b.hp = Math.min(b.maxHp, b.hp + amount)
    const f = b.hp / b.maxHp
    if (b.state === 2 && f > 0.4) this.g.city.setState(b, 1)
    if (b.state === 1 && f > 0.85) {
      this.g.city.setState(b, 0)
      b.fire = 0
    }
    return b.hp - before
  }

  update(dt: number) {
    this.smokeAcc += dt
    if (this.smokeAcc < 0.12) return
    const step = this.smokeAcc
    this.smokeAcc = 0
    const cam = this.g.camera.position
    for (const b of this.g.city.buildings) {
      if (b.burning > 0) b.burning -= step
      if (b.fire > 0) {
        b.fire -= step
        if (Math.hypot(b.x - cam.x, b.z - cam.z) < 260) {
          this.g.particles.emit('fire', b.x + rand(-b.w / 3, b.w / 3), b.h * rand(0.6, 1.1), b.z + rand(-b.d / 3, b.d / 3), 3, { size: 1.6, spread: 1.2, up: 2 })
          this.g.particles.emit('smoke', b.x, b.h + 2, b.z, 1, { size: 2.4, spread: 1.5, up: 2, life: 4 })
        }
        if (b.fire > 0 && Math.random() < step * 0.4) this.damageBuilding(b, 6)
      } else if (b.state === 1 && Math.random() < step * 0.5 && Math.hypot(b.x - cam.x, b.z - cam.z) < 200) {
        this.g.particles.emit('smoke', b.x, b.h, b.z, 1, { size: 1.8, spread: 1.5, up: 1.5, life: 3 })
      }
    }
    for (const s of this.g.walls.breakable)
      if (s.state === 2 && Math.random() < step * 0.6) this.g.particles.emit('dust', s.mid.x + rand(-8, 8), 3, s.mid.z, 1, { size: 4, spread: 4, life: 3 })
  }
}
