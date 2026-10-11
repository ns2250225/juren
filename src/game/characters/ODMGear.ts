import * as THREE from 'three'
import type { Titan } from '../titans/TitanManager'
import type { Hitbox } from '../models/TitanModel'

export type HookState = 'idle' | 'flying' | 'attached' | 'retract'

export interface AimInfo {
  point: THREE.Vector3
  dist: number
  valid: boolean
  titan: Titan | null
  hb: Hitbox | null
}

export class Hook {
  state: HookState = 'idle'
  tip = new THREE.Vector3()
  anchor = new THREE.Vector3()
  length = 0
  titan: Titan | null = null
  hb: Hitbox | null = null
  local = new THREE.Vector3()
  missed = false
  flyDist = 0
  constructor(public side: 'L' | 'R') {}
}

/**
 * 立体机动装置: two grappling hooks shot from the hip gear. Hooks travel as fast projectiles, attach to
 * static geometry or titan body parts (anchor follows the bone), then act as inelastic rope constraints
 * which the player reels with the winch + gas (physics lives in PlayerController).
 */
export class ODMGear {
  L = new Hook('L')
  R = new Hook('R')
  speed = 280
  onAttach: ((h: Hook) => void) | null = null

  get hooks() {
    return [this.L, this.R]
  }
  get attached() {
    return this.hooks.filter((h) => h.state === 'attached')
  }
  get anyActive() {
    return this.L.state !== 'idle' || this.R.state !== 'idle'
  }

  fire(h: Hook, origin: THREE.Vector3, aim: AimInfo | null, range: number, fallbackDir: THREE.Vector3) {
    h.tip.copy(origin)
    h.flyDist = 0
    if (aim && aim.valid) {
      h.anchor.copy(aim.point)
      h.missed = false
      h.titan = aim.titan
      h.hb = aim.hb
      if (aim.titan && aim.hb) h.local.copy(aim.point).applyMatrix4(aim.hb.inv)
    } else {
      h.anchor.copy(origin).addScaledVector(fallbackDir, range)
      h.missed = true
      h.titan = null
      h.hb = null
    }
    h.state = 'flying'
  }

  release(h: Hook) {
    if (h.state === 'idle') return
    h.state = 'retract'
    h.titan = null
    h.hb = null
  }
  releaseAll() {
    this.release(this.L)
    this.release(this.R)
  }
  reset() {
    for (const h of this.hooks) {
      h.state = 'idle'
      h.titan = null
      h.hb = null
    }
  }

  update(dt: number, hipL: THREE.Vector3, hipR: THREE.Vector3, playerCenter: THREE.Vector3) {
    for (const h of this.hooks) {
      const hip = h.side === 'L' ? hipL : hipR
      // titan anchors move with the body; dead titans drop the hook
      if (h.titan && h.hb) {
        if (!h.titan.alive && h.titan.deathT > 2) {
          this.release(h)
        } else h.anchor.copy(h.local).applyMatrix4(h.hb.world)
      }
      if (h.state === 'flying') {
        const step = this.speed * dt
        const to = h.anchor.clone().sub(h.tip)
        const d = to.length()
        if (d <= step) {
          h.tip.copy(h.anchor)
          if (h.missed) h.state = 'retract'
          else {
            h.state = 'attached'
            h.length = h.anchor.distanceTo(playerCenter)
            this.onAttach?.(h)
          }
        } else h.tip.addScaledVector(to, step / d)
      } else if (h.state === 'attached') {
        h.tip.copy(h.anchor)
      } else if (h.state === 'retract') {
        const to = hip.clone().sub(h.tip)
        const d = to.length()
        const step = this.speed * 1.3 * dt
        if (d <= step) h.state = 'idle'
        else h.tip.addScaledVector(to, step / d)
      } else h.tip.copy(hip)
    }
  }
}
