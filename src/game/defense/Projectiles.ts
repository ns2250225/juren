import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import type { Titan } from '../titans/TitanManager'
import { applyHit } from '../titans/TitanWeakpoints'
import { buildRock, buildCaptureNet } from '../models/PropModels'
import { getMaterials } from '../models/VoxelBuilder'
import { rand } from '../../utils/math'

type PKind = 'ball' | 'bolt' | 'rock' | 'flare' | 'capture'

interface Proj {
  kind: PKind
  mesh: THREE.Object3D
  pos: THREE.Vector3
  vel: THREE.Vector3
  grav: number
  life: number
  power: number
  splash: number
  owner: Titan | null
  t: number
  done: boolean
}

interface Net {
  mesh: THREE.Object3D
  t: number
  pos: THREE.Vector3
}

/** Cannonballs, ballista bolts, Beast titan boulders, signal flares and Hange's capture devices. */
export class Projectiles {
  private list: Proj[] = []
  private nets: Net[] = []
  private ballGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7)
  private ballMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
  private boltGeo = new THREE.BoxGeometry(0.25, 0.25, 4.5)
  private boltMat = new THREE.MeshLambertMaterial({ color: 0xc8d0d8 })
  private flareMat = new THREE.MeshBasicMaterial({ color: 0x7dff8a })
  private rockGeos: THREE.BufferGeometry[]
  private v = new THREE.Vector3()

  constructor(private g: GameEngine) {
    this.rockGeos = [buildRock(1), buildRock(2), buildRock(3)]
  }

  private add(p: Omit<Proj, 't' | 'done'>) {
    this.g.scene.add(p.mesh)
    this.list.push({ ...p, t: 0, done: false })
  }

  /** solve launch velocity to hit `to` in time T under gravity g */
  static ballistic(from: THREE.Vector3, to: THREE.Vector3, T: number, grav: number) {
    return new THREE.Vector3((to.x - from.x) / T, (to.y - from.y + 0.5 * grav * T * T) / T, (to.z - from.z) / T)
  }

  cannonball(from: THREE.Vector3, to: THREE.Vector3, power: number) {
    const T = Math.max(0.6, from.distanceTo(to) / 110)
    const vel = Projectiles.ballistic(from, to, T, 14)
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat)
    mesh.position.copy(from)
    this.add({ kind: 'ball', mesh, pos: from.clone(), vel, grav: 14, life: 8, power, splash: 7, owner: null })
    this.g.particles.emit('smoke', from.x, from.y, from.z, 10, { size: 1.6, spread: 0.6, speed: 3, dir: vel.clone().normalize().multiplyScalar(5) })
    this.g.particles.emit('fire', from.x, from.y, from.z, 6, { size: 1.2, speed: 4 })
    this.g.audio.play('cannon', { pos: from })
  }

  cannonDir(from: THREE.Vector3, dir: THREE.Vector3, power: number) {
    const vel = dir.clone().normalize().multiplyScalar(120)
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat)
    mesh.position.copy(from)
    this.add({ kind: 'ball', mesh, pos: from.clone(), vel, grav: 14, life: 8, power, splash: 7, owner: null })
    this.g.particles.emit('smoke', from.x, from.y, from.z, 12, { size: 1.8, spread: 0.6, speed: 3, dir: vel.clone().normalize().multiplyScalar(5) })
    this.g.audio.play('cannon', { pos: from })
  }

  bolt(from: THREE.Vector3, to: THREE.Vector3, power: number) {
    const vel = to.clone().sub(from).normalize().multiplyScalar(170)
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat)
    mesh.position.copy(from)
    mesh.lookAt(to)
    this.add({ kind: 'bolt', mesh, pos: from.clone(), vel, grav: 3, life: 3, power, splash: 0, owner: null })
    this.g.audio.play('ballista', { pos: from })
  }

  rockVolley(from: THREE.Vector3, owner: Titan, includePlayer: boolean) {
    const g = this.g
    const targets: THREE.Vector3[] = []
    for (const f of g.defense.facilities) if (f.alive && f.slot.kind === 'wall') targets.push(f.pos.clone())
    const gate = g.walls.gate.seg
    for (const s of g.walls.breakable) if (s.mid.distanceTo(gate.mid) < 120) targets.push(s.top.clone().setY(s.height * rand(0.4, 1)))
    for (const b of g.city.buildings) if (b.alive && b.kind !== 'core' && b.pos.distanceTo(gate.mid) < 110) targets.push(new THREE.Vector3(b.x, b.h, b.z))
    if (includePlayer && g.player.alive) for (let i = 0; i < 2; i++) targets.push(g.player.pos.clone().add(g.player.vel.clone().multiplyScalar(1.2)))
    const n = 6
    for (let i = 0; i < n; i++) {
      const tgt = targets.length ? targets[Math.floor(Math.random() * targets.length)].clone() : gate.top.clone()
      tgt.add(new THREE.Vector3(rand(-6, 6), rand(-2, 2), rand(-6, 6)))
      const start = from.clone().add(new THREE.Vector3(rand(-2, 2), rand(-1, 2), rand(-2, 2)))
      const T = start.distanceTo(tgt) / 70 + rand(0.6, 1.2)
      const vel = Projectiles.ballistic(start, tgt, T, 18)
      const mesh = new THREE.Mesh(this.rockGeos[i % 3], getMaterials())
      mesh.scale.setScalar(rand(0.9, 1.6))
      mesh.castShadow = true
      mesh.position.copy(start)
      this.add({ kind: 'rock', mesh, pos: start, vel, grav: 18, life: 12, power: 110, splash: 7, owner })
    }
  }

  flare(from: THREE.Vector3, vel: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.ballGeo, this.flareMat)
    mesh.scale.setScalar(0.5)
    mesh.position.copy(from)
    this.add({ kind: 'flare', mesh, pos: from.clone(), vel: vel.clone(), grav: 9, life: 1.6, power: 0, splash: 0, owner: null })
  }

  capture(from: THREE.Vector3, to: THREE.Vector3) {
    const T = Math.max(0.8, from.distanceTo(to) / 60)
    const vel = Projectiles.ballistic(from, to, T, 16)
    const mesh = new THREE.Mesh(this.ballGeo, new THREE.MeshLambertMaterial({ color: 0x8a6a3a }))
    mesh.position.copy(from)
    this.add({ kind: 'capture', mesh, pos: from.clone(), vel, grav: 16, life: T + 1, power: 0, splash: 14, owner: null })
    this.g.audio.play('ballista', { pos: from, pitch: 1.3 })
  }

  private impact(p: Proj, at: THREE.Vector3, hitTitan: Titan | null) {
    const g = this.g
    p.done = true
    switch (p.kind) {
      case 'ball': {
        g.particles.emit('dust', at.x, at.y, at.z, 16, { size: 2.5, spread: 2, speed: 5 })
        g.particles.emit('fire', at.x, at.y, at.z, 10, { size: 1.6, speed: 6 })
        g.particles.chunks(at.x, at.y, at.z, 5, '#6a6a6a', 8, 0.6)
        g.audio.play('rockImpact', { pos: at, volume: 0.8 })
        g.shake(at, 0.25)
        for (const h of g.titans.overlap(at, p.splash)) {
          const part = h.hb.part === 'nape' ? 'body' : h.hb.part
          applyHit(h.titan, part, p.power * (1 - h.dist / (p.splash + 1)), 'cannon', { stun: 0.9 })
          if (h.titan.type === 'armored' && h.titan.armor > 0) h.titan.armor -= 4
          g.effects.floatText(h.point, `-${Math.round(p.power)}`, '')
        }
        break
      }
      case 'bolt': {
        g.particles.emit('spark', at.x, at.y, at.z, 10, { speed: 6 })
        if (hitTitan) {
          const res = g.titans.overlap(at, 2.5).find((h) => h.titan === hitTitan)
          const part = res ? res.hb.part : 'body'
          applyHit(hitTitan, part === 'nape' && !hitTitan.def.boss ? 'body' : part, p.power, 'ballista', { stun: 0.5 })
          if (hitTitan.type === 'armored' && hitTitan.armor > 0) {
            hitTitan.armor -= 18
            if (hitTitan.armor <= 0) {
              hitTitan.armor = 0
              hitTitan.model.setNapeArmor(false)
              g.banner('弩炮击碎了铠之巨人的后颈装甲！', 'good')
            }
          }
          if (!hitTitan.def.boss) hitTitan.bind(2.5)
          g.particles.emit('blood', at.x, at.y, at.z, 10, { speed: 4, size: 1.5 })
          g.effects.floatText(at, `钉住！-${p.power}`, 'crit')
        }
        break
      }
      case 'rock': {
        g.particles.chunks(at.x, at.y, at.z, 8, '#8a857a', 10, 1)
        g.particles.emit('dust', at.x, at.y, at.z, 14, { size: 3, spread: 2.5, speed: 5 })
        g.audio.play('rockImpact', { pos: at })
        g.shake(at, 0.3)
        const R = p.splash
        for (const s of g.walls.breakable) {
          const rel = at.clone().sub(s.mid)
          if (Math.abs(rel.dot(s.dir)) < s.len / 2 + 2 && Math.abs(rel.dot(s.out)) < s.thick / 2 + R && at.y <= s.height + 3) {
            if (s.gate && !s.gate.open && at.y < 24) g.destruction.damageGate(p.power * 0.7, at)
            else g.destruction.damageSegment(s, p.power * 0.8, at)
          }
        }
        for (const b of g.city.buildingsNear(at.x, at.z, R)) if (at.y < b.h + b.roofH + 4) g.destruction.damageBuilding(b, p.power, at)
        g.defense.damageAt(at, R, p.power)
        const pl = g.player
        if (pl.alive && pl.center.distanceTo(at) < R * 0.7) pl.hurt(28, pl.center.clone().sub(at).normalize().multiplyScalar(14), p.owner)
        g.npcs.swatAt(at, R * 0.7)
        break
      }
      case 'flare':
        break
      case 'capture': {
        const ground = at.clone().setY(0)
        const net = buildCaptureNet()
        net.position.copy(ground)
        g.scene.add(net)
        this.nets.push({ mesh: net, t: 8, pos: ground })
        g.effects.ring(ground.clone().setY(0.3), 15, 0xffd27a, 0.7)
        g.audio.play('trap', { pos: ground, volume: 1.2 })
        let n = 0
        for (const t of g.titans.list)
          if (t.alive && Math.hypot(t.pos.x - ground.x, t.pos.z - ground.z) < p.splash + t.radius) {
            t.bind(t.def.boss ? 5 : 8)
            t.exposedT = 8
            if (t.hardenT > 0) {
              t.hardenT = 0
              t.model.setCrystal(false)
            }
            n++
          }
        g.banner(n ? `捕获 ${n} 只巨人！弱点已暴露` : '捕获装置未命中巨人', n ? 'good' : 'info')
        break
      }
    }
  }

  update(dt: number) {
    const g = this.g
    for (const p of this.list) {
      if (p.done) continue
      p.t += dt
      p.life -= dt
      const prev = this.v.copy(p.pos)
      p.vel.y -= p.grav * dt
      const step = p.vel.clone().multiplyScalar(dt)
      const len = step.length()
      const dir = step.clone().divideScalar(len || 1)
      // titans
      if (p.kind === 'ball' || p.kind === 'bolt') {
        const th = g.titans.raycast(prev, dir, len)
        if (th) {
          this.impact(p, th.point, th.titan)
          continue
        }
      }
      if (p.kind === 'rock') {
        const pl = g.player
        if (pl.alive && pl.center.distanceTo(p.pos) < 2.2) {
          this.impact(p, p.pos.clone(), null)
          continue
        }
      }
      const hit = g.collision.raycast(prev, dir, len, (c) => c.kind !== 'tree' || p.kind === 'rock', true)
      if (hit && p.t > 0.05) {
        this.impact(p, hit.point, null)
        continue
      }
      p.pos.add(step)
      p.mesh.position.copy(p.pos)
      if (p.kind === 'rock') p.mesh.rotation.x += dt * 4
      if (p.kind === 'bolt') p.mesh.lookAt(p.pos.clone().add(p.vel))
      if (p.kind === 'flare') g.particles.emit('flare', p.pos.x, p.pos.y, p.pos.z, 2, { speed: 0.5, size: 0.8 })
      if (p.kind === 'ball' && Math.random() < 0.5) g.particles.emit('smoke', p.pos.x, p.pos.y, p.pos.z, 1, { size: 0.6, life: 0.8, speed: 0.2 })
      if (p.life <= 0) {
        if (p.kind === 'flare') {
          g.particles.emit('flare', p.pos.x, p.pos.y, p.pos.z, 40, { speed: 3, size: 2, life: 5 })
          g.npcs.flareTarget(p.pos.clone().setY(0))
          g.effects.ring(p.pos.clone(), 20, 0x7dff8a, 0.6)
          g.audio.play('flare', { pos: p.pos, pitch: 0.7 })
        }
        p.done = true
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].done) {
        g.scene.remove(this.list[i].mesh)
        this.list.splice(i, 1)
      }
    }
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const n = this.nets[i]
      n.t -= dt
      if (n.t <= 0) {
        g.scene.remove(n.mesh)
        ;(n.mesh as THREE.Mesh).geometry?.dispose()
        this.nets.splice(i, 1)
      }
    }
  }

  dispose() {
    for (const p of this.list) this.g.scene.remove(p.mesh)
    for (const n of this.nets) this.g.scene.remove(n.mesh)
    this.list.length = 0
    this.nets.length = 0
  }
}
