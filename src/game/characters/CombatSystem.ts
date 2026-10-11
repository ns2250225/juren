import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import type { Titan } from '../titans/TitanManager'
import type { Hitbox } from '../models/TitanModel'
import { applyHit, type DamageSource, type HitResult } from '../titans/TitanWeakpoints'
import { rand } from '../../utils/math'

/** Blade hits, kill credit, combo & score, battle callouts (PRD §6.4, §10.3). */
export class CombatSystem {
  kills = 0
  napeKills = 0
  bossKills = 0
  combo = 0
  comboT = 0
  maxCombo = 0
  private lastKillT = -99
  private v = new THREE.Vector3()

  constructor(private g: GameEngine) {}

  /** a blade cut connected with a titan hitbox */
  slashHit(t: Titan, hb: Hitbox, point: THREE.Vector3, speed: number, mult = 1): HitResult {
    const p = this.g.player
    const s = p.stats
    if (p.bladeBroken) {
      this.g.effects.floatText(point, '刀刃已断！', 'warn')
      this.g.particles.emit('spark', point.x, point.y, point.z, 6, { speed: 4 })
      this.g.audio.play('bladeBreak', { pos: point, volume: 0.5 })
      return { killed: false, nape: false, deflected: true, damage: 0, text: '', bladeWear: 0 }
    }
    const sharp = 0.45 + 0.55 * (p.sharpness / 100)
    const speedF = 1 + Math.min(speed, 60) / 22
    let dmg = 55 * s.damage * sharp * speedF * mult * p.buffDamage()
    if (hb.part === 'nape') dmg *= s.napeMult
    const res = applyHit(t, hb.part, dmg, 'player', { armorPierce: s.armorPierce, point, speed, napeMult: 1 })
    p.wearBlades(res.bladeWear)
    const pfx = this.g.particles
    if (res.deflected) {
      pfx.emit('spark', point.x, point.y, point.z, 14, { speed: 7 })
      this.g.audio.play('bladeHit', { pos: point, pitch: 1.6 })
      if (res.text) this.g.effects.floatText(point, res.text, res.armorBroken ? 'crit' : 'warn')
      if (res.armorBroken) {
        this.g.banner('铠之巨人后颈装甲碎裂！', 'good')
        pfx.chunks(point.x, point.y, point.z, 12, '#e3d7b8', 9, 0.8)
      }
      return res
    }
    // titan blood bursts then evaporates into steam
    pfx.emit('blood', point.x, point.y, point.z, hb.part === 'nape' ? 22 : 10, { speed: 6, size: t.height / 12 })
    pfx.emit('steam', point.x, point.y, point.z, 4, { size: t.height / 10, spread: 0.6 })
    if (hb.part === 'nape') {
      this.g.audio.play('napeHit', { pos: point, volume: 1.1 })
      if (res.killed) {
        this.g.loop.slowMo(0.25, 0.32)
        this.g.camCtl.addTrauma(0.35)
      } else {
        this.g.effects.floatText(point, `-${res.damage}`, 'crit')
        this.g.banner('后颈命中！', 'kill')
        this.g.loop.slowMo(0.45, 0.15)
      }
    } else {
      this.g.audio.play('bladeHit', { pos: point })
      this.g.effects.floatText(point, res.text ? `${res.text} -${res.damage}` : `-${res.damage}`, '')
    }
    p.rage = Math.min(100, p.rage + (hb.part === 'nape' ? 6 : 2))
    return res
  }

  onKilled(t: Titan, src: DamageSource) {
    const g = this.g
    const byPlayer = src === 'player' || src === 'skill' || src === 'eren'
    const r = t.def.reward
    const pos = t.model.napeWorld(this.v).clone()
    g.resources.add(byPlayer ? r.funds : Math.round(r.funds * 0.5), byPlayer ? r.materials : Math.round(r.materials * 0.5))
    g.profileKill(t.type)
    if (t.def.boss) {
      this.bossKills++
      g.banner(`${t.def.name}已被击败！`, 'good')
      g.audio.play('waveClear', {})
    }
    if (!byPlayer) {
      g.resources.score += Math.round(r.score * 0.3)
      if (src === 'npc') g.effects.floatText(pos, '士兵斩杀！', 'good')
      return
    }
    this.kills++
    if (src !== 'eren') this.napeKills++
    const now = g.time
    const dbl = now - this.lastKillT < 2.5
    this.lastKillT = now
    this.combo = this.comboT > 0 ? this.combo + 1 : 1
    this.comboT = 8
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    const mult = 1 + (this.combo - 1) * 0.15
    const speed = g.player.speed
    const perfect = speed >= 28 || t.markedT > 0
    const score = Math.round(r.score * mult * (perfect ? 1.5 : 1))
    g.resources.score += score
    g.resources.merit += t.def.boss ? 25 : 2
    g.player.rage = Math.min(100, g.player.rage + (t.def.boss ? 40 : 22))
    g.effects.floatText(pos, `+${score}`, 'score')
    g.audio.play('kill', { volume: 0.9 })
    if (this.combo >= 3) g.audio.play('combo', { pitch: 1 + Math.min(this.combo, 10) * 0.06 })
    if (src === 'eren') g.banner('巨人之力·粉碎！', 'kill')
    else if (dbl) g.banner(this.combo >= 3 ? `双杀！ 连续斩杀 ×${this.combo}！` : '双杀！', 'kill')
    else if (this.combo >= 3) g.banner(`连续斩杀 ×${this.combo}！`, 'kill')
    else if (perfect) g.banner('完美斩杀！', 'kill')
    else g.banner('后颈命中！', 'kill')
    for (let i = 0; i < 2; i++) g.particles.emit('steam', pos.x + rand(-1, 1), pos.y, pos.z + rand(-1, 1), 6, { size: t.height / 6, up: 4 })
  }

  update(dt: number) {
    if (this.comboT > 0) {
      this.comboT -= dt
      if (this.comboT <= 0) this.combo = 0
    }
  }

  resetCombo() {
    this.combo = 0
    this.comboT = 0
  }
}
