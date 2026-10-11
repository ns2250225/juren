import * as THREE from 'three'
import type { GameEngine } from '../core/GameEngine'
import { CharacterModel, type AnimState } from '../models/CharacterModel'
import { TitanModel, type TitanPose } from '../models/TitanModel'
import { ODMGear, type AimInfo, type Hook } from './ODMGear'
import type { CharacterDef } from '../../data/characters'
import type { Profile } from '../../stores/profile'
import type { Titan } from '../titans/TitanManager'
import { applyHit } from '../titans/TitanWeakpoints'
import { clamp, damp, dampAngle, rand } from '../../utils/math'
import type { Facility } from '../defense/DefenseManager'

export interface PlayerStats {
  maxHp: number
  hookRange: number
  reelMul: number
  gasMul: number
  thrust: number
  maxSpeed: number
  runSpeed: number
  wear: number
  napeMult: number
  dodgeCD: number
  iframes: number
  cooldownMult: number
  slashInterval: number
  armorPierce: number
  damage: number
  bladeSets: number
}

export function computeStats(c: CharacterDef, prof: Pick<Profile, 'upgrades' | 'equipped'>): PlayerStats {
  const u = prof.upgrades
  const e = prof.equipped
  const fly = (1 + u.flySpeed * 0.06) * (e.gas === 'gas_hp' ? 1.22 : 1) * c.stats.speed
  return {
    maxHp: c.stats.hp + u.maxHp * 15,
    hookRange: 80 + c.stats.hookRange + u.hookRange * 8 + (e.hook === 'hook_long' ? 25 : 0),
    reelMul: e.hook === 'hook_long' ? 1.2 : 1,
    gasMul: c.stats.gasEff * (1 - u.gasEff * 0.08) * (e.odm === 'odm_adv' ? 0.75 : 1),
    thrust: 30 * fly,
    maxSpeed: 58 * fly,
    runSpeed: 9 * c.stats.speed,
    wear: 7 / (c.stats.bladeDur * (1 + u.bladeDur * 0.15) * (e.blade === 'blade_hard' ? 1.2 : 1)),
    napeMult: 1 + u.napeDmg * 0.12,
    dodgeCD: 4 * (1 - u.dodge * 0.12),
    iframes: 0.45 + u.dodge * 0.06,
    cooldownMult: 1 - u.cooldown * 0.08,
    slashInterval: 0.42 / (e.blade === 'blade_light' ? 1.35 : 1),
    armorPierce: e.blade === 'blade_hard' ? 2.5 : 1,
    damage: c.stats.damage,
    bladeSets: 4,
  }
}

const GRAV = 22
const UP = new THREE.Vector3(0, 1, 0)

export class PlayerController {
  model: CharacterModel
  stats: PlayerStats
  odm = new ODMGear()
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  yaw = 0
  onGround = false
  hp: number
  gas = 100
  bladeSets: number
  sharpness = 100
  reloadT = 0
  alive = true
  respawnT = 0
  invulnT = 0
  grabbedBy: Titan | null = null
  struggle = 0
  grabT = 0
  manning: Facility | null = null
  titanForm = false
  titanModel: TitanModel | null = null
  titanT = 0
  titanHp = 0
  titanMaxHp = 1500
  private titanPose: TitanPose = 'idle'
  private titanPoseT = 0
  private titanActionFired = false
  roarCD = 0
  slashCD = 0
  slashT = -1
  private slashHit = new Set<number>()
  private slashSide = 1
  spinTarget: Titan | null = null
  spinT = 0
  lockTarget: Titan | null = null
  rage = 0
  aim: AimInfo = { point: new THREE.Vector3(), dist: 0, valid: false, titan: null, hb: null }
  private hipL = new THREE.Vector3()
  private hipR = new THREE.Vector3()
  private tmp = new THREE.Vector3()
  private push = new THREE.Vector3()
  private boosting = false
  private gasPuffT = 0
  private steamHurtT = 0
  dashT = 0
  private prevCenter = new THREE.Vector3()
  deaths = 0
  hintT = 0

  constructor(private g: GameEngine, public char: CharacterDef, prof: Pick<Profile, 'upgrades' | 'equipped'>) {
    this.stats = computeStats(char, prof)
    this.hp = this.stats.maxHp
    this.bladeSets = this.stats.bladeSets
    this.model = new CharacterModel({ look: char.look, faction: 'survey', seed: 3 })
    g.scene.add(this.model.root)
    this.odm.onAttach = (h) => this.onHookAttach(h)
  }

  get speed() {
    return this.vel.length()
  }
  get bladeBroken() {
    return this.sharpness <= 0
  }
  get center() {
    return this.tmp.copy(this.pos).setY(this.pos.y + 0.9)
  }
  get hooked() {
    return this.odm.attached.length > 0
  }

  buffDamage() {
    const sk = this.g.skills
    return sk && sk.mikasaT > 0 ? 1.8 : 1
  }

  spawn(p: THREE.Vector3, yaw: number) {
    this.pos.copy(p)
    this.vel.set(0, 0, 0)
    this.yaw = yaw
    this.g.camCtl.yaw = yaw
    this.g.camCtl.pitch = -0.2
  }

  canBeGrabbed() {
    return this.invulnT <= 0 && this.spinT <= 0 && this.dashT <= 0 && this.speed < 24 && !this.grabbedBy && this.alive
  }

  // ------------------------------------------------------------------ aiming
  computeAim() {
    const g = this.g
    const ray = g.aimRay()
    const range = this.stats.hookRange
    const camToPlayer = g.camera.position.distanceTo(this.pos)
    const max = range + camToPlayer
    const tryRay = (d: THREE.Vector3) => {
      const hit = g.collision.raycast(ray.o, d, max, (c) => c.hookable, false)
      const th = g.titans.raycast(ray.o, d, max)
      if (th && (!hit || th.t < hit.t)) return { point: th.point, titan: th.titan, hb: th.hb }
      if (hit) return { point: hit.point, titan: null, hb: null }
      return null
    }
    let res = tryRay(ray.d)
    if ((!res || res.point.distanceTo(this.pos) > range) && g.settings.hookAssist) {
      // hook assist: sample a small cone around the crosshair
      const right = new THREE.Vector3().crossVectors(ray.d, UP).normalize()
      const up = new THREE.Vector3().crossVectors(right, ray.d).normalize()
      let best: typeof res = null, bestA = Infinity
      for (const a of [0.05, 0.1, 0.16]) {
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2
          const d = ray.d.clone().addScaledVector(right, Math.cos(ang) * a).addScaledVector(up, Math.sin(ang) * a).normalize()
          const r = tryRay(d)
          if (r && r.point.distanceTo(this.pos) <= range && a < bestA) {
            best = r
            bestA = a
          }
        }
        if (best) break
      }
      if (best) res = best
    }
    // lock-on: aim hooks at the locked titan's shoulders
    if (this.lockTarget && this.lockTarget.alive && (!res || !res.titan)) {
      const t = this.lockTarget
      const body = t.model.hitboxes.find((h) => h.part === 'body')!
      const p = new THREE.Vector3(0, body.center.y + body.half.y * 0.8, 0).applyMatrix4(body.world)
      if (p.distanceTo(this.pos) <= range) res = { point: p, titan: t, hb: body }
    }
    if (res) {
      this.aim.point.copy(res.point)
      this.aim.titan = res.titan
      this.aim.hb = res.hb
      this.aim.dist = res.point.distanceTo(this.pos)
      this.aim.valid = this.aim.dist <= range && this.aim.dist > 1.5
    } else {
      this.aim.valid = false
      this.aim.titan = null
      this.aim.hb = null
      this.aim.dist = 0
    }
  }

  private fireHook(h: Hook, spread = 0) {
    const g = this.g
    if (this.gas <= 0) {
      g.banner('瓦斯耗尽！前往补给站（F）', 'warn')
      return
    }
    let aim: AimInfo | null = this.aim
    if (spread !== 0) {
      // dual hook: offset rays left / right
      const ray = g.aimRay()
      const right = new THREE.Vector3().crossVectors(ray.d, UP).normalize()
      const d = ray.d.clone().addScaledVector(right, spread).normalize()
      const hit = g.collision.raycast(ray.o, d, this.stats.hookRange + 12, (c) => c.hookable, false)
      const th = g.titans.raycast(ray.o, d, this.stats.hookRange + 12)
      if (th && (!hit || th.t < hit.t)) aim = { point: th.point, titan: th.titan, hb: th.hb, valid: true, dist: th.point.distanceTo(this.pos) }
      else if (hit) aim = { point: hit.point, titan: null, hb: null, valid: hit.point.distanceTo(this.pos) <= this.stats.hookRange, dist: 0 }
      else aim = this.aim
    }
    const hip = h.side === 'L' ? this.hipL : this.hipR
    g.audio.play('hookFire', { pos: this.pos, volume: 0.8 })
    this.odm.fire(h, hip, aim, this.stats.hookRange, g.camCtl.forward)
    this.gas = Math.max(0, this.gas - 0.6 * this.stats.gasMul)
  }

  private onHookAttach(h: Hook) {
    this.g.audio.play('hookAttach', { pos: h.anchor, volume: 0.7 })
    this.g.particles.emit('speck', h.anchor.x, h.anchor.y, h.anchor.z, 5, { speed: 3 })
    this.g.tutorialEvent('hook')
  }

  // ------------------------------------------------------------------ main update
  update(dt: number) {
    const g = this.g
    const inp = g.input
    this.invulnT = Math.max(0, this.invulnT - dt)
    this.slashCD = Math.max(0, this.slashCD - dt)
    this.dashT = Math.max(0, this.dashT - dt)
    this.roarCD = Math.max(0, this.roarCD - dt)
    this.steamHurtT = Math.max(0, this.steamHurtT - dt)

    if (!this.alive) {
      this.respawnT -= dt
      this.model.update(dt, 'death', 0)
      this.vel.y -= GRAV * dt
      this.pos.addScaledVector(this.vel, dt)
      if (this.pos.y < 0) {
        this.pos.y = 0
        this.vel.set(0, 0, 0)
      }
      this.model.root.position.copy(this.pos)
      this.renderRopes()
      if (this.respawnT <= 0) this.respawn()
      return
    }
    if (this.titanForm) return this.updateTitanForm(dt)

    // hip positions for rope origins
    this.model.root.updateMatrixWorld(true)
    this.model.hipWorld('L', this.hipL)
    this.model.hipWorld('R', this.hipR)
    this.odm.update(dt, this.hipL, this.hipR, this.center.clone())

    if (this.grabbedBy) {
      this.grabT += dt
      if (inp.pressed('slash') || inp.pressed('jump')) {
        this.struggle++
        this.g.audio.play('bladeSwing', { pos: this.pos, pitch: 1.3 })
        g.particles.emit('blood', this.pos.x, this.pos.y + 1, this.pos.z, 4, { speed: 3 })
        this.g.camCtl.addTrauma(0.1)
      }
      if (!this.bladeBroken && this.struggle >= 6) {
        const t = this.grabbedBy
        t.armDisabled = 12
        applyHit(t, 'armR', 120, 'player')
        t.stun(1.8)
        g.banner('斩断手指，成功挣脱！', 'good')
        t.releaseVictim(true)
      } else {
        this.hp -= 9 * dt
        if (this.hp <= 0) {
          const t = this.grabbedBy
          t.victim = null
          this.grabbedBy = null
          this.die()
        }
      }
      this.model.update(dt, 'grabbed', 0)
      this.renderRopes()
      return
    }

    if (this.manning) {
      this.updateManning(dt)
      return
    }

    this.computeAim()

    // ---- hooks
    if (inp.pressed('hookL')) {
      if (this.odm.L.state === 'attached' || this.odm.L.state === 'flying') this.odm.release(this.odm.L)
      else this.fireHook(this.odm.L)
    }
    if (inp.pressed('hookR')) {
      if (this.odm.R.state === 'attached' || this.odm.R.state === 'flying') this.odm.release(this.odm.R)
      else this.fireHook(this.odm.R)
    }
    if (inp.pressed('dualHook')) {
      if (this.odm.anyActive) this.odm.releaseAll()
      else {
        this.fireHook(this.odm.L, -0.12)
        this.fireHook(this.odm.R, 0.12)
      }
    }
    if (inp.pressed('retract') && this.odm.anyActive) {
      this.odm.releaseAll()
      g.audio.play('hookRetract', { pos: this.pos, volume: 0.7 })
    }
    // ---- combat & utility
    if (inp.pressed('slash')) this.startSlash()
    if (inp.pressed('reload')) this.reload()
    if (this.reloadT > 0) {
      this.reloadT -= dt
      if (this.reloadT <= 0) {
        this.sharpness = 100
        this.setBladesVisible(true)
        g.audio.play('bladeReplace', { pos: this.pos })
      }
    }
    if (inp.pressed('interact')) this.interact()
    if (inp.pressed('lock')) this.toggleLock()
    if (this.lockTarget && !this.lockTarget.alive) this.lockTarget = null
    if (g.settings.mobile && !this.lockTarget && g.settings.autoAim) {
      const t = g.titans.nearest(this.pos, 80)
      if (t) this.lockTarget = t
    }
    if (this.lockTarget) {
      const n = this.lockTarget.model.napeWorld(new THREE.Vector3())
      if (n.distanceTo(this.pos) > 180) this.lockTarget = null
      else g.camCtl.steerTo(n, g.camera.position, dt, g.settings.mobile ? 2.5 : 1.6)
    }

    this.physics(dt)
    this.updateSlash(dt)
    this.updateModel(dt)
    this.renderRopes()
    // audio loops
    g.audio.setLoop('gas', this.boosting ? 0.8 : this.hooked && (inp.isDown('hookL') || inp.isDown('hookR')) ? 0.35 : 0)
    g.audio.setLoop('wind', clamp((this.speed - 10) / 45, 0, 1))
    if (this.gas <= 0 && this.hintT <= 0) {
      this.hintT = 8
      g.banner('瓦斯耗尽！前往补给站按 F 补给', 'warn')
    }
    this.hintT = Math.max(0, this.hintT - dt)
  }

  private physics(dt: number) {
    const g = this.g
    const inp = g.input
    const cam = g.camCtl
    const st = this.stats
    const fwd = cam.flatForward, right = cam.right
    let ix = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0) + inp.stickX
    let iz = (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0) + inp.stickY
    const il = Math.hypot(ix, iz)
    if (il > 1) {
      ix /= il
      iz /= il
    }
    const wish = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix)
    const speedBuff = (g.skills.mikasaT > 0 ? 1.4 : 1)
    const boostHeld = inp.isDown('boost') && this.gas > 0
    this.boosting = boostHeld && !this.onGround
    const steps = Math.min(6, Math.max(1, Math.ceil((this.speed * dt) / 0.6)))
    const h = dt / steps
    // spin (Levi): homing flight towards the target nape
    if (this.spinT > 0) {
      this.updateSpin(dt)
      return
    }
    const hooks = this.odm.attached
    for (let s = 0; s < steps; s++) {
      if (this.onGround && hooks.length === 0) {
        const target = wish.clone().multiplyScalar(st.runSpeed * speedBuff * (inp.isDown('boost') ? 1.35 : 1))
        const k = 1 - Math.exp(-(il > 0.05 ? 10 : 14) * h)
        this.vel.x += (target.x - this.vel.x) * k
        this.vel.z += (target.z - this.vel.z) * k
        if (inp.pressed('jump') && s === 0) {
          this.vel.y = 9.5
          this.onGround = false
          g.tutorialEvent('jump')
        }
      } else {
        this.vel.y -= GRAV * h
        this.vel.addScaledVector(wish, (hooks.length ? 14 : 6) * h)
        if (inp.isDown('jump') && this.gas > 0 && !this.onGround) {
          this.vel.y += 21 * h
          this.vel.addScaledVector(fwd, 4 * h)
          this.gas -= 4 * st.gasMul * h
          this.emitGas(h)
        }
        // mobile assist: hold altitude
        if (g.settings.mobile && g.settings.autoAltitude && hooks.length === 0 && this.vel.y < -4 && this.gas > 0 && this.pos.y > 2) {
          this.vel.y += 14 * h
          this.gas -= 1 * h
        }
      }
      if (boostHeld) {
        let dir: THREE.Vector3
        if (hooks.length) {
          const mid = new THREE.Vector3()
          for (const hk of hooks) mid.add(hk.anchor)
          mid.multiplyScalar(1 / hooks.length)
          const to = mid.sub(this.center).normalize()
          dir = to.multiplyScalar(0.55).addScaledVector(cam.forward, 0.45).normalize()
        } else dir = cam.forward
        this.vel.addScaledVector(dir, st.thrust * speedBuff * h)
        this.gas -= 9 * st.gasMul * h
        this.emitGas(h)
        if (!this.onGround) g.tutorialEvent('boost')
      }
      // rope constraints + winch
      for (const hk of hooks) {
        const c = this.center
        const toA = hk.anchor.clone().sub(c)
        const dist = toA.length()
        if (dist < 0.01) continue
        const n = toA.multiplyScalar(1 / dist)
        const keyHeld = hk.side === 'L' ? inp.isDown('hookL') : inp.isDown('hookR')
        const reeling = keyHeld || boostHeld || inp.isDown('dualHook')
        if (reeling && this.gas > 0) {
          hk.length = Math.max(1.6, hk.length - 17 * st.reelMul * speedBuff * (boostHeld ? 1.5 : 1) * h)
          this.vel.addScaledVector(n, 22 * st.reelMul * h)
          this.gas -= 1.6 * st.gasMul * h
        }
        if (dist > hk.length) {
          const vr = this.vel.dot(n)
          if (vr < 0) this.vel.addScaledVector(n, -vr)
          this.pos.addScaledVector(n, dist - hk.length)
        }
        // swing steering
        const tang = wish.clone().sub(n.clone().multiplyScalar(wish.dot(n)))
        this.vel.addScaledVector(tang, 10 * h)
        if (dist > st.hookRange * 1.5) this.odm.release(hk)
        if (dist < 2.2 && !reeling) {
          // reached the anchor: let go automatically when landing on it
        }
      }
      // drag & clamp
      const sp = this.vel.length()
      if (!this.onGround) this.vel.multiplyScalar(1 - Math.min(0.5, (0.0012 * sp + 0.02) * h))
      const maxS = st.maxSpeed * speedBuff * (this.dashT > 0 ? 1.4 : 1)
      if (sp > maxS) this.vel.multiplyScalar(maxS / sp)
      this.prevCenter.copy(this.center)
      this.pos.addScaledVector(this.vel, h)
      this.collide()
    }
    this.gas = Math.max(0, this.gas)
    if (this.onGround && !inp.isDown('boost')) this.gas = Math.min(100, this.gas + 1.5 * dt)
  }

  private collide() {
    const g = this.g
    const c = this.pos.clone().setY(this.pos.y + 0.9)
    const res = g.collision.sphere(c, 0.9, this.push)
    let grounded = false
    if (res.hit) {
      const n = this.push.clone().normalize()
      const vn = this.vel.dot(n)
      if (vn < 0) {
        if (vn < -34 && this.invulnT <= 0) {
          this.hurt(Math.round((-vn - 34) * 1.4), null, null)
          g.camCtl.addTrauma(0.4)
          g.particles.emit('dust', c.x, c.y, c.z, 10, { size: 1.2 })
        }
        this.vel.addScaledVector(n, -vn)
        if (n.y < 0.55 && -vn > 20) this.vel.addScaledVector(n, -vn * 0.15)
      }
      grounded = res.grounded
    }
    const tp = g.titans.pushOut(c, 0.9)
    if (tp.hit) {
      grounded = grounded || tp.up
      if (tp.up && this.vel.y < 0) this.vel.y = 0
    }
    this.pos.copy(c).setY(c.y - 0.9)
    if (this.pos.y <= 0) {
      this.pos.y = 0
      if (this.vel.y < 0) this.vel.y = 0
      grounded = true
    }
    if (grounded && !this.onGround && this.vel.y <= 0.1) g.audio.play('hurt', { pos: this.pos, volume: 0.15, pitch: 1.8 })
    this.onGround = grounded && this.vel.y <= 0.5
    if (this.onGround) {
      // ground friction for horizontal speed when landing at high speed
      if (this.odm.attached.length === 0) this.vel.multiplyScalar(0.985)
    }
  }

  private emitGas(h: number) {
    this.gasPuffT -= h
    if (this.gasPuffT > 0) return
    this.gasPuffT = 0.03
    const b = this.model.root.position
    const back = this.vel.clone().normalize().multiplyScalar(-1.2)
    this.g.particles.emit('gas', b.x + back.x, b.y + 0.9 + back.y, b.z + back.z, 2, { speed: 1.2, dir: back.multiplyScalar(3) })
  }

  // ------------------------------------------------------------------ slashing
  private startSlash() {
    const g = this.g
    if (this.slashCD > 0 || this.reloadT > 0) return
    const fast = g.skills.mikasaT > 0 ? 0.5 : 1
    this.slashCD = this.stats.slashInterval * fast
    this.slashT = 0
    this.slashHit.clear()
    this.slashSide = -this.slashSide
    this.model.slashT = 0
    this.model.slashSide = this.slashSide
    g.audio.play('bladeSwing', { pos: this.pos, pitch: rand(0.9, 1.15) })
    // face the camera direction while cutting
    this.yaw = g.camCtl.yaw
    const c = this.center
    const f = g.camCtl.forward
    g.effects.slash(c.clone().addScaledVector(f, 1.2), g.camCtl.yaw, g.camCtl.pitch, this.slashSide, 2.6, this.bladeBroken ? 0x777777 : 0xd8ecff)
    // auto-aim magnetism toward a nearby nape
    if (g.settings.autoAim) {
      let best: THREE.Vector3 | null = null, bd = 10
      for (const t of g.titans.list) {
        if (!t.alive) continue
        const n = t.model.napeWorld(new THREE.Vector3())
        const d = n.distanceTo(c)
        if (d < bd) {
          bd = d
          best = n
        }
      }
      if (best) this.vel.addScaledVector(best.sub(c).normalize(), 12)
    }
    g.tutorialEvent('slash')
  }

  private updateSlash(dt: number) {
    if (this.slashT < 0) {
      this.model.slashT = -1
      return
    }
    const dur = 0.32
    this.slashT += dt
    const f = this.slashT / dur
    this.model.slashT = Math.min(1, f)
    if (f >= 1) {
      this.slashT = -1
      this.model.slashT = -1
      return
    }
    if (f < 0.12 || f > 0.75) return
    const g = this.g
    const c = this.center.clone()
    const dir = g.camCtl.forward
    const r = 2.5 + Math.min(this.speed, 50) * 0.025 + (g.settings.autoAim ? 0.8 : 0)
    const pts = [c.clone().addScaledVector(dir, 1.6), this.prevCenter.clone().lerp(c, 0.5).addScaledVector(dir, 1.6)]
    for (const p of pts) {
      for (const hit of g.titans.overlap(p, r, (t) => !this.slashHit.has(t.id))) {
        this.slashHit.add(hit.titan.id)
        g.combat.slashHit(hit.titan, hit.hb, hit.point, this.speed)
      }
    }
  }

  wearBlades(mult: number) {
    if (mult <= 0) return
    this.sharpness = Math.max(0, this.sharpness - this.stats.wear * mult)
    if (this.sharpness <= 0) {
      this.setBladesVisible(false)
      this.g.audio.play('bladeBreak', { pos: this.pos })
      this.g.banner(this.bladeSets > 0 ? '刀刃已断！按 R 更换' : '刀刃耗尽！前往补给站（F）', 'warn')
    }
  }

  private setBladesVisible(v: boolean) {
    if (this.model.bladeL) this.model.bladeL.visible = v
    if (this.model.bladeR) this.model.bladeR.visible = v
  }

  reload() {
    if (this.reloadT > 0 || this.sharpness >= 100) return
    if (this.bladeSets <= 0) {
      this.g.banner('没有备用刀刃！前往补给站（F）', 'warn')
      return
    }
    this.bladeSets--
    this.reloadT = 0.6
    this.setBladesVisible(false)
    this.g.audio.play('bladeReplace', { pos: this.pos, pitch: 0.9 })
  }

  refill() {
    this.gas = 100
    this.bladeSets = this.stats.bladeSets
    this.sharpness = 100
    this.setBladesVisible(true)
    this.hp = Math.min(this.stats.maxHp, this.hp + 25)
    this.g.audio.play('refill', { pos: this.pos })
    this.g.banner('补给完成：瓦斯与刀刃已补满', 'good')
    this.g.tutorialEvent('supply')
  }

  private interact() {
    const g = this.g
    const fac = g.defense.nearestCannon(this.pos, 5)
    if (fac) {
      this.manning = fac
      this.odm.releaseAll()
      g.banner('手动操炮：鼠标瞄准，左键开炮，F 离开', 'info')
      return
    }
    const sup = g.supplyNear(this.pos)
    if (sup === 'fire') g.banner('补给站失火，暂时无法补给！', 'warn')
    else if (sup) this.refill()
    else g.banner('附近没有补给站', 'info')
  }

  private updateManning(dt: number) {
    const g = this.g
    const f = this.manning!
    if (!f.alive || g.input.pressed('interact') || g.input.pressed('retract') || g.input.pressed('jump')) {
      this.manning = null
      return
    }
    this.pos.copy(f.pos).addScaledVector(f.slot.out, -2.2)
    this.vel.set(0, 0, 0)
    this.yaw = g.camCtl.yaw
    f.manualAim(g.camCtl.forward)
    if (g.input.pressed('slash')) f.manualFire()
    this.updateModel(dt)
    this.renderRopes()
  }

  private toggleLock() {
    const g = this.g
    if (this.lockTarget) {
      this.lockTarget = null
      return
    }
    const ray = g.aimRay()
    let best: Titan | null = null, bestA = 0.5
    for (const t of g.titans.list) {
      if (!t.alive) continue
      const n = t.model.napeWorld(new THREE.Vector3())
      if (n.distanceTo(this.pos) > 160) continue
      const a = n.sub(ray.o).normalize().angleTo(ray.d)
      if (a < bestA) {
        bestA = a
        best = t
      }
    }
    this.lockTarget = best
    if (best) g.audio.play('uiClick', { pitch: 1.5 })
  }

  // ------------------------------------------------------------------ model & ropes
  private updateModel(dt: number) {
    const sp = this.speed
    const horiz = Math.hypot(this.vel.x, this.vel.z)
    if (this.slashT < 0 && !this.manning) {
      if (!this.onGround && sp > 4) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 8, dt)
      else if (this.onGround && horiz > 0.8) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 14, dt)
    }
    let st: AnimState = 'idle'
    if (this.spinT > 0) st = 'spin'
    else if (!this.onGround) st = sp > 6 || this.hooked ? 'fly' : 'jump'
    else if (horiz > 0.8) st = 'run'
    this.model.update(dt, st, st === 'run' ? horiz : sp, this.vel.y)
    this.model.root.position.copy(this.pos)
    this.model.root.rotation.y = this.yaw
  }

  renderRopes() {
    const e = this.g.effects
    for (const h of this.odm.hooks) {
      if (h.state === 'idle') continue
      e.rope(h.side === 'L' ? this.hipL : this.hipR, h.tip, h.state === 'attached' ? 0x222222 : 0x555555)
    }
  }

  // ------------------------------------------------------------------ damage & grabs
  hurt(dmg: number, knock: THREE.Vector3 | null, from: Titan | null) {
    if (!this.alive || this.invulnT > 0 || dmg <= 0) return
    if (this.titanForm) return this.titanHurt(dmg * 2, from)
    this.hp -= dmg
    this.invulnT = 0.7
    if (knock) this.vel.add(knock)
    this.g.hudFlash()
    this.g.camCtl.addTrauma(0.5)
    this.g.audio.play('hurt', { pos: this.pos })
    this.g.effects.floatText(this.pos.clone().setY(this.pos.y + 2.2), `-${Math.round(dmg)}`, 'hurt')
    if (this.hp <= 0) this.die()
  }

  grabbedByTitan(t: Titan) {
    this.grabbedBy = t
    this.struggle = 0
    this.grabT = 0
    this.odm.releaseAll()
    this.spinT = 0
    this.g.banner('被巨人抓住了！连续斩击（左键）挣脱！', 'danger')
    this.g.audio.play('grab', { pos: this.pos })
    this.g.audio.play('scream', { pos: this.pos, volume: 0.7 })
  }
  heldAt(hand: THREE.Vector3) {
    this.pos.copy(hand).setY(hand.y - 0.9)
    this.vel.set(0, 0, 0)
    this.model.root.position.copy(this.pos)
  }
  releasedFromGrab(cut: boolean) {
    const t = this.grabbedBy
    this.grabbedBy = null
    this.invulnT = 1.8
    const away = t ? this.pos.clone().sub(t.pos).setY(0).normalize() : new THREE.Vector3(0, 0, 1)
    this.vel.copy(away.multiplyScalar(cut ? 12 : 6)).setY(cut ? 9 : 4)
  }
  eatenBy(t: Titan) {
    this.grabbedBy = null
    this.hp -= 60
    this.g.hudFlash()
    this.g.audio.play('scream', { pos: this.pos })
    if (this.hp <= 0) return this.die()
    this.g.banner('从巨人口中逃脱！', 'warn')
    this.invulnT = 2
    this.vel.copy(t.forward.multiplyScalar(14)).setY(10)
  }

  steamBlast(src: THREE.Vector3, height: number, dt: number) {
    if (!this.alive) return
    const core = src.clone().setY(height * 0.75)
    const d = this.center.distanceTo(core)
    if (d > 58) return
    const away = this.center.clone().sub(core).normalize()
    const k = 1 - d / 58
    this.vel.addScaledVector(away, 45 * k * dt)
    if (this.steamHurtT <= 0 && this.invulnT <= 0) {
      this.steamHurtT = 0.5
      this.hp -= 6 * k + 2
      this.g.hudFlash(0.4)
      if (this.hp <= 0) this.die()
    }
  }

  die() {
    if (!this.alive) return
    this.alive = false
    this.deaths++
    this.respawnT = 6
    this.odm.releaseAll()
    this.grabbedBy = null
    this.manning = null
    this.spinT = 0
    this.lockTarget = null
    this.g.combat.resetCombo()
    this.g.audio.play('death', {})
    const lost = Math.round(this.g.resources.funds * 0.1)
    this.g.resources.funds -= lost
    this.g.banner(`你阵亡了… 6 秒后在城墙上复活（损失资金 ${lost}）`, 'danger')
    this.g.audio.setLoop('gas', 0)
    this.g.audio.setLoop('wind', 0)
  }

  respawn() {
    this.alive = true
    this.hp = this.stats.maxHp
    this.gas = 100
    this.bladeSets = this.stats.bladeSets
    this.sharpness = 100
    this.setBladesVisible(true)
    this.invulnT = 3
    this.odm.reset()
    this.spawn(this.g.city.playerStart, this.g.city.playerStartYaw)
    this.g.banner('调查兵团士兵，重新投入战斗！', 'info')
  }

  // ------------------------------------------------------------------ dash / spin
  dash(): boolean {
    if (this.gas < 5) return false
    const g = this.g
    const inp = g.input
    const cam = g.camCtl
    let dir = cam.forward
    const ix = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0) + inp.stickX
    const iz = (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0) + inp.stickY
    if (Math.abs(ix) + Math.abs(iz) > 0.1) dir = cam.flatForward.multiplyScalar(iz).addScaledVector(cam.right, ix).normalize().setY(0.15).normalize()
    if (this.grabbedBy) {
      const t = this.grabbedBy
      t.stun(0.8)
      t.releaseVictim(false)
      g.banner('瓦斯爆发挣脱！', 'good')
    }
    this.vel.addScaledVector(dir, 32)
    this.dashT = 0.5
    this.invulnT = Math.max(this.invulnT, this.stats.iframes)
    this.gas -= 7 * this.stats.gasMul
    this.onGround = false
    g.audio.play('dash', { pos: this.pos })
    for (let i = 0; i < 6; i++) this.emitGas(1)
    return true
  }

  findSpinTarget(): Titan | null {
    const g = this.g
    const ray = g.aimRay()
    let best: Titan | null = null, bs = Infinity
    for (const t of g.titans.list) {
      if (!t.alive) continue
      const n = t.model.napeWorld(new THREE.Vector3())
      const d = n.distanceTo(this.pos)
      if (d > 60) continue
      const a = n.clone().sub(ray.o).normalize().angleTo(ray.d)
      const score = d * (1 + a * 3)
      if (a < 0.9 && score < bs) {
        bs = score
        best = t
      }
    }
    return best ?? (this.lockTarget?.alive ? this.lockTarget : null)
  }

  startSpin(t: Titan) {
    this.spinTarget = t
    this.spinT = 1.4
    this.odm.releaseAll()
    this.invulnT = 1.4
    this.g.banner('利威尔·旋风斩！', 'good')
    this.g.audio.play('dash', { pos: this.pos, pitch: 0.8 })
  }

  private updateSpin(dt: number) {
    const g = this.g
    const t = this.spinTarget
    this.spinT -= dt
    if (!t || !t.alive) {
      this.spinT = 0
      return
    }
    const nape = t.model.napeWorld(new THREE.Vector3())
    // approach from behind the nape
    const behind = nape.clone().addScaledVector(t.forward, -2.5).setY(nape.y + 0.5)
    const to = behind.sub(this.center)
    const d = to.length()
    this.vel.copy(to.normalize().multiplyScalar(Math.min(55, d / Math.max(0.05, dt))))
    if (d > 1) this.vel.clampLength(0, 55)
    this.pos.addScaledVector(this.vel, dt)
    g.particles.emit('speck', this.pos.x, this.pos.y + 1, this.pos.z, 2, { speed: 2 })
    if (d < 3.5) {
      // whirlwind: rapid multi-hit
      for (let i = 0; i < 4; i++) {
        const hb = t.model.hitboxes.find((h) => h.part === 'nape')!
        g.effects.slash(this.center.clone(), this.yaw + i * 1.5, 0, i % 2 ? 1 : -1, 3, 0xbfe6ff)
        if (!t.alive) break
        if (!t.def.boss) {
          applyHit(t, 'nape', 9999, 'skill', { ignoreHarden: true })
          break
        }
        g.combat.slashHit(t, hb, nape, 50, 1.3)
      }
      g.audio.play('napeHit', { pos: nape })
      g.camCtl.addTrauma(0.3)
      this.spinT = 0
      this.vel.set(this.vel.x * 0.3, 10, this.vel.z * 0.3)
    }
    this.collide()
    this.updateModel(dt)
  }

  // ------------------------------------------------------------------ Eren: titan shift
  transform() {
    const g = this.g
    this.titanForm = true
    this.titanT = 25
    this.titanHp = this.titanMaxHp
    this.rage = 0
    this.odm.reset()
    this.lockTarget = null
    this.model.root.visible = false
    this.titanModel = new TitanModel('attack', 15, 77)
    g.scene.add(this.titanModel.root)
    this.pos.y = 0
    this.vel.set(0, 0, 0)
    const sky = this.pos.clone().setY(220)
    g.effects.lightning(sky, this.pos.clone())
    g.effects.lightning(sky.clone().add(new THREE.Vector3(6, 0, 3)), this.pos.clone())
    g.effects.ring(this.pos.clone().setY(0.5), 60, 0xffe680, 0.8)
    g.particles.emit('steam', this.pos.x, 8, this.pos.z, 60, { size: 6, spread: 8, speed: 10, up: 4 })
    g.particles.emit('spark', this.pos.x, 10, this.pos.z, 40, { speed: 18 })
    g.audio.play('transform', { pos: this.pos, volume: 1.6 })
    g.camCtl.addTrauma(1)
    g.flashScreen()
    for (const t of g.titans.list) if (t.alive && t.pos.distanceTo(this.pos) < 60) t.stun(1.2)
    for (const b of g.city.buildingsNear(this.pos.x, this.pos.z, 6)) g.destruction.damageBuilding(b, 300)
    g.banner('艾伦·巨人化！左键重拳 · 右键咆哮', 'good')
  }

  titanHurt(dmg: number, _from: Titan | null) {
    if (!this.titanForm) return
    this.titanHp -= dmg
    this.g.hudFlash(0.3)
    this.g.camCtl.addTrauma(0.3)
    if (this.titanHp <= 0) this.exitTitan()
  }

  private exitTitan() {
    const g = this.g
    const tm = this.titanModel!
    const nape = tm.napeWorld(new THREE.Vector3())
    g.particles.emit('steam', nape.x, nape.y, nape.z, 50, { size: 5, spread: 4, up: 5 })
    g.scene.remove(tm.root)
    tm.dispose()
    this.titanModel = null
    this.titanForm = false
    this.model.root.visible = true
    this.pos.copy(nape).setY(nape.y - 0.5)
    this.vel.set(0, 8, 0)
    this.invulnT = 2.5
    this.titanT = 0
    g.banner('巨人化解除', 'info')
  }

  private setTitanPose(p: TitanPose, dur: number) {
    this.titanPose = p
    this.titanPoseT = 0
    this.titanPoseDur = dur
    this.titanActionFired = false
  }
  private titanPoseDur = 1

  private updateTitanForm(dt: number) {
    const g = this.g
    const inp = g.input
    const tm = this.titanModel!
    this.titanT -= dt
    if (this.titanT <= 0) return this.exitTitan()
    const cam = g.camCtl
    let ix = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0) + inp.stickX
    let iz = (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0) + inp.stickY
    const il = Math.hypot(ix, iz)
    if (il > 1) {
      ix /= il
      iz /= il
    }
    const wish = cam.flatForward.multiplyScalar(iz).addScaledVector(cam.right, ix)
    const busy = (this.titanPose === 'punch' || this.titanPose === 'roar') && this.titanPoseT < this.titanPoseDur
    const sp = (inp.isDown('boost') ? 15 : 10) * (busy ? 0.3 : 1)
    const k = 1 - Math.exp(-6 * dt)
    this.vel.x += (wish.x * sp - this.vel.x) * k
    this.vel.z += (wish.z * sp - this.vel.z) * k
    this.vel.y -= GRAV * dt
    if (inp.pressed('jump') && this.pos.y <= 0.01) this.vel.y = 12
    this.pos.addScaledVector(this.vel, dt)
    if (this.pos.y < 0) {
      if (this.vel.y < -12) {
        g.camCtl.addTrauma(0.5)
        g.particles.emit('dust', this.pos.x, 1, this.pos.z, 20, { size: 3, spread: 4 })
      }
      this.pos.y = 0
      this.vel.y = 0
    }
    // collide only with walls/gates/core at a few heights
    for (const y of [3, 9, 14]) {
      const c = this.pos.clone().setY(this.pos.y + y)
      g.collision.sphere(c, 2.6, this.push, (cl) => cl.kind === 'wall' || cl.kind === 'gate' || cl.kind === 'core')
      this.pos.x = c.x
      this.pos.z = c.z
    }
    if (il > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(wish.x, wish.z), 8, dt)
    if (inp.pressed('slash') && !busy) {
      this.setTitanPose('punch', 0.6)
      this.yaw = cam.yaw
      g.audio.play('titanRoar', { pos: this.pos, pitch: 1.4, volume: 0.5 })
    }
    if (inp.pressed('hookR') && this.roarCD <= 0 && !busy) {
      this.setTitanPose('roar', 1.4)
      this.roarCD = 8
      g.audio.play('titanRoar', { pos: this.pos, pitch: 0.9, volume: 1.6 })
      g.effects.ring(this.pos.clone().setY(1), 90, 0xffffff, 1)
      g.camCtl.addTrauma(0.6)
      let n = 0
      for (const t of g.titans.list)
        if (t.alive && t.pos.distanceTo(this.pos) < 95 && t.type !== 'colossal') {
          t.stun(1.4)
          t.aggroT = 12
          n++
        }
      g.banner(`咆哮！${n} 只巨人被吸引`, 'good')
    }
    this.titanPoseT += dt
    const p = this.titanPoseT / this.titanPoseDur
    if (this.titanPose === 'punch' && !this.titanActionFired && p > 0.3) {
      this.titanActionFired = true
      tm.root.updateMatrixWorld(true)
      const fist = tm.handR.getWorldPosition(new THREE.Vector3())
      const reachPt = this.pos.clone().addScaledVector(cam.flatForward, 6).setY(fist.y)
      for (const c of [fist, reachPt]) {
        for (const hit of g.titans.overlap(c, 5.5)) {
          const t = hit.titan
          if (!t.alive) continue
          g.particles.emit('blood', hit.point.x, hit.point.y, hit.point.z, 18, { speed: 8, size: 2 })
          g.particles.emit('steam', hit.point.x, hit.point.y, hit.point.z, 10, { size: 3 })
          if (hit.hb.part === 'head' || hit.hb.part === 'nape') {
            if (!t.def.boss) applyHit(t, 'nape', 9999, 'eren')
            else {
              t.napeHP -= 110
              if (t.armor > 0) t.armor -= 30
              t.stun(1.5)
              g.effects.floatText(hit.point, '-110', 'crit')
              if (t.napeHP <= 0) t.kill('eren')
            }
          } else {
            applyHit(t, hit.hb.part, 380, 'eren', { stun: 1.5 })
            g.effects.floatText(hit.point, '重拳！', 'crit')
          }
        }
      }
      for (const b of g.city.buildingsNear(reachPt.x, reachPt.z, 3)) g.destruction.damageBuilding(b, 80)
      g.audio.play('punch', { pos: fist })
      g.camCtl.addTrauma(0.35)
    }
    let pose: TitanPose = this.titanPose
    if (!busy) pose = Math.hypot(this.vel.x, this.vel.z) > 1 ? (inp.isDown('boost') ? 'run' : 'walk') : 'idle'
    tm.animate(dt, pose, Math.hypot(this.vel.x, this.vel.z), clamp(p, 0, 1))
    tm.root.position.copy(this.pos)
    tm.root.rotation.y = this.yaw
    tm.root.updateMatrixWorld(true)
    tm.updateHitboxes()
    this.model.root.position.copy(this.pos)
    g.audio.setLoop('gas', 0)
    g.audio.setLoop('wind', 0)
    void damp
  }

  dispose() {
    this.g.scene.remove(this.model.root)
    this.model.dispose()
    if (this.titanModel) {
      this.g.scene.remove(this.titanModel.root)
      this.titanModel.dispose()
    }
  }
}
