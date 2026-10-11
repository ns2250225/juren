import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import type { SkillHud } from '../../stores/game'

/** Character signature skill (1) + 信号弹 (2) + 空中冲刺 (3). */
export class Skills {
  cd = [0, 0, 0]
  max: number[]
  mikasaT = 0
  erwinT = 0
  arminT = 0

  constructor(private g: GameEngine) {
    const p = g.player
    this.max = [g.char.skillCooldown * p.stats.cooldownMult, 25 * p.stats.cooldownMult, p.stats.dodgeCD]
  }

  use(i: number) {
    const g = this.g
    const p = g.player
    if (!p.alive || p.grabbedBy && i !== 2) {
      if (p.grabbedBy && i === 2) return this.use3()
      return
    }
    if (this.cd[i] > 0) return
    if (i === 0) this.useSignature()
    else if (i === 1) this.useFlare()
    else this.use3()
  }

  private use3() {
    const p = this.g.player
    if (this.cd[2] > 0 || p.titanForm) return
    if (p.dash()) this.cd[2] = this.max[2]
  }

  private useFlare() {
    const g = this.g
    const p = g.player
    if (p.titanForm) return
    const ray = g.aimRay()
    g.projectiles.flare(p.pos.clone().setY(p.pos.y + 1.6), ray.d.clone().multiplyScalar(70).add(new THREE.Vector3(0, 25, 0)))
    g.audio.play('flare', { pos: p.pos })
    g.banner('信号弹：士兵向该区域集结！', 'info')
    this.cd[1] = this.max[1]
  }

  private useSignature() {
    const g = this.g
    const p = g.player
    switch (g.char.skill) {
      case 'titan':
        if (p.titanForm) return
        if (p.rage < 100) {
          g.banner(`怒气不足（${Math.floor(p.rage)}%）：斩杀巨人积累怒气`, 'info')
          return
        }
        p.transform()
        this.cd[0] = this.max[0]
        break
      case 'combo':
        this.mikasaT = 12
        g.banner('三笠·连续斩击！', 'good')
        g.audio.play('dash', { volume: 1 })
        this.cd[0] = this.max[0]
        break
      case 'spin': {
        const t = p.findSpinTarget()
        if (!t) {
          g.banner('前方没有可锁定的巨人', 'info')
          return
        }
        p.startSpin(t)
        this.cd[0] = this.max[0]
        break
      }
      case 'command': {
        let n = 0
        for (const t of g.titans.list) if (t.alive && t.pos.distanceTo(p.pos) < 150) {
          t.markedT = 15
          n++
        }
        this.arminT = 15
        g.npcs.buff(9999, 15, 0.5, 0)
        g.banner(`战场指挥：标记 ${n} 只巨人，兵团效率提升！`, 'good')
        g.audio.play('waveStart', { volume: 0.6, pitch: 1.3 })
        this.cd[0] = this.max[0]
        break
      }
      case 'charge':
        this.erwinT = 20
        g.npcs.spawnReinforcements(6, p.pos)
        g.npcs.buff(100, 20, 0.6, 0.4, p.pos)
        g.banner('献出心脏！全军突击！', 'good')
        g.audio.play('waveStart', { volume: 1 })
        g.audio.play('soldierShout', { volume: 1 })
        this.cd[0] = this.max[0]
        break
      case 'research': {
        const ray = g.aimRay()
        const hit = g.collision.raycast(ray.o, ray.d, 160)
        const th = g.titans.raycast(ray.o, ray.d, 160)
        let target = hit ? hit.point : ray.o.clone().addScaledVector(ray.d, 80)
        if (th && (!hit || th.t < hit.t)) target = th.titan.pos.clone()
        else {
          // assist: nearest titan inside a 25° cone around the crosshair
          let best = 0.44
          for (const t of g.titans.list) {
            if (!t.alive || t.pos.distanceTo(p.pos) > 140) continue
            const a = t.pos.clone().setY(t.height * 0.5).sub(ray.o).normalize().angleTo(ray.d)
            if (a < best) {
              best = a
              target = t.pos.clone()
            }
          }
        }
        target.y = 0
        g.projectiles.capture(p.pos.clone().setY(p.pos.y + 1.4), target)
        g.banner('巨人研究：捕获装置已发射！', 'good')
        this.cd[0] = this.max[0]
        break
      }
    }
  }

  update(dt: number) {
    for (let i = 0; i < 3; i++) this.cd[i] = Math.max(0, this.cd[i] - dt)
    this.mikasaT = Math.max(0, this.mikasaT - dt)
    this.erwinT = Math.max(0, this.erwinT - dt)
    this.arminT = Math.max(0, this.arminT - dt)
  }

  hud(): SkillHud[] {
    const g = this.g
    const p = g.player
    const active = g.char.skill === 'combo' ? this.mikasaT : g.char.skill === 'charge' ? this.erwinT : g.char.skill === 'command' ? this.arminT : g.char.skill === 'titan' ? p.titanT : 0
    return [
      { key: '1', name: g.char.skillName, cd: this.cd[0], max: this.max[0], active, ready: this.cd[0] <= 0 && (g.char.skill !== 'titan' || p.rage >= 100), extra: g.char.skill === 'titan' ? `${Math.floor(p.rage)}%` : undefined },
      { key: '2', name: '信号弹', cd: this.cd[1], max: this.max[1], active: 0, ready: this.cd[1] <= 0 },
      { key: '3', name: '空中冲刺', cd: this.cd[2], max: this.max[2], active: 0, ready: this.cd[2] <= 0 },
    ]
  }
}
