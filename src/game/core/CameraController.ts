import * as THREE from 'three'
import type { CollisionWorld } from './Collision'
import { clamp, damp, angleDiff } from '../../utils/math'

/** Third-person orbit camera with collision, speed FOV, banking roll and trauma shake. */
export class CameraController {
  yaw = 0
  pitch = -0.15
  dist = 6.5
  private curDist = 6.5
  roll = 0
  trauma = 0
  fovBase = 75
  sensitivity = 1
  invertY = false
  private target = new THREE.Vector3()
  private tmp = new THREE.Vector3()
  private dir = new THREE.Vector3()
  shakeEnabled = true
  /** current (collision-limited) distance, used to hide the player model when the camera is inside it */
  get currentDistance() {
    return this.curDist
  }

  constructor(public camera: THREE.PerspectiveCamera, private collision: CollisionWorld) {}

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
  }
  get flatForward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
  }
  get right() {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw))
  }

  look(dx: number, dy: number) {
    const s = 0.0022 * this.sensitivity
    this.yaw -= dx * s
    this.pitch += (this.invertY ? dy : -dy) * s
    this.pitch = clamp(this.pitch, -1.45, 1.35)
  }

  /** gently steer view toward a world point (lock-on / mobile assist) */
  steerTo(p: THREE.Vector3, from: THREE.Vector3, dt: number, strength = 4) {
    const d = this.tmp.copy(p).sub(from)
    const wantYaw = Math.atan2(d.x, d.z)
    const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z))
    this.yaw += angleDiff(this.yaw, wantYaw) * (1 - Math.exp(-strength * dt))
    this.pitch = damp(this.pitch, clamp(wantPitch, -1.2, 1.2), strength, dt)
  }

  addTrauma(t: number) {
    this.trauma = Math.min(1, this.trauma + t)
  }

  update(dt: number, focus: THREE.Vector3, vel: THREE.Vector3, opts: { shoulder?: number; dist?: number; speedFx?: boolean } = {}) {
    const speed = vel.length()
    this.target.copy(focus)
    const want = opts.dist ?? this.dist
    const f = this.forward
    const shoulder = opts.shoulder ?? 0.75
    const right = this.right
    // desired camera position: behind & over the right shoulder
    this.dir.copy(f).multiplyScalar(-1)
    const pivot = this.tmp.copy(this.target).addScaledVector(right, shoulder)
    const hit = this.collision.raycast(pivot, this.dir, want + 0.5, (c) => c.kind !== 'tree' || true, true)
    let d = want
    if (hit && hit.t < want + 0.3) d = Math.max(0.8, hit.t - 0.4)
    this.curDist = d < this.curDist ? d : damp(this.curDist, d, 6, dt)
    const pos = pivot.clone().addScaledVector(this.dir, this.curDist)
    if (pos.y < 0.4) pos.y = 0.4
    // shake
    let sx = 0, sy = 0, sr = 0
    if (this.trauma > 0) {
      const t = this.shakeEnabled ? this.trauma * this.trauma : 0
      sx = (Math.random() - 0.5) * 0.6 * t
      sy = (Math.random() - 0.5) * 0.6 * t
      sr = (Math.random() - 0.5) * 0.06 * t
      this.trauma = Math.max(0, this.trauma - dt * 1.4)
    }
    this.camera.position.copy(pos)
    this.camera.position.x += sx
    this.camera.position.y += sy
    // banking roll from lateral velocity
    const lat = opts.speedFx === false ? 0 : vel.dot(right)
    this.roll = damp(this.roll, clamp(-lat * 0.006, -0.18, 0.18), 4, dt)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.pitch, this.yaw + Math.PI, this.roll + sr)
    // speed FOV
    const fov = this.fovBase + (opts.speedFx === false ? 0 : clamp((speed - 12) * 0.45, 0, 22))
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 4, dt)
      this.camera.updateProjectionMatrix()
    }
  }

  /** ray from camera through the crosshair */
  aimRay(out: { o: THREE.Vector3; d: THREE.Vector3 }) {
    out.o.copy(this.camera.position)
    this.camera.getWorldDirection(out.d)
    return out
  }
}
