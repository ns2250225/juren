import * as THREE from 'three'
import { particleTexture } from '../../utils/textures'
import { rand } from '../../utils/math'

/**
 * Pixel-square particles (Minecraft style) rendered as one Points cloud per blend mode,
 * plus instanced block debris with simple physics. Hard caps keep frame time bounded.
 */
export type PKind = 'smoke' | 'steam' | 'dust' | 'fire' | 'spark' | 'blood' | 'gas' | 'flare' | 'speck'

interface P {
  alive: boolean
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  life: number; max: number
  size0: number; size1: number
  r: number; g: number; b: number
  a: number
  grav: number
  drag: number
  kind: PKind
}

const VERT = `
attribute float size;
attribute vec4 rgba;
varying vec4 vC;
uniform float scale;
void main(){
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = `
uniform sampler2D map;
varying vec4 vC;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  float a = t.a * vC.a;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vC.rgb * t.rgb, a);
}`

class Cloud {
  ps: P[] = []
  geo = new THREE.BufferGeometry()
  pos: Float32Array
  col: Float32Array
  size: Float32Array
  points: THREE.Points
  mat: THREE.ShaderMaterial
  cursor = 0
  constructor(public max: number, additive: boolean) {
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 4)
    this.size = new Float32Array(max)
    for (let i = 0; i < max; i++)
      this.ps.push({ alive: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size0: 1, size1: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, kind: 'smoke' })
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: particleTexture() }, scale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = additive ? 6 : 5
  }
  spawn(): P {
    for (let n = 0; n < this.max; n++) {
      this.cursor = (this.cursor + 1) % this.max
      const p = this.ps[this.cursor]
      if (!p.alive) return p
    }
    this.cursor = (this.cursor + 1) % this.max
    return this.ps[this.cursor] // overwrite oldest-ish
  }
  update(dt: number) {
    let n = 0
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i]
      if (!p.alive) {
        this.size[i] = 0
        this.col[i * 4 + 3] = 0
        continue
      }
      p.life += dt
      if (p.life >= p.max) {
        p.alive = false
        this.size[i] = 0
        this.col[i * 4 + 3] = 0
        continue
      }
      n++
      const k = Math.exp(-p.drag * dt)
      p.vx *= k
      p.vz *= k
      p.vy = p.vy * k - p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.y < 0.05 && p.grav > 0) {
        p.y = 0.05
        p.vy *= -0.2
        p.vx *= 0.5
        p.vz *= 0.5
      }
      const f = p.life / p.max
      this.pos[i * 3] = p.x
      this.pos[i * 3 + 1] = p.y
      this.pos[i * 3 + 2] = p.z
      this.size[i] = p.size0 + (p.size1 - p.size0) * f
      let r = p.r, g = p.g, b = p.b
      if (p.kind === 'fire') {
        r = 1
        g = 0.75 * (1 - f) + 0.15
        b = 0.25 * (1 - f)
      } else if (p.kind === 'blood' && f > 0.4) {
        // titan blood evaporates into steam
        const e = (f - 0.4) / 0.6
        r = p.r + (0.9 - p.r) * e
        g = p.g + (0.9 - p.g) * e
        b = p.b + (0.9 - p.b) * e
      }
      this.col[i * 4] = r
      this.col[i * 4 + 1] = g
      this.col[i * 4 + 2] = b
      const fadeIn = Math.min(1, p.life / 0.12)
      this.col[i * 4 + 3] = p.a * fadeIn * (1 - f) * (p.kind === 'steam' || p.kind === 'smoke' ? 1 - f * 0.3 : 1)
    }
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.rgba as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true
    return n
  }
}

interface Debris {
  alive: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  rot: THREE.Euler
  spin: THREE.Vector3
  life: number
  size: number
}

export class Particles {
  normal: Cloud
  glow: Cloud
  debris: THREE.InstancedMesh
  private deb: Debris[] = []
  private dCursor = 0
  private m4 = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private v = new THREE.Vector3()
  budget = 1

  constructor(scene: THREE.Scene, quality: 'low' | 'medium' | 'high') {
    const n = quality === 'high' ? 4000 : quality === 'medium' ? 2500 : 1200
    this.budget = quality === 'high' ? 1 : quality === 'medium' ? 0.7 : 0.4
    this.normal = new Cloud(n, false)
    this.glow = new Cloud(Math.floor(n / 3), true)
    scene.add(this.normal.points, this.glow.points)
    const dn = quality === 'low' ? 150 : 400
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ vertexColors: false }), dn)
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.debris.castShadow = false
    this.debris.frustumCulled = false
    for (let i = 0; i < dn; i++) {
      this.deb.push({ alive: false, pos: new THREE.Vector3(0, -100, 0), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, size: 1 })
      this.debris.setMatrixAt(i, this.m4.makeScale(0, 0, 0))
      this.debris.setColorAt(i, new THREE.Color(1, 1, 1))
    }
    scene.add(this.debris)
  }

  setScale(px: number) {
    this.normal.mat.uniforms.scale.value = px
    this.glow.mat.uniforms.scale.value = px
  }

  emit(kind: PKind, x: number, y: number, z: number, count: number, o: { spread?: number; speed?: number; size?: number; color?: THREE.Color | string; up?: number; life?: number; dir?: THREE.Vector3 } = {}) {
    const n = Math.max(1, Math.round(count * this.budget))
    const cloud = kind === 'fire' || kind === 'spark' || kind === 'flare' ? this.glow : this.normal
    const col = o.color ? new THREE.Color(o.color) : null
    for (let i = 0; i < n; i++) {
      const p = cloud.spawn()
      const sp = o.spread ?? 1
      p.alive = true
      p.kind = kind
      p.x = x + rand(-sp, sp)
      p.y = y + rand(-sp, sp) * 0.5
      p.z = z + rand(-sp, sp)
      const s = o.speed ?? 2
      p.vx = rand(-s, s)
      p.vy = rand(-s * 0.3, s) + (o.up ?? 0)
      p.vz = rand(-s, s)
      if (o.dir) {
        p.vx += o.dir.x
        p.vy += o.dir.y
        p.vz += o.dir.z
      }
      p.life = 0
      const size = o.size ?? 1
      p.grav = 0
      p.drag = 1
      p.a = 1
      switch (kind) {
        case 'smoke':
          p.max = (o.life ?? 3) * rand(0.7, 1.3); p.size0 = 2 * size; p.size1 = 7 * size; p.r = p.g = p.b = rand(0.25, 0.4); p.vy += 1.5; p.a = 0.7
          break
        case 'steam':
          p.max = (o.life ?? 2.5) * rand(0.7, 1.3); p.size0 = 3 * size; p.size1 = 10 * size; p.r = p.g = p.b = rand(0.88, 1); p.vy += 3; p.a = 0.55; p.drag = 0.8
          break
        case 'dust':
          p.max = (o.life ?? 2.2) * rand(0.7, 1.3); p.size0 = 2 * size; p.size1 = 8 * size; p.r = 0.62; p.g = 0.56; p.b = 0.46; p.a = 0.6; p.vy += 0.6; p.drag = 1.5
          break
        case 'fire':
          p.max = (o.life ?? 0.9) * rand(0.6, 1.2); p.size0 = 1.6 * size; p.size1 = 0.4 * size; p.vy += 3; p.r = 1; p.g = 0.6; p.b = 0.2
          break
        case 'spark':
          p.max = (o.life ?? 0.4) * rand(0.5, 1); p.size0 = 0.35 * size; p.size1 = 0.1; p.r = 1; p.g = 0.9; p.b = 0.6; p.grav = 12; p.drag = 0.5
          break
        case 'blood':
          p.max = (o.life ?? 1.3) * rand(0.7, 1.2); p.size0 = 0.8 * size; p.size1 = 2.4 * size; p.r = 0.7; p.g = 0.08; p.b = 0.06; p.grav = 6; p.drag = 0.4
          break
        case 'gas':
          p.max = (o.life ?? 0.6) * rand(0.6, 1.2); p.size0 = 0.4 * size; p.size1 = 1.6 * size; p.r = p.g = p.b = 0.95; p.a = 0.5; p.drag = 4
          break
        case 'flare':
          p.max = (o.life ?? 4) * rand(0.8, 1.2); p.size0 = 2.5 * size; p.size1 = 6 * size; p.r = 0.3; p.g = 1; p.b = 0.4; p.a = 0.8; p.drag = 1.5
          break
        case 'speck':
          p.max = (o.life ?? 0.5) * rand(0.6, 1); p.size0 = 0.25 * size; p.size1 = 0.05; p.r = p.g = p.b = 1; p.drag = 0.2
          break
      }
      if (col) {
        p.r = col.r
        p.g = col.g
        p.b = col.b
      }
    }
  }

  /** block debris chunks (walls/buildings breaking, rocks) */
  chunks(x: number, y: number, z: number, count: number, color: THREE.ColorRepresentation, speed = 8, size = 1) {
    const c = new THREE.Color(color)
    const n = Math.max(1, Math.round(count * this.budget))
    for (let i = 0; i < n; i++) {
      this.dCursor = (this.dCursor + 1) % this.deb.length
      const d = this.deb[this.dCursor]
      d.alive = true
      d.pos.set(x + rand(-1, 1) * size, y + rand(-1, 1) * size, z + rand(-1, 1) * size)
      d.vel.set(rand(-speed, speed), rand(speed * 0.3, speed * 1.4), rand(-speed, speed))
      d.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6))
      d.life = rand(2, 4)
      d.size = rand(0.3, 1) * size
      const cc = c.clone().multiplyScalar(rand(0.75, 1.1))
      this.debris.setColorAt(this.dCursor, cc)
    }
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true
  }

  update(dt: number) {
    this.normal.update(dt)
    this.glow.update(dt)
    for (let i = 0; i < this.deb.length; i++) {
      const d = this.deb[i]
      if (!d.alive) continue
      d.life -= dt
      if (d.life <= 0) {
        d.alive = false
        this.debris.setMatrixAt(i, this.m4.makeScale(0, 0, 0))
        continue
      }
      d.vel.y -= 22 * dt
      d.pos.addScaledVector(d.vel, dt)
      if (d.pos.y < d.size / 2) {
        d.pos.y = d.size / 2
        d.vel.y *= -0.3
        d.vel.x *= 0.6
        d.vel.z *= 0.6
        d.spin.multiplyScalar(0.6)
      }
      d.rot.x += d.spin.x * dt
      d.rot.y += d.spin.y * dt
      d.rot.z += d.spin.z * dt
      const s = d.size * Math.min(1, d.life * 2)
      this.q.setFromEuler(d.rot)
      this.m4.compose(d.pos, this.q, this.v.set(s, s, s))
      this.debris.setMatrixAt(i, this.m4)
    }
    this.debris.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.normal.geo.dispose()
    this.glow.geo.dispose()
    this.normal.mat.dispose()
    this.glow.mat.dispose()
    this.debris.geometry.dispose()
  }
}
