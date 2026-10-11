import * as THREE from 'three'
import { TitanModel, type Hitbox, type TitanPose } from '../models/TitanModel'
import { TITANS, type TitanDef, type TitanType } from '../../data/titans'
import type { SpawnDir } from '../../data/maps'
import type { GameEngine } from '../core/GameEngine'
import type { WallSegment } from '../world/WallSystem'
import type { Building } from '../world/CityManager'
import type { DamageSource } from './TitanWeakpoints'
import { updateTitanAI } from './TitanAI'
import { rand, angleDiff, clamp } from '../../utils/math'

export type AIState =
  | 'march' | 'attackWall' | 'enter' | 'roam' | 'attackBuilding' | 'attackCore' | 'chase' | 'grab' | 'hold'
  | 'stunned' | 'knockdown' | 'bound' | 'dying' | 'boss' | 'swipe' | 'kick' | 'jump' | 'aggroEren'

export interface Victim {
  kind: 'player' | 'npc'
  npc?: { id: number; alive: boolean; pos: THREE.Vector3 }
}

let TITAN_ID = 1

export class Titan {
  id = TITAN_ID++
  def: TitanDef
  model: TitanModel
  pos: THREE.Vector3
  yaw = 0
  radius: number
  hp: number
  maxHp: number
  napeHP: number
  napeMax: number
  armor = 0
  alive = true
  removed = false
  state: AIState = 'march'
  stateT = 0
  pose: TitanPose = 'walk'
  poseT = 0
  poseDur = 1
  actionFired = false
  entry: WallSegment | null = null
  inside = false
  targetB: Building | null = null
  targetP = new THREE.Vector3()
  wantCore = false
  speedMul = 1
  slowT = 0
  stunT = 0
  boundT = 0
  knockT = 0
  armDisabled = 0
  legHits = 0
  legHitT = 0
  markedT = 0
  exposedT = 0
  hardenT = 0
  hardenCD = 6
  dodgeCD = 3
  colossalSteam = 0
  steamCD = 12
  throwCD = 4
  attackCD = 2
  roarCD = 0
  alerted = 0
  age = 0
  lastDamage = -99
  victim: Victim | null = null
  holdT = 0
  aiAcc = 0
  animAcc = 0
  lod = 0
  vy = 0
  deathT = 0
  killedBy: DamageSource | null = null
  stuckT = 0
  aggroT = 0
  erraticT = rand(2, 5)
  wanderYaw = 0
  bossPhase = ''
  napeLockAlpha = 0
  stepPhase = 0
  private lastStep = 0

  constructor(public game: GameEngine, public type: TitanType, public height: number, pos: THREE.Vector3, seed: number, hpScale: number) {
    this.def = TITANS[type]
    this.model = new TitanModel(type, height, seed)
    this.pos = pos.clone()
    this.radius = Math.max(1.2, height * (type === 'beast' ? 0.24 : 0.17))
    const sizeHp = this.def.boss ? 1 : 0.55 + height / 15
    this.maxHp = this.def.hp * sizeHp * hpScale
    this.hp = this.maxHp
    this.napeMax = this.def.boss ? this.def.napeHits * 150 * hpScale : 1
    this.napeHP = this.napeMax
    if (type === 'armored') this.armor = 100
    this.model.root.position.copy(this.pos)
    if (type === 'colossal') this.steamCD = 8
  }

  get isBoss() {
    return this.def.boss
  }
  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
  }
  get canAct() {
    return this.alive && this.stunT <= 0 && this.knockT <= 0 && this.boundT <= 0
  }

  setPose(p: TitanPose, dur = 1) {
    this.pose = p
    this.poseT = 0
    this.poseDur = dur
    this.actionFired = false
  }
  setState(s: AIState) {
    this.state = s
    this.stateT = 0
  }

  stun(s: number) {
    if (!this.alive) return
    this.stunT = Math.max(this.stunT, s)
    if (this.state !== 'knockdown' && this.state !== 'bound') this.setPose('stunned', s)
  }
  knockdown(s: number) {
    if (!this.alive || this.def.boss) return
    this.knockT = Math.max(this.knockT, s)
    this.releaseVictim(false)
    this.setPose('knockdown', s)
    this.setState('knockdown')
    this.game.audio.play('titanFall', { pos: this.pos, pitch: 1.3 - this.height / 30 })
    this.game.shake(this.pos, 0.4)
  }
  bind(s: number) {
    if (!this.alive) return
    this.boundT = Math.max(this.boundT, s)
    this.setPose('bound', s)
    this.setState('bound')
  }

  releaseVictim(cut: boolean) {
    if (!this.victim) return
    const v = this.victim
    this.victim = null
    if (v.kind === 'player') this.game.player.releasedFromGrab(cut)
    else if (v.npc && v.npc.alive) this.game.npcs.releaseNpc(v.npc.id)
  }

  kill(src: DamageSource) {
    if (!this.alive) return
    this.alive = false
    this.killedBy = src
    this.releaseVictim(true)
    this.setState('dying')
    this.model.fallDir = Math.random() < 0.6 ? 1 : -1
    this.setPose('death', 3)
    this.game.titans.handleKill(this, src)
  }

  /** time-scaled per-frame update */
  update(dt: number, camPos: THREE.Vector3) {
    this.age += dt
    const d = camPos.distanceTo(this.pos)
    this.lod = d < 160 ? 0 : d < 380 ? 1 : 2
    // timers (always)
    const dec = (v: number) => Math.max(0, v - dt)
    this.slowT = dec(this.slowT)
    this.armDisabled = dec(this.armDisabled)
    this.markedT = dec(this.markedT)
    this.exposedT = dec(this.exposedT)
    this.alerted = dec(this.alerted)
    this.aggroT = dec(this.aggroT)
    this.legHitT = dec(this.legHitT)
    if (this.legHitT <= 0) this.legHits = 0
    if (this.hardenT > 0) {
      this.hardenT -= dt
      if (this.hardenT <= 0) this.model.setCrystal(false)
    }
    this.hardenCD = dec(this.hardenCD)
    this.dodgeCD = dec(this.dodgeCD)
    this.attackCD = dec(this.attackCD)
    this.roarCD = dec(this.roarCD)
    this.poseT += dt

    if (this.alive) {
      // regeneration
      if (this.age - this.lastDamage > 4) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03 * dt)
      if (this.stunT > 0) {
        this.stunT -= dt
        if (this.stunT <= 0 && this.state !== 'knockdown' && this.state !== 'bound') this.setPose('walk')
      }
      if (this.knockT > 0) {
        this.knockT -= dt
        if (this.knockT <= 0) {
          this.setPose('walk')
          this.setState(this.inside ? 'roam' : 'march')
        }
      }
      if (this.boundT > 0) {
        this.boundT -= dt
        if (this.boundT <= 0) {
          this.setPose('walk')
          this.setState(this.inside ? 'roam' : 'march')
        }
      }
      // AI with LOD
      this.aiAcc += dt
      const step = this.lod === 0 ? 0 : this.lod === 1 ? 0.06 : 0.15
      if (this.aiAcc >= step) {
        updateTitanAI(this, this.aiAcc)
        this.aiAcc = 0
      }
      if (this.victim) this.holdVictim()
    } else {
      this.deathT += dt
      if (this.deathT > 2.2) {
        // dissipating into steam
        const f = clamp((this.deathT - 2.2) / 4.5, 0, 1)
        this.model.setFade(1 - f)
        if (Math.random() < (this.lod === 0 ? 0.9 : 0.4)) {
          const p = this.pos
          const s = this.height
          this.game.particles.emit('steam', p.x + rand(-s * 0.4, s * 0.4), rand(0.5, s * 0.25), p.z + rand(-s * 0.4, s * 0.4), 2, { size: s / 6, spread: s * 0.1, up: 2 })
        }
        if (f >= 1) this.removed = true
      }
    }
    // animate + transform
    this.animAcc += dt
    const aStep = this.lod === 0 ? 0 : this.lod === 1 ? 0.033 : 0.09
    const moving = this.pose === 'walk' || this.pose === 'run' || this.pose === 'charge' || this.pose === 'crawl'
    if (this.animAcc >= aStep) {
      const p = this.poseDur > 0 ? clamp(this.poseT / this.poseDur, 0, 1) : 0
      const spd = this.currentSpeed()
      this.model.animate(this.animAcc, this.pose, moving ? spd : 0, p)
      this.animAcc = 0
    }
    this.model.root.position.copy(this.pos)
    this.model.root.rotation.y = this.yaw
    this.model.root.updateMatrixWorld(true)
    this.model.updateHitboxes()
    this.model.setShadows(this.lod < 2)
    // nape marker
    const lockTarget = this.game.player.lockTarget === this
    const want = lockTarget ? 0.75 : this.markedT > 0 ? 0.55 : 0
    this.napeLockAlpha += (want - this.napeLockAlpha) * Math.min(1, dt * 6)
    this.model.setMarker(this.alive ? this.napeLockAlpha * (0.75 + Math.sin(this.age * 8) * 0.25) : 0)
    // footsteps
    if (moving && this.alive && this.lod < 2) {
      const ph = Math.floor((this.age * Math.max(0.6, this.currentSpeed() / Math.max(2, this.height * 0.45))) * 2)
      if (ph !== this.lastStep) {
        this.lastStep = ph
        const vol = clamp(this.height / 15, 0.2, 1.6)
        this.game.audio.play('titanStep', { pos: this.pos, volume: vol, pitch: clamp(1.5 - this.height / 40, 0.4, 1.4) })
        if (this.height > 10) {
          this.game.particles.emit('dust', this.pos.x, 0.5, this.pos.z, 3, { size: this.height / 10, spread: this.radius })
          this.game.shake(this.pos, Math.min(0.5, this.height / 80))
        }
      }
    }
  }

  currentSpeed() {
    let s = this.def.speed * (0.55 + this.height / 22) * this.speedMul
    if (this.type === 'abnormal' || this.def.boss) s = this.def.speed * this.speedMul
    if (this.slowT > 0) s *= 0.45
    return s
  }

  /** move toward a point with turning; returns distance remaining */
  moveTo(target: THREE.Vector3, dt: number, speedMul = 1, turnRate = 1.6) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.01) return 0
    const want = Math.atan2(dx, dz)
    const diff = angleDiff(this.yaw, want)
    const tr = turnRate * dt
    this.yaw += clamp(diff, -tr, tr)
    const sp = this.currentSpeed() * speedMul
    const f = Math.max(0, Math.cos(Math.min(Math.abs(diff), Math.PI / 2)))
    const step = Math.min(dist, sp * dt * (0.2 + 0.8 * f))
    const nx = this.pos.x + Math.sin(this.yaw) * step, nz = this.pos.z + Math.cos(this.yaw) * step
    this.tryMove(nx, nz)
    return dist
  }

  faceTo(target: THREE.Vector3, dt: number, rate = 2.5) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z)
    const diff = angleDiff(this.yaw, want)
    this.yaw += clamp(diff, -rate * dt, rate * dt)
    return Math.abs(diff)
  }

  /** keeps titans on their side of the wall unless passing through an opening */
  tryMove(nx: number, nz: number) {
    const w = this.game.walls
    const wasOut = !this.inside
    const out = w.isOutside(nx, nz), ins = w.isInside(nx, nz)
    if (wasOut && !out) {
      // entering the wall band: only allowed through an open entry
      if (!this.game.titans.inOpening(nx, nz, this.radius)) return false
      if (ins) this.inside = true
    } else if (!wasOut && !ins) {
      if (!this.game.titans.inOpening(nx, nz, this.radius)) return false
    }
    if (!wasOut && ins) this.inside = true
    this.pos.x = nx
    this.pos.z = nz
    return true
  }

  setStart(inside: boolean) {
    this.inside = inside
  }

  private holdVictim() {
    const v = this.victim!
    const hand = this.model.handR.getWorldPosition(new THREE.Vector3())
    if (v.kind === 'player') this.game.player.heldAt(hand)
    else if (v.npc) v.npc.pos.copy(hand).setY(hand.y - 0.8)
  }

  dispose() {
    this.model.dispose()
  }
}

/** Spawning, LOD updates, separation, hit queries, kill bookkeeping. */
export class TitanManager {
  list: Titan[] = []
  group = new THREE.Group()
  maxActive = 16
  private v = new THREE.Vector3()
  private v2 = new THREE.Vector3()
  private ray = new THREE.Ray()
  private box = new THREE.Box3()

  constructor(private g: GameEngine) {
    g.scene.add(this.group)
    this.maxActive = g.quality === 'low' ? 10 : g.quality === 'medium' ? 16 : 20
  }

  get alive() {
    return this.list.filter((t) => t.alive)
  }
  get aliveCount() {
    let n = 0
    for (const t of this.list) if (t.alive) n++
    return n
  }

  spawnPoint(dir: SpawnDir): THREE.Vector3 {
    const m = this.g.map
    const walls = this.g.walls
    const gate = walls.gate.seg
    if (dir === 'breach') {
      const br = walls.breakable.filter((s) => s.state === 2)
      const s = br.length ? br[Math.floor(Math.random() * br.length)] : gate
      return s.mid.clone().addScaledVector(s.out, rand(120, 170)).addScaledVector(s.dir, rand(-30, 30)).setY(0)
    }
    if (m.layout === 'district') {
      const R = m.radius
      const ang = dir === 'front' ? Math.PI / 2 + rand(-0.25, 0.25) : dir === 'left' ? rand(0.12, 0.45) : dir === 'right' ? Math.PI - rand(0.12, 0.45) : rand(0.6, 1.0)
      const r = R + (dir === 'forest' ? rand(240, 290) : rand(170, 230))
      return new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r)
    }
    const L = m.radius
    const x = dir === 'front' ? rand(-70, 70) : dir === 'left' ? rand(L * 0.5, L * 0.9) : dir === 'right' ? -rand(L * 0.5, L * 0.9) : rand(-L, L)
    return new THREE.Vector3(x, 0, dir === 'forest' ? rand(330, 370) : rand(250, 320))
  }

  spawn(type: TitanType, dir: SpawnDir, hpScale = 1, at?: THREE.Vector3, inside = false): Titan | null {
    if (this.aliveCount >= this.maxActive && !TITANS[type].boss && !at) return null
    const def = TITANS[type]
    const h = def.height[0] + Math.random() * (def.height[1] - def.height[0])
    const pos = at ? at.clone() : this.spawnPoint(dir)
    const t = new Titan(this.g, type, h, pos, (Math.random() * 1e6) | 0, hpScale)
    t.setStart(inside)
    t.yaw = Math.atan2(-pos.x + (this.g.walls.gate.seg.mid.x), -pos.z + this.g.walls.gate.seg.mid.z)
    this.list.push(t)
    this.group.add(t.model.root)
    if (def.boss) {
      this.g.banner(`${def.name}出现！`, 'danger')
      this.g.audio.play('titanRoar', { pos, volume: 1.4, pitch: type === 'colossal' ? 0.5 : 0.8 })
      this.g.audio.play('alarm', {})
    }
    return t
  }

  handleKill(t: Titan, src: DamageSource) {
    this.g.onTitanKilled(t, src)
  }

  /** is (x,z) within an open wall gap (gate or breach) */
  inOpening(x: number, z: number, r: number) {
    for (const s of this.g.walls.breakable) {
      if (!s.open) continue
      const rx = x - s.mid.x, rz = z - s.mid.z
      const along = rx * s.dir.x + rz * s.dir.z
      const across = rx * s.out.x + rz * s.out.z
      const half = s.gate ? 8 : 10
      if (Math.abs(along) < Math.max(1, half - r * 0.25) && Math.abs(across) < s.thick / 2 + 14) return true
    }
    return false
  }

  update(dt: number) {
    const cam = this.g.camera.position
    for (const t of this.list) t.update(dt, cam)
    // separation (avoid heavy overlap) + avoidance of giant trees
    const L = this.list
    for (let i = 0; i < L.length; i++) {
      const a = L[i]
      if (!a.alive || a.state === 'knockdown') continue
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]
        if (!b.alive) continue
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z
        const min = (a.radius + b.radius) * 1.05
        const d2 = dx * dx + dz * dz
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          const push = (min - d) * 0.5
          const wa = b.height / (a.height + b.height), wb = 1 - wa
          a.tryMove(a.pos.x - (dx / d) * push * wa * 2, a.pos.z - (dz / d) * push * wa * 2)
          b.tryMove(b.pos.x + (dx / d) * push * wb * 2, b.pos.z + (dz / d) * push * wb * 2)
        }
      }
      if (this.g.map.forest.giant && !a.inside)
        for (const tr of this.g.city.trees) {
          if (!tr.giant) continue
          const dx = a.pos.x - tr.x, dz = a.pos.z - tr.z
          const min = tr.r + a.radius
          const d2 = dx * dx + dz * dz
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2)
            a.tryMove(tr.x + (dx / d) * min, tr.z + (dz / d) * min)
          }
        }
    }
    for (let i = L.length - 1; i >= 0; i--) {
      if (L[i].removed) {
        this.group.remove(L[i].model.root)
        L[i].dispose()
        L.splice(i, 1)
      }
    }
  }

  /** ray vs titan hitboxes; returns nearest */
  raycast(o: THREE.Vector3, d: THREE.Vector3, max: number, includeDead = false) {
    let best: { t: number; titan: Titan; hb: Hitbox; point: THREE.Vector3 } | null = null
    for (const t of this.list) {
      if (!t.alive && (!includeDead || t.deathT > 2)) continue
      // bounding sphere quick reject
      this.v.copy(t.pos).setY(t.height * 0.5)
      this.ray.set(o, d)
      if (this.ray.distanceSqToPoint(this.v) > (t.height * 0.75) ** 2) continue
      for (const hb of t.model.hitboxes) {
        const lo = this.v.copy(o).applyMatrix4(hb.inv)
        const ld = this.v2.copy(o).add(d).applyMatrix4(hb.inv).sub(lo)
        this.box.min.copy(hb.center).sub(hb.half)
        this.box.max.copy(hb.center).add(hb.half)
        this.ray.set(lo, ld)
        const hit = this.ray.intersectBox(this.box, new THREE.Vector3())
        if (!hit) continue
        // param along ld (not normalised) equals world distance because ld = inv*d
        const tt = hit.sub(lo).length() / ld.length()
        if (tt <= max && (!best || tt < best.t)) best = { t: tt, titan: t, hb, point: o.clone().addScaledVector(d, tt) }
      }
    }
    return best
  }

  /** all hitboxes overlapping a sphere, best per titan (nape preferred) */
  overlap(c: THREE.Vector3, r: number, filter?: (t: Titan) => boolean) {
    const out: { titan: Titan; hb: Hitbox; dist: number; point: THREE.Vector3 }[] = []
    const prio = { nape: 0, head: 1, armL: 2, armR: 2, legL: 3, legR: 3, body: 4 }
    for (const t of this.list) {
      if (!t.alive || (filter && !filter(t))) continue
      if (Math.hypot(t.pos.x - c.x, t.pos.z - c.z) > t.height + r + 4) continue
      let best: (typeof out)[number] | null = null
      const s = t.model.scale
      for (const hb of t.model.hitboxes) {
        const lc = this.v.copy(c).applyMatrix4(hb.inv)
        const qx = clamp(lc.x, hb.center.x - hb.half.x, hb.center.x + hb.half.x)
        const qy = clamp(lc.y, hb.center.y - hb.half.y, hb.center.y + hb.half.y)
        const qz = clamp(lc.z, hb.center.z - hb.half.z, hb.center.z + hb.half.z)
        const dist = Math.hypot(lc.x - qx, lc.y - qy, lc.z - qz) * s
        if (dist > r) continue
        const cand = { titan: t, hb, dist, point: new THREE.Vector3(qx, qy, qz).applyMatrix4(hb.world) }
        if (!best || prio[hb.part] < prio[best.hb.part] || (prio[hb.part] === prio[best.hb.part] && dist < best.dist)) best = cand
      }
      if (best) out.push(best)
    }
    return out
  }

  /** push a sphere out of titan bodies (so the player can land on shoulders/heads) */
  pushOut(p: THREE.Vector3, r: number): { hit: boolean; titan: Titan | null; up: boolean } {
    let hit = false, up = false
    let who: Titan | null = null
    for (const t of this.list) {
      if (!t.alive && t.deathT > 1.5) continue
      if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) > t.height + r) continue
      const s = t.model.scale
      for (const hb of t.model.hitboxes) {
        if (hb.part === 'nape') continue
        const lc = this.v.copy(p).applyMatrix4(hb.inv)
        const lr = r / s
        const qx = clamp(lc.x, hb.center.x - hb.half.x, hb.center.x + hb.half.x)
        const qy = clamp(lc.y, hb.center.y - hb.half.y, hb.center.y + hb.half.y)
        const qz = clamp(lc.z, hb.center.z - hb.half.z, hb.center.z + hb.half.z)
        const dx = lc.x - qx, dy = lc.y - qy, dz = lc.z - qz
        const d = Math.hypot(dx, dy, dz)
        if (d >= lr || d < 1e-5) continue
        const push = (lr - d) / d
        lc.x += dx * push
        lc.y += dy * push
        lc.z += dz * push
        const wp = lc.applyMatrix4(hb.world)
        if (wp.y > p.y + 0.01) up = true
        p.copy(wp)
        hit = true
        who = t
      }
    }
    return { hit, titan: who, up }
  }

  nearest(p: THREE.Vector3, max: number, filter?: (t: Titan) => boolean) {
    let best: Titan | null = null, bd = max
    for (const t of this.list) {
      if (!t.alive || (filter && !filter(t))) continue
      const d = t.pos.distanceTo(p)
      if (d < bd) {
        bd = d
        best = t
      }
    }
    return best
  }

  get boss() {
    return this.list.find((t) => t.alive && t.def.boss) ?? null
  }

  clear() {
    for (const t of this.list) {
      this.group.remove(t.model.root)
      t.dispose()
    }
    this.list.length = 0
  }

  dispose() {
    this.clear()
    this.g.scene.remove(this.group)
  }
}

export type { TitanPose }
