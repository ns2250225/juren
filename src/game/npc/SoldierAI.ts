import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import { CharacterModel, type Faction } from '../models/CharacterModel'
import type { Titan } from '../titans/TitanManager'
import type { Building } from '../world/CityManager'
import type { WallSegment } from '../world/WallSystem'
import { applyHit } from '../titans/TitanWeakpoints'
import { rand, dampAngle, pick } from '../../utils/math'
import type { CharacterLook } from '../../data/characters'

let NPC_ID = 1
export const nextNpcId = () => NPC_ID++

export type SoldierKind = 'survey' | 'garrison' | 'engineer' | 'medic' | 'commander'
export type Order = 'attack' | 'defend' | 'rally'

const HAIR = ['#3a2416', '#1a1410', '#6a4a2a', '#c8a050', '#8a5a3a', '#2a2a2a', '#a07040']
const SKIN = ['#f0cfae', '#e8b98f', '#d8a47c', '#f4d6b8', '#c88e64']
const STYLES: CharacterLook['hairStyle'][] = ['buzz', 'short', 'short', 'eren', 'armin', 'bun', 'long', 'mikasa']

export function randomLook(kind: string): CharacterLook {
  if (kind === 'commander') return { skin: '#e8c4a0', hair: '#d8d8d8', hairStyle: 'bald', eyes: '#3a3a3a', height: 1.02 }
  return { skin: pick(SKIN), hair: pick(HAIR), hairStyle: pick(STYLES), eyes: pick(['#3a2a1a', '#2a4a6a', '#3a5a3a']), height: rand(0.93, 1.05) }
}

interface Hop {
  from: THREE.Vector3
  ctrl: THREE.Vector3
  to: THREE.Vector3
  anchor: THREE.Vector3
  t: number
  dur: number
}

/**
 * 调查兵团 / 驻屯兵团 / 工程兵 / 医疗兵 / 指挥官.
 * Survey soldiers use pre-planned ballistic "hook hops" (Bezier arcs + a drawn rope) instead of real rope physics.
 */
export class Soldier {
  id = nextNpcId()
  model: CharacterModel
  pos = new THREE.Vector3()
  yaw = 0
  hp = 100
  alive = true
  held: Titan | null = null
  state: 'idle' | 'hop' | 'strike' | 'retreat' | 'walk' | 'repair' | 'heal' | 'man' | 'dead' = 'idle'
  hop: Hop | null = null
  target: Titan | null = null
  post = new THREE.Vector3()
  thinkT = rand(0, 0.5)
  cd = rand(0, 2)
  deadT = 0
  path: [number, number][] | null = null
  pathI = 0
  repairB: Building | null = null
  repairS: WallSegment | null = null
  healTarget: Soldier | 'player' | null = null
  striking = 0
  visible = true
  kills = 0
  private vy = 0
  private walkSpeed = 4.2
  manSlot = -1

  constructor(private g: GameEngine, public kind: SoldierKind, pos: THREE.Vector3) {
    const faction: Faction = kind === 'survey' ? 'survey' : kind === 'garrison' ? 'garrison' : kind === 'engineer' ? 'engineer' : kind === 'medic' ? 'medic' : 'commander'
    this.model = new CharacterModel({ look: randomLook(kind), faction, seed: this.id * 13, blades: kind === 'survey' || kind === 'garrison' })
    this.model.setShadow(false)
    this.pos.copy(pos)
    this.post.copy(pos)
    g.npcs.group.add(this.model.root)
  }

  get flying() {
    return this.state === 'hop'
  }

  update(dt: number) {
    const g = this.g
    if (!this.alive) {
      this.deadT += dt
      this.model.update(dt, 'death', 0)
      if (this.pos.y > 0) this.pos.y = Math.max(0, this.pos.y - 12 * dt)
      this.model.root.position.copy(this.pos)
      return
    }
    if (this.held) {
      this.model.update(dt, 'grabbed', 0)
      this.model.root.position.copy(this.pos)
      return
    }
    // drop to ground/perch if released mid-air
    if (this.state !== 'hop' && this.pos.y > 0.05 && this.kind !== 'garrison' && this.state !== 'idle') {
      this.vy -= 22 * dt
      this.pos.y = Math.max(0, this.pos.y + this.vy * dt)
    } else this.vy = 0
    this.thinkT -= dt
    this.cd -= dt
    switch (this.kind) {
      case 'survey':
        this.updateSurvey(dt)
        break
      case 'garrison':
        this.updateGarrison(dt)
        break
      case 'engineer':
        this.updateEngineer(dt)
        break
      case 'medic':
        this.updateMedic(dt)
        break
      case 'commander':
        this.model.update(dt, 'idle', 0)
        break
    }
    this.model.root.position.copy(this.pos)
    this.model.root.rotation.y = this.yaw
  }

  // ---------------------------------------------------------------- survey corps
  private successChance(t: Titan) {
    const m = this.g.npcs
    let p = 0.18 + m.successBuff(this.pos)
    if (!t.canAct || t.state === 'knockdown') p += 0.3
    if (t.markedT > 0) p += 0.15
    if (t.type === 'abnormal') p -= 0.1
    if (t.def.boss) p += 0.2
    return Math.min(0.92, p)
  }

  private updateSurvey(dt: number) {
    const g = this.g
    const m = g.npcs
    if (this.state === 'hop' && this.hop) {
      this.advanceHop(dt)
      return
    }
    if (this.striking > 0) {
      this.striking -= dt
      if (this.striking <= 0) this.model.slashT = -1
      else this.model.slashT = 1 - this.striking / 0.35
    }
    if (this.hp < 30 && this.state !== 'retreat') {
      this.state = 'retreat'
      this.target = null
    }
    if (this.state === 'retreat') {
      const home = m.retreatPoint()
      if (this.pos.distanceTo(home) > 6) {
        this.hopTo(home, null)
        return
      }
      this.hp = Math.min(100, this.hp + 8 * dt)
      if (this.hp > 85) this.state = 'idle'
      this.model.update(dt, 'idle', 0)
      return
    }
    if (this.thinkT <= 0) {
      this.thinkT = rand(0.4, 0.8)
      if (!this.target || !this.target.alive) this.target = m.pickTarget(this)
    }
    const t = this.target
    if (t && t.alive && this.cd <= 0) {
      const nape = t.model.napeWorld(new THREE.Vector3())
      const behind = nape.clone().addScaledVector(t.forward, -2.5).setY(nape.y + 0.8)
      const d = this.pos.distanceTo(behind)
      if (d < 4.5) {
        this.strike(t)
        return
      }
      const step = Math.min(d, 38)
      const to = d <= 38 ? behind : this.pos.clone().lerp(behind, step / d).setY(Math.max(4, behind.y * 0.7))
      // rope anchor: titan shoulders when close, else a point high above the destination
      const anchor = d < 50 ? new THREE.Vector3(0, 0, 0).applyMatrix4(t.model.hitboxes.find((h) => h.part === 'body')!.world).setY(nape.y + 2) : to.clone().add(new THREE.Vector3(rand(-6, 6), 14, rand(-6, 6)))
      this.hopTo(to, anchor)
      return
    }
    if (!t) {
      const rally = m.order === 'rally' ? g.player.pos.clone().add(new THREE.Vector3(rand(-8, 8), 0, rand(-8, 8))) : null
      const home = rally ?? this.post
      if (this.pos.distanceTo(home) > (rally ? 12 : 4) && this.cd <= 0) {
        const dest = rally ? m.perchNear(home) : this.post
        this.hopTo(dest, dest.clone().add(new THREE.Vector3(0, 10, 0)))
        return
      }
    }
    this.model.update(dt, this.pos.y > 0.2 || this.state === 'idle' ? 'idle' : 'idle', 0)
  }

  private strike(t: Titan) {
    const g = this.g
    this.striking = 0.35
    this.model.slashT = 0
    this.model.slashSide = Math.random() < 0.5 ? 1 : -1
    g.audio.play('bladeSwing', { pos: this.pos, volume: 0.5 })
    this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z)
    const success = Math.random() < this.successChance(t)
    if (success) {
      const hb = t.model.hitboxes.find((h) => h.part === 'nape')!
      const p = new THREE.Vector3().copy(hb.center).applyMatrix4(hb.world)
      g.particles.emit('blood', p.x, p.y, p.z, 10, { speed: 5, size: t.height / 12 })
      const r = applyHit(t, 'nape', t.def.boss ? 70 : 9999, 'npc')
      if (r.killed) {
        this.kills++
        g.audio.play('soldierShout', { pos: this.pos, volume: 0.7 })
        g.npcs.cheerNear(this.pos)
      }
    } else if (t.canAct && t.armDisabled <= 0 && !t.victim && Math.random() < 0.3) {
      // caught mid-air
      t.victim = { kind: 'npc', npc: this }
      this.held = t
      t.setState('hold')
      t.holdT = 0
      t.setPose('grab', 1.4)
      t.poseT = t.poseDur * 0.6
      g.audio.play('scream', { pos: this.pos, volume: 0.8 })
    } else {
      g.particles.emit('spark', this.pos.x, this.pos.y + 1, this.pos.z, 4, { speed: 3 })
    }
    this.cd = rand(1.6, 3.4)
    if (!this.held) {
      const away = this.g.npcs.perchNear(this.pos.clone().addScaledVector(t.forward, -18))
      this.hopTo(away, away.clone().add(new THREE.Vector3(0, 12, 0)))
    }
  }

  hopTo(to: THREE.Vector3, anchor: THREE.Vector3 | null) {
    const from = this.pos.clone()
    const d = from.distanceTo(to)
    if (d < 0.5) return
    const speed = 24 * (1 + this.g.npcs.speedBuff(this.pos))
    const ctrl = from.clone().lerp(to, 0.5)
    ctrl.y = Math.max(from.y, to.y) + 4 + d * 0.18
    this.hop = { from, ctrl, to: to.clone(), anchor: anchor ?? ctrl.clone().setY(ctrl.y + 12), t: 0, dur: Math.max(0.5, d / speed) }
    this.state = 'hop'
    if (Math.random() < 0.3) this.g.audio.play('hookFire', { pos: this.pos, volume: 0.35 })
  }

  private advanceHop(dt: number) {
    const h = this.hop!
    h.t += dt / h.dur
    const t = Math.min(1, h.t)
    const a = h.from, b = h.ctrl, c = h.to
    const u = 1 - t
    const prev = this.pos.clone()
    this.pos.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z)
    const v = this.pos.clone().sub(prev)
    if (v.lengthSq() > 1e-6) this.yaw = dampAngle(this.yaw, Math.atan2(v.x, v.z), 10, dt)
    const sp = v.length() / Math.max(1e-4, dt)
    this.model.update(dt, 'fly', sp, v.y / Math.max(1e-4, dt))
    if (this.visible && t < 0.85) this.g.effects.rope(this.pos.clone().setY(this.pos.y + 0.9), h.anchor, 0x333333)
    if (this.visible && Math.random() < 0.3) this.g.particles.emit('gas', this.pos.x, this.pos.y + 0.9, this.pos.z, 1, { speed: 0.6 })
    if (h.t >= 1) {
      this.hop = null
      this.state = this.state === 'hop' ? (this.hp < 30 ? 'retreat' : 'idle') : this.state
    }
  }

  // ---------------------------------------------------------------- garrison
  private updateGarrison(dt: number) {
    const st = this.g.npcs.cheerT > 0 && this.g.npcs.cheerPos.distanceTo(this.pos) < 120 ? 'cheer' : 'idle'
    if (this.thinkT <= 0) {
      this.thinkT = rand(1, 2)
      const t = this.g.titans.nearest(this.pos, 140)
      if (t) this.yaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z)
      if (t && Math.random() < 0.05) this.g.audio.play('soldierShout', { pos: this.pos, volume: 0.4, pitch: rand(0.9, 1.2) })
    }
    this.model.update(dt, st, 0)
  }

  // ---------------------------------------------------------------- engineers
  private walk(dt: number): boolean {
    if (!this.path || this.pathI >= this.path.length) return false
    const [x, z] = this.path[this.pathI]
    const dx = x - this.pos.x, dz = z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d < 0.8) {
      this.pathI++
      return this.pathI < this.path.length
    }
    const s = Math.min(d, this.walkSpeed * dt)
    this.pos.x += (dx / d) * s
    this.pos.z += (dz / d) * s
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt)
    this.model.update(dt, 'run', this.walkSpeed)
    return true
  }

  private goTo(x: number, z: number) {
    this.path = this.g.city.nav.path(this.pos.x, this.pos.z, x, z, 4000)
    this.pathI = 0
    return !!this.path
  }

  private updateEngineer(dt: number) {
    const g = this.g
    if (this.thinkT <= 0) {
      this.thinkT = rand(1.5, 2.5)
      const danger = g.titans.nearest(this.pos, 45)
      if (danger) {
        this.repairB = null
        this.repairS = null
        this.state = 'walk'
        const sp = g.city.safePoint
        this.goTo(sp.x + rand(-8, 8), sp.z + rand(-4, 4))
      } else if (this.state !== 'repair' || (!this.repairB && !this.repairS)) {
        const job = g.npcs.findRepairJob(this.pos)
        if (job) {
          this.repairB = job.b ?? null
          this.repairS = job.s ?? null
          const p = job.p
          if (this.goTo(p.x, p.z)) this.state = 'walk'
        }
      }
    }
    if (this.walk(dt)) return
    const target = this.repairB ? new THREE.Vector3(this.repairB.x, 0, this.repairB.z) : this.repairS ? this.repairS.inside : null
    if (target && this.pos.distanceTo(target.clone().setY(0)) < (this.repairB ? this.repairB.radius + 5 : 10)) {
      this.state = 'repair'
      this.yaw = Math.atan2(target.x - this.pos.x, target.z - this.pos.z)
      const amount = 14 * dt
      if (g.resources.materials > 0.5) {
        let done = 0
        if (this.repairB) done = g.destruction.repairBuilding(this.repairB, amount)
        else if (this.repairS) done = this.repairS.gate ? g.destruction.repairGate(amount) : g.destruction.repairSegment(this.repairS, amount * 1.5)
        g.resources.materials = Math.max(0, g.resources.materials - done * 0.05)
        if (done <= 0) {
          this.repairB = null
          this.repairS = null
          this.state = 'idle'
        }
        if (Math.random() < dt * 2) g.audio.play('build', { pos: this.pos, volume: 0.4 })
      }
      this.model.update(dt, 'repair', 0)
      return
    }
    this.model.update(dt, 'idle', 0)
  }

  // ---------------------------------------------------------------- medics
  private updateMedic(dt: number) {
    const g = this.g
    if (this.thinkT <= 0) {
      this.thinkT = rand(1, 2)
      const pl = g.player
      if (pl.alive && pl.hp < pl.stats.maxHp * 0.7 && pl.onGround && pl.pos.distanceTo(this.pos) < 80 && g.walls.isInside(pl.pos.x, pl.pos.z)) this.healTarget = 'player'
      else this.healTarget = g.npcs.injured(this.pos)
      const tp = this.healTarget === 'player' ? pl.pos : this.healTarget ? this.healTarget.pos : g.city.safePoint
      if (tp.y < 3) this.goTo(tp.x + rand(-2, 2), tp.z + rand(-2, 2))
    }
    if (this.walk(dt)) return
    let healing = false
    if (this.healTarget === 'player') {
      const pl = g.player
      if (pl.pos.distanceTo(this.pos) < 10) {
        pl.hp = Math.min(pl.stats.maxHp, pl.hp + 8 * dt)
        healing = true
      }
    } else if (this.healTarget && this.healTarget.alive && this.healTarget.pos.distanceTo(this.pos) < 9) {
      this.healTarget.hp = Math.min(100, this.healTarget.hp + 10 * dt)
      healing = true
    }
    // passive aura
    for (const s of g.npcs.soldiers) if (s.alive && s !== this && s.pos.distanceTo(this.pos) < 8) s.hp = Math.min(100, s.hp + 4 * dt)
    if (healing && Math.random() < dt * 4) g.particles.emit('speck', this.pos.x, this.pos.y + 1.5, this.pos.z, 2, { color: '#7fff9f', speed: 1 })
    this.model.update(dt, healing ? 'repair' : 'idle', 0)
  }

  kill() {
    if (!this.alive) return
    this.alive = false
    this.held = null
    this.state = 'dead'
    this.hop = null
  }

  dispose() {
    this.g.npcs.group.remove(this.model.root)
    this.model.dispose()
  }
}
