import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import { CharacterModel } from '../models/CharacterModel'
import type { Titan } from '../titans/TitanManager'
import { rand, dampAngle, pick } from '../../utils/math'
import { nextNpcId } from './SoldierAI'
import type { CharacterLook } from '../../data/characters'

/** 居民: wander streets, flee to the safe zone when titans approach, evacuate through the inner gate. */
export class Civilian {
  id = nextNpcId()
  model: CharacterModel
  pos = new THREE.Vector3()
  yaw = rand(0, 6.28)
  alive = true
  held: Titan | null = null
  hp = 40
  state: 'wander' | 'flee' | 'idle' | 'dead' | 'saved' = 'idle'
  path: [number, number][] | null = null
  pathI = 0
  thinkT = rand(0, 2)
  idleT = rand(1, 5)
  deadT = 0
  visible = true
  sos = false
  speed = rand(1.4, 2.0)
  private vy = 0

  constructor(private g: GameEngine, pos: THREE.Vector3) {
    const look: CharacterLook = {
      skin: pick(['#f0cfae', '#e8b98f', '#d8a47c', '#f4d6b8', '#c88e64']),
      hair: pick(['#3a2416', '#1a1410', '#6a4a2a', '#c8a050', '#8a5a3a', '#9a9a9a', '#e0d0a0']),
      hairStyle: pick(['short', 'long', 'bun', 'buzz', 'bald', 'short', 'long']),
      eyes: '#3a2a1a',
      height: rand(0.85, 1.02),
    }
    this.model = new CharacterModel({ look, faction: 'civilian', seed: this.id * 7, blades: false })
    this.model.setShadow(false)
    this.pos.copy(pos)
    g.npcs.group.add(this.model.root)
  }

  update(dt: number) {
    const g = this.g
    if (!this.alive) {
      this.deadT += dt
      this.model.update(dt, 'death', 0)
      this.model.root.position.copy(this.pos)
      return
    }
    if (this.held) {
      this.model.update(dt, 'grabbed', 0)
      this.model.root.position.copy(this.pos)
      return
    }
    if (this.pos.y > 0) {
      this.vy -= 22 * dt
      this.pos.y = Math.max(0, this.pos.y + this.vy * dt)
      if (this.pos.y === 0) {
        this.vy = 0
        if (this.hp < 40) this.hp -= 15
      }
    }
    this.thinkT -= dt
    if (this.thinkT <= 0) {
      this.thinkT = rand(0.8, 1.6)
      const danger = g.titans.nearest(this.pos, 48)
      const mustFlee = danger || g.npcs.evacuating || this.sos
      if (mustFlee && this.state !== 'flee') {
        this.state = 'flee'
        const sp = g.city.safePoint
        this.path = g.city.nav.path(this.pos.x, this.pos.z, sp.x + rand(-6, 6), sp.z + rand(-2, 2), 6000)
        this.pathI = 0
        if (danger && Math.random() < 0.3) g.audio.play('scream', { pos: this.pos, volume: 0.35, pitch: rand(1.1, 1.5) })
      } else if (this.state === 'idle') {
        this.idleT -= 1
        if (this.idleT <= 0) {
          const p = pick(g.city.wanderPoints)
          if (p) {
            this.path = g.city.nav.path(this.pos.x, this.pos.z, p.x, p.z, 2500)
            this.pathI = 0
            this.state = 'wander'
          }
          this.idleT = rand(2, 6)
        }
      }
    }
    const spd = this.state === 'flee' ? 5.2 : this.speed
    if (this.path && this.pathI < this.path.length) {
      const [x, z] = this.path[this.pathI]
      const dx = x - this.pos.x, dz = z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.8) this.pathI++
      else {
        const s = Math.min(d, spd * dt)
        this.pos.x += (dx / d) * s
        this.pos.z += (dz / d) * s
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt)
      }
      this.model.update(dt, 'run', spd)
    } else {
      if (this.state === 'flee') {
        if (this.pos.distanceTo(g.city.safePoint) < 12) {
          this.state = 'saved'
          g.npcs.civilianSaved(this)
          return
        }
        // path failed; retry later
        this.state = 'idle'
      } else if (this.state === 'wander') this.state = 'idle'
      this.model.update(dt, this.sos ? 'cheer' : 'idle', 0)
    }
    if (this.hp <= 0) this.kill()
    this.model.root.position.copy(this.pos)
    this.model.root.rotation.y = this.yaw
  }

  kill() {
    if (!this.alive) return
    this.alive = false
    this.held = null
    this.state = 'dead'
  }

  dispose() {
    this.g.npcs.group.remove(this.model.root)
    this.model.dispose()
  }
}
