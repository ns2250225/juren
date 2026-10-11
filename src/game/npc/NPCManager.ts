import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import { Soldier, type SoldierKind, type Order } from './SoldierAI'
import { Civilian } from './CivilianAI'
import type { Titan } from '../titans/TitanManager'
import type { Building } from '../world/CityManager'
import type { WallSegment } from '../world/WallSystem'
import { rand } from '../../utils/math'

type AnyNpc = Soldier | Civilian

interface Buff {
  center: THREE.Vector3 | null
  range: number
  t: number
  success: number
  speed: number
}

/** Owns all NPCs: 调查兵团 / 驻屯兵团 / 工程兵 / 医疗兵 / 居民 / 指挥官. */
export class NPCManager {
  group = new THREE.Group()
  soldiers: Soldier[] = []
  civilians: Civilian[] = []
  commander: Soldier | null = null
  order: Order = 'attack'
  evacuating = false
  saved = 0
  lost = 0
  soldiersLost = 0
  cheerT = 0
  cheerPos = new THREE.Vector3()
  flarePoint: THREE.Vector3 | null = null
  flareT = 0
  private buffs: Buff[] = []
  private reinforceT = 60
  maxSurvey: number
  private cullAcc = 0

  constructor(private g: GameEngine) {
    g.scene.add(this.group)
    const q = g.quality
    this.maxSurvey = q === 'low' ? 8 : q === 'medium' ? 10 : 12
  }

  populate(civCount?: number) {
    const g = this.g
    const q = g.quality
    const nCiv = civCount ?? (q === 'low' ? 12 : q === 'medium' ? 22 : 30)
    for (let i = 0; i < nCiv; i++) {
      const p = g.city.wanderPoints[i % g.city.wanderPoints.length]
      if (p) this.civilians.push(new Civilian(g, p.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)))))
    }
    const nSurvey = q === 'low' ? 4 : q === 'medium' ? 5 : 6
    for (let i = 0; i < nSurvey; i++) this.addSoldier('survey', this.perchNear(this.homeArea()))
    const nEng = q === 'low' ? 2 : 3
    for (let i = 0; i < nEng; i++) this.addSoldier('engineer', this.groundNear(g.city.hq.pos))
    for (let i = 0; i < (q === 'low' ? 1 : 2); i++) this.addSoldier('medic', this.groundNear(g.city.hq.pos))
    this.commander = this.addSoldier('commander', this.groundNear(g.city.hq.pos.clone().add(new THREE.Vector3(0, 0, 9))))
    // garrison along the wall top near the gate
    const gate = g.walls.gate.seg
    const segs = g.walls.breakable.filter((s) => !s.gate).sort((a, b) => a.mid.distanceTo(gate.mid) - b.mid.distanceTo(gate.mid)).slice(0, 6)
    for (const s of segs) this.addSoldier('garrison', s.mid.clone().addScaledVector(s.out, -1.5).addScaledVector(s.dir, rand(-6, 6)).setY(s.height))
  }

  addSoldier(kind: SoldierKind, pos: THREE.Vector3) {
    const s = new Soldier(this.g, kind, pos)
    this.soldiers.push(s)
    return s
  }

  homeArea() {
    const g = this.g
    return g.map.layout === 'district' ? new THREE.Vector3(rand(-60, 60), 0, rand(40, g.map.radius - 40)) : new THREE.Vector3(rand(-120, 120), 0, rand(-120, -30))
  }

  /** a rooftop or wall-top perch near a point */
  perchNear(p: THREE.Vector3): THREE.Vector3 {
    const g = this.g
    let best: Building | null = null, bd = 60
    for (const b of g.city.houses) {
      if (b.state !== 0) continue
      const d = Math.hypot(b.x - p.x, b.z - p.z)
      if (d < bd) {
        bd = d
        best = b
      }
    }
    if (best) return new THREE.Vector3(best.x + rand(-1, 1), best.h + best.roofH * 0.85, best.z)
    const seg = g.walls.nearestSegment(p)
    if (seg.mid.distanceTo(p) < 80 && seg.state < 2) return seg.mid.clone().addScaledVector(seg.out, -2).setY(seg.height)
    return p.clone().setY(Math.max(0, p.y))
  }

  groundNear(p: THREE.Vector3) {
    const f = this.g.city.nav.nearestFree(p.x, p.z, 10)
    return f ? new THREE.Vector3(f[0], 0, f[1]) : p.clone().setY(0)
  }

  retreatPoint() {
    const hq = this.g.city.hq
    return hq.state < 2 ? new THREE.Vector3(hq.x + rand(-4, 4), hq.h + 0.2, hq.z) : this.g.city.safePoint.clone()
  }

  get surveyAlive() {
    return this.soldiers.filter((s) => s.alive && s.kind === 'survey').length
  }
  get civiliansAlive() {
    return this.civilians.filter((c) => c.alive && c.state !== 'saved').length
  }
  get soldiersAlive() {
    return this.soldiers.filter((s) => s.alive).length
  }

  successBuff(p: THREE.Vector3) {
    let s = 0
    for (const b of this.buffs) if (!b.center || b.center.distanceTo(p) < b.range) s += b.success
    return s
  }
  speedBuff(p: THREE.Vector3) {
    let s = 0
    for (const b of this.buffs) if (!b.center || b.center.distanceTo(p) < b.range) s += b.speed
    return s
  }
  buff(range: number, t: number, success: number, speed: number, center?: THREE.Vector3) {
    this.buffs.push({ center: center ? center.clone() : null, range, t, success, speed })
  }

  /** survey soldiers choose titans nearest the city core (PRD §9.2) */
  pickTarget(s: Soldier): Titan | null {
    const g = this.g
    const core = g.city.core.pos
    let best: Titan | null = null, bs = Infinity
    for (const t of g.titans.list) {
      if (!t.alive) continue
      const dS = t.pos.distanceTo(s.pos)
      if (this.order === 'defend' && t.pos.distanceTo(core) > 80) continue
      if (this.order === 'rally' && t.pos.distanceTo(g.player.pos) > 45) continue
      if (dS > 230) continue
      // let titans come to the walls: only engage near the city (or at a flare / rally point)
      const nearCity = t.inside || g.walls.nearestSegment(t.pos).mid.distanceTo(t.pos) < 75 || t.pos.distanceTo(core) < 120
      const flared = this.flarePoint && this.flareT > 0 && t.pos.distanceTo(this.flarePoint) < 60
      if (!nearCity && !flared && this.order !== 'rally') continue
      let score = t.pos.distanceTo(core) * 0.6 + dS
      if (this.flarePoint && this.flareT > 0 && t.pos.distanceTo(this.flarePoint) < 60) score -= 200
      if (t.type === 'colossal' && t.colossalSteam > 0) score += 400
      // spread soldiers across titans
      const engaged = this.soldiers.filter((o) => o.target === t).length
      score += engaged * 40
      if (score < bs) {
        bs = score
        best = t
      }
    }
    return best
  }

  setOrder(o: Order) {
    this.order = o
    for (const s of this.soldiers) s.target = null
    const txt = o === 'attack' ? '全员进攻！优先拦截靠近内城的巨人' : o === 'defend' ? '全员防守内城核心！' : '全员向我集结！'
    this.g.banner(`指挥官：${txt}`, 'info')
    this.g.audio.play('soldierShout', { volume: 0.8 })
  }

  flareTarget(p: THREE.Vector3) {
    this.flarePoint = p.clone()
    this.flareT = 15
    for (const s of this.soldiers) if (s.kind === 'survey') s.target = null
  }

  spawnReinforcements(n: number, near: THREE.Vector3) {
    const g = this.g
    let spawned = 0
    for (let i = 0; i < n; i++) {
      if (this.surveyAlive >= this.maxSurvey + 6) break
      const start = g.walls.isInside(near.x, near.z) ? near.clone().add(new THREE.Vector3(rand(-30, 30), 25, rand(-30, 30))) : this.perchNear(this.homeArea()).setY(30)
      const s = this.addSoldier('survey', start)
      s.post.copy(this.perchNear(near.clone().add(new THREE.Vector3(rand(-20, 20), 0, rand(-20, 20)))))
      s.hopTo(s.post, s.post.clone().add(new THREE.Vector3(0, 12, 0)))
      spawned++
    }
    if (spawned) {
      g.banner('调查兵团增援抵达！', 'good')
      g.audio.play('waveStart', { volume: 0.5, pitch: 1.2 })
    }
  }

  barracksSpawn(at: THREE.Vector3) {
    if (this.surveyAlive >= this.maxSurvey) return
    const s = this.addSoldier('survey', at.clone())
    s.post.copy(this.perchNear(this.homeArea()))
  }

  evacuate() {
    this.evacuating = true
    this.g.banner('居民疏散！保护居民撤往内城门', 'warn')
    this.g.audio.play('bell', {})
  }

  /** 居民求救: a group of civilians stuck near a breach/gate */
  sos() {
    const g = this.g
    const gate = g.walls.gate.seg
    const seg = g.walls.breakable.find((s) => s.state === 2) ?? gate
    const base = seg.inside.clone().addScaledVector(seg.out, -10)
    const f = g.city.nav.nearestFree(base.x, base.z, 12)
    if (!f) return
    for (let i = 0; i < 4; i++) {
      const c = new Civilian(g, new THREE.Vector3(f[0] + rand(-3, 3), 0, f[1] + rand(-3, 3)))
      c.sos = true
      this.civilians.push(c)
    }
    const t = g.titans.spawn('abnormal', 'front', 1, seg.outside.clone().addScaledVector(seg.out, 30))
    if (t) {
      t.entry = seg
    }
    g.banner('居民求救！拦截追击居民的巨人', 'warn')
  }

  cheerNear(p: THREE.Vector3) {
    this.cheerT = 2.5
    this.cheerPos.copy(p)
  }

  // ---------------------------------------------------------------- titan interactions
  private all(): AnyNpc[] {
    return [...this.civilians, ...this.soldiers]
  }

  findVictim(p: THREE.Vector3, r: number): { pos: THREE.Vector3 } | null {
    let best: AnyNpc | null = null, bd = r
    for (const c of this.civilians) {
      if (!c.alive || c.held || c.state === 'saved') continue
      const d = c.pos.distanceTo(p)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    if (best) return best
    for (const s of this.soldiers) {
      if (!s.alive || s.held || s.kind === 'garrison' || s.kind === 'commander' || s.flying) continue
      const d = s.pos.distanceTo(p)
      if (d < bd * 0.7 && s.pos.y < 6) {
        bd = d
        best = s
      }
    }
    return best
  }

  grabAt(hand: THREE.Vector3, r: number, t: Titan) {
    for (const n of this.all()) {
      if (!n.alive || n.held || (n instanceof Civilian && n.state === 'saved')) continue
      if (n instanceof Soldier && (n.kind === 'commander' || n.flying)) continue
      if (n.pos.distanceTo(hand) < r + 1.5) {
        n.held = t
        if (n instanceof Civilian) this.g.audio.play('scream', { pos: n.pos, pitch: 1.4 })
        return n
      }
    }
    return null
  }

  releaseNpc(id: number) {
    const n = this.all().find((x) => x.id === id)
    if (n) n.held = null
  }

  eaten(id: number, t: Titan) {
    const n = this.all().find((x) => x.id === id)
    if (!n || !n.alive) return
    n.kill()
    this.g.particles.emit('blood', n.pos.x, n.pos.y, n.pos.z, 12, { speed: 3, size: 1 })
    if (n instanceof Civilian) {
      this.lost++
      if (this.lost % 3 === 1) this.g.banner('居民遇难…', 'danger')
    } else {
      this.soldiersLost++
      if (this.soldiersLost % 3 === 1) this.g.banner('士兵阵亡！', 'danger')
    }
    n.model.root.visible = false
    void t
  }

  swatAt(p: THREE.Vector3, r: number) {
    for (const n of this.all()) {
      if (!n.alive || n.held) continue
      if (n.pos.distanceTo(p) > r) continue
      if (n instanceof Civilian) {
        n.kill()
        this.lost++
      } else {
        if (n.kind === 'commander') continue
        n.hp -= 70
        if (n.hp <= 0) {
          n.kill()
          this.soldiersLost++
        }
      }
    }
  }

  civilianSaved(c: Civilian) {
    this.saved++
    c.model.root.visible = false
    this.g.resources.score += 50
    this.g.resources.add(10, 0)
    if (this.saved % 5 === 0) this.g.banner(`已疏散居民 ${this.saved} 人`, 'good')
  }

  injured(p: THREE.Vector3): Soldier | null {
    let best: Soldier | null = null, bd = 100
    for (const s of this.soldiers) {
      if (!s.alive || s.hp > 70 || s.pos.y > 3 || s.held) continue
      const d = s.pos.distanceTo(p)
      if (d < bd) {
        bd = d
        best = s
      }
    }
    return best
  }

  findRepairJob(p: THREE.Vector3): { b?: Building; s?: WallSegment; p: THREE.Vector3 } | null {
    const g = this.g
    let best: { b?: Building; s?: WallSegment; p: THREE.Vector3 } | null = null, bs = Infinity
    for (const s of g.walls.breakable) {
      if (s.gate || s.hp >= s.maxHp) continue
      if (g.titans.nearest(s.mid, 60)) continue
      const score = s.mid.distanceTo(p) * 0.5 + s.hpFrac * 200
      if (score < bs) {
        bs = score
        best = { s, p: s.inside.clone() }
      }
    }
    const gate = g.walls.gate
    if (gate.hp < gate.maxHp && !g.titans.nearest(gate.seg.mid, 60)) {
      const score = gate.seg.mid.distanceTo(p) * 0.5 + (gate.hp / gate.maxHp) * 150
      if (score < bs) {
        bs = score
        best = { s: gate.seg, p: gate.seg.inside.clone() }
      }
    }
    for (const b of g.city.buildings) {
      if (b.hp >= b.maxHp || b.kind === 'core') continue
      const d = Math.hypot(b.x - p.x, b.z - p.z)
      if (d > 160 || g.titans.nearest(b.pos, 50)) continue
      const score = d + (b.hp / b.maxHp) * 150
      if (score < bs) {
        bs = score
        const front = new THREE.Vector3(b.x + Math.sin(b.yaw) * (b.d / 2 + 2), 0, b.z + Math.cos(b.yaw) * (b.d / 2 + 2))
        best = { b, p: front }
      }
    }
    return best
  }

  update(dt: number) {
    const g = this.g
    this.cheerT = Math.max(0, this.cheerT - dt)
    this.flareT = Math.max(0, this.flareT - dt)
    for (const b of this.buffs) b.t -= dt
    this.buffs = this.buffs.filter((b) => b.t > 0)
    // commander: periodic reinforcement call while fighting
    if (g.waves.phase === 'combat' && this.commander?.alive && g.city.hq.state < 2) {
      this.reinforceT -= dt
      if (this.reinforceT <= 0) {
        this.reinforceT = 75
        if (this.surveyAlive < this.maxSurvey) this.spawnReinforcements(3, g.city.hq.pos)
      }
    }
    // distance culling of NPC models
    this.cullAcc += dt
    const doCull = this.cullAcc > 0.25
    if (doCull) this.cullAcc = 0
    const cam = g.camera.position
    const upd = (n: AnyNpc, far: number) => {
      if (doCull) {
        const d = n.pos.distanceTo(cam)
        n.visible = d < far
        n.model.root.visible = n.visible && !(n instanceof Civilian && n.state === 'saved') && !(n.alive === false && (n as Soldier).deadT > 4)
      }
      n.update(dt)
    }
    for (const c of this.civilians) upd(c, 130)
    for (const s of this.soldiers) upd(s, 220)
    // cleanup
    for (let i = this.civilians.length - 1; i >= 0; i--) {
      const c = this.civilians[i]
      if ((!c.alive && c.deadT > 5) || c.state === 'saved') {
        c.dispose()
        this.civilians.splice(i, 1)
      }
    }
    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      const s = this.soldiers[i]
      if (!s.alive && s.deadT > 5) {
        s.dispose()
        this.soldiers.splice(i, 1)
      }
    }
    if (this.evacuating && this.civiliansAlive === 0) this.evacuating = false
  }

  /** rebalance garrison onto built cannons */
  assignGarrison(slotPos: THREE.Vector3, out: THREE.Vector3) {
    const free = this.soldiers.find((s) => s.alive && s.kind === 'garrison' && s.manSlot < 0)
    const s = free ?? this.addSoldier('garrison', slotPos.clone())
    s.manSlot = 1
    s.pos.copy(slotPos).addScaledVector(out, -2.2).setY(slotPos.y)
    s.post.copy(s.pos)
  }

  dispose() {
    for (const n of this.all()) n.dispose()
    this.soldiers.length = 0
    this.civilians.length = 0
    this.g.scene.remove(this.group)
  }
}
