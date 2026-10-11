import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import { buildWave, EVENT_TEXT, type WaveDef, type WaveEventType } from '../../data/waves'
import type { TitanType } from '../../data/titans'
import type { SpawnDir } from '../../data/maps'
import type { Phase } from '../../stores/game'
import { rand } from '../../utils/math'

interface Pending {
  type: TitanType
  dir: SpawnDir
  at: number
}

/** Wave progression, spawn scheduling with an on-screen cap, intermissions and special events (PRD §7). */
export class WaveManager {
  phase: Phase = 'intro'
  wave = 0
  def: WaveDef | null = null
  t = 0
  intermission = 25
  pending: Pending[] = []
  private firedEvents = new Set<number>()
  spawnedThisWave = 0
  totalThisWave = 0
  maxWaves: number
  private steamT = 0

  constructor(private g: GameEngine) {
    this.maxWaves = g.modeDef.waves
  }

  get remaining() {
    return this.pending.length + this.g.titans.aliveCount
  }

  startIntro(seconds = 25) {
    this.phase = 'intro'
    this.intermission = seconds
  }

  startWave(n: number) {
    const g = this.g
    this.wave = n
    this.def = buildWave(n, g.map)
    this.t = 0
    this.phase = 'combat'
    this.firedEvents.clear()
    this.pending = []
    for (const grp of this.def.groups) for (let i = 0; i < grp.count; i++) this.pending.push({ type: grp.type, dir: grp.dir, at: grp.delay + i * grp.interval + rand(0, grp.interval * 0.5) })
    this.pending.sort((a, b) => a.at - b.at)
    this.totalThisWave = this.pending.length
    this.spawnedThisWave = 0
    g.banner(`第 ${String(n).padStart(2, '0')} 波 · ${this.def.name}`, 'danger')
    g.audio.play('waveStart', { volume: 1 })
    g.audio.play('bell', { volume: 0.8 })
    g.audio.playMusic(this.def.boss ? 'boss' : 'battle')
    g.closeShop()
    if (this.def.tutorial) g.startTutorial()
    else g.endTutorial()
  }

  skip() {
    if (this.phase === 'intermission' || this.phase === 'intro') this.intermission = 0
  }

  private fireEvent(type: WaveEventType) {
    const g = this.g
    const walls = g.walls
    switch (type) {
      case 'breach': {
        const cands = walls.breakable.filter((s) => !s.gate && s.state < 2)
        if (!cands.length) return
        const s = cands[Math.floor(Math.random() * cands.length)]
        g.banner(`特殊事件：${EVENT_TEXT.breach}！`, 'danger')
        g.destruction.breach(s)
        for (let i = 0; i < 3; i++) this.pending.push({ type: 'normal', dir: 'breach', at: this.t + 3 + i * 2 })
        this.totalThisWave += 3
        break
      }
      case 'supplyFire': {
        const list = g.city.supplyDepots.filter((b) => b.alive)
        if (!list.length) return
        const b = list[Math.floor(Math.random() * list.length)]
        b.fire = 30
        b.burning = 30
        g.banner('补给站失火！暂时无法补给', 'warn')
        g.audio.play('alarm', {})
        break
      }
      case 'abnormalRaid': {
        g.banner('奇行种突袭！高速巨人正在绕过正面防线', 'danger')
        const dir: SpawnDir = Math.random() < 0.5 ? 'left' : 'right'
        for (let i = 0; i < 3; i++) this.pending.push({ type: 'abnormal', dir: g.map.spawnDirs.includes(dir) ? dir : 'front', at: this.t + i * 1.5 })
        this.totalThisWave += 3
        break
      }
      case 'civilianSOS':
        g.npcs.sos()
        this.totalThisWave += 1
        break
      case 'reinforce':
        g.npcs.spawnReinforcements(4, g.city.hq.pos)
        break
      case 'steam':
        this.steamT = 22
        g.banner('巨人蒸汽弥漫，视野降低！', 'warn')
        break
      case 'evacuate':
        g.npcs.evacuate()
        break
      case 'gateAssault':
        g.banner('城门遭袭！巨人集中攻击城门', 'danger')
        for (const t of g.titans.list) if (t.alive && !t.inside && t.type === 'normal') t.entry = walls.gate.seg
        break
      case 'colossal': {
        g.banner('超大型巨人出现！', 'danger')
        const p = g.titans.spawnPoint('front')
        g.effects.lightning(p.clone().setY(300), p.clone().setY(30))
        g.flashScreen()
        g.camCtl.addTrauma(0.8)
        g.audio.play('transform', { pos: p, volume: 1.4 })
        break
      }
    }
  }

  update(dt: number) {
    const g = this.g
    // steam fog event
    if (this.steamT > 0) {
      this.steamT -= dt
      g.env.extraFog = Math.min(0.85, g.env.extraFog + dt * 0.5)
    } else g.env.extraFog = Math.max(0, g.env.extraFog - dt * 0.3)

    if (this.phase === 'intro' || this.phase === 'intermission') {
      this.intermission -= dt
      if (this.intermission <= 0) this.startWave(this.wave + 1)
      return
    }
    if (this.phase !== 'combat' || !this.def) return
    this.t += dt
    // events
    this.def.events.forEach((e, i) => {
      if (!this.firedEvents.has(i) && this.t >= e.at) {
        this.firedEvents.add(i)
        this.fireEvent(e.type)
      }
    })
    // spawns, respecting on-screen cap (bosses always)
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i]
      if (p.at > this.t) break
      const t = g.titans.spawn(p.type, p.dir, this.def.hpScale)
      if (t) {
        this.pending.splice(i, 1)
        i--
        this.spawnedThisWave++
        if (p.type === 'abnormal' && Math.random() < 0.3) g.banner('奇行种出现！', 'warn')
      } else break
    }
    if (this.pending.length === 0 && g.titans.aliveCount === 0 && this.t > 5) this.waveCleared()
  }

  private waveCleared() {
    const g = this.g
    const d = this.def!
    g.resources.add(d.reward.funds, d.reward.materials)
    g.resources.score += 500 + this.wave * 100
    g.resources.merit += 5
    g.audio.play('waveClear', {})
    g.banner(`第 ${this.wave} 波防守成功！ 资金 +${d.reward.funds} 材料 +${d.reward.materials}`, 'good')
    g.npcs.evacuating = false
    if (this.wave >= this.maxWaves) {
      this.phase = 'over'
      g.endGame(true, '成功守住了城市！')
      return
    }
    this.phase = 'intermission'
    this.intermission = 35
    g.audio.playMusic('intermission')
    g.onIntermission()
  }

  dispose() {
    this.pending.length = 0
  }
}

export const _v = new THREE.Vector3()
