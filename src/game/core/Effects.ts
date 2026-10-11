import * as THREE from 'three'
import { rand } from '../../utils/math'

interface Arc {
  mesh: THREE.Mesh
  t: number
  life: number
}
interface FloatText {
  el: HTMLDivElement
  pos: THREE.Vector3
  t: number
  life: number
  vy: number
}
interface Ring {
  mesh: THREE.Mesh
  t: number
  life: number
  r: number
}
interface Bolt {
  line: THREE.Line
  t: number
}

/** Ropes, blade arcs, shockwave rings, lightning, world-space damage numbers and speed lines. */
export class Effects {
  private ropeGeo: THREE.BufferGeometry
  private ropePos: Float32Array
  private ropeCol: Float32Array
  private ropeCount = 0
  ropes: THREE.LineSegments
  private arcs: Arc[] = []
  private rings: Ring[] = []
  private bolts: Bolt[] = []
  private texts: FloatText[] = []
  private arcMat: THREE.MeshBasicMaterial
  private v = new THREE.Vector3()
  private MAX_ROPES = 160
  speedCanvas: HTMLCanvasElement | null = null
  textLayer: HTMLElement | null = null

  constructor(private scene: THREE.Scene) {
    this.ropePos = new Float32Array(this.MAX_ROPES * 6)
    this.ropeCol = new Float32Array(this.MAX_ROPES * 6)
    this.ropeGeo = new THREE.BufferGeometry()
    this.ropeGeo.setAttribute('position', new THREE.BufferAttribute(this.ropePos, 3).setUsage(THREE.DynamicDrawUsage))
    this.ropeGeo.setAttribute('color', new THREE.BufferAttribute(this.ropeCol, 3).setUsage(THREE.DynamicDrawUsage))
    this.ropes = new THREE.LineSegments(this.ropeGeo, new THREE.LineBasicMaterial({ vertexColors: true }))
    this.ropes.frustumCulled = false
    scene.add(this.ropes)
    // gradient texture for blade arcs
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 4
    const g = c.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 64, 0)
    gr.addColorStop(0, 'rgba(255,255,255,0)')
    gr.addColorStop(0.7, 'rgba(200,230,255,0.6)')
    gr.addColorStop(1, 'rgba(255,255,255,1)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 4)
    const tex = new THREE.CanvasTexture(c)
    this.arcMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  }

  beginRopes() {
    this.ropeCount = 0
  }
  rope(a: THREE.Vector3, b: THREE.Vector3, color = 0x2a2a2a) {
    if (this.ropeCount >= this.MAX_ROPES) return
    const i = this.ropeCount++ * 6
    this.ropePos[i] = a.x
    this.ropePos[i + 1] = a.y
    this.ropePos[i + 2] = a.z
    this.ropePos[i + 3] = b.x
    this.ropePos[i + 4] = b.y
    this.ropePos[i + 5] = b.z
    const c = new THREE.Color(color)
    this.ropeCol[i] = this.ropeCol[i + 3] = c.r
    this.ropeCol[i + 1] = this.ropeCol[i + 4] = c.g
    this.ropeCol[i + 2] = this.ropeCol[i + 5] = c.b
  }
  endRopes() {
    this.ropeGeo.setDrawRange(0, this.ropeCount * 2)
    ;(this.ropeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.ropeGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true
  }

  /** curved blade light arc in front of the character */
  slash(pos: THREE.Vector3, yaw: number, pitch: number, side: number, radius = 2.4, color = 0xcfe8ff) {
    const geo = new THREE.RingGeometry(radius * 0.55, radius, 18, 1, 0, Math.PI * 1.15)
    const mat = this.arcMat.clone()
    mat.color = new THREE.Color(color)
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(pos)
    m.rotation.order = 'YXZ'
    m.rotation.set(-Math.PI / 2 + pitch * 0.5, yaw, side * 0.6 + rand(-0.2, 0.2))
    m.rotateZ(side > 0 ? 0.2 : Math.PI - 1.35)
    this.scene.add(m)
    this.arcs.push({ mesh: m, t: 0, life: 0.18 })
  }

  ring(pos: THREE.Vector3, radius: number, color = 0xffffff, life = 0.6) {
    const geo = new THREE.RingGeometry(0.85, 1, 40)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(pos)
    m.rotation.x = -Math.PI / 2
    this.scene.add(m)
    this.rings.push({ mesh: m, t: 0, life, r: radius })
  }

  lightning(from: THREE.Vector3, to: THREE.Vector3) {
    const pts: THREE.Vector3[] = []
    const n = 14
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n)
      if (i > 0 && i < n) p.add(new THREE.Vector3(rand(-3, 3), rand(-1, 1), rand(-3, 3)))
      pts.push(p)
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xfff6a0, transparent: true }))
    this.scene.add(line)
    this.bolts.push({ line, t: 0 })
  }

  floatText(pos: THREE.Vector3, text: string, cls = '') {
    if (!this.textLayer) return
    if (this.texts.length > 40) {
      const old = this.texts.shift()!
      old.el.remove()
    }
    const el = document.createElement('div')
    el.className = 'ftext ' + cls
    el.textContent = text
    this.textLayer.appendChild(el)
    this.texts.push({ el, pos: pos.clone(), t: 0, life: 1.1, vy: 2.5 })
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number) {
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i]
      a.t += dt
      const f = a.t / a.life
      ;(a.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - f
      a.mesh.scale.setScalar(1 + f * 0.25)
      if (f >= 1) {
        this.scene.remove(a.mesh)
        a.mesh.geometry.dispose()
        ;(a.mesh.material as THREE.Material).dispose()
        this.arcs.splice(i, 1)
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.t += dt
      const f = r.t / r.life
      r.mesh.scale.setScalar(0.1 + r.r * f)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - f)
      if (f >= 1) {
        this.scene.remove(r.mesh)
        r.mesh.geometry.dispose()
        ;(r.mesh.material as THREE.Material).dispose()
        this.rings.splice(i, 1)
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.t += dt
      ;(b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - b.t / 0.5) * (Math.random() > 0.3 ? 1 : 0.3)
      if (b.t > 0.5) {
        this.scene.remove(b.line)
        b.line.geometry.dispose()
        ;(b.line.material as THREE.Material).dispose()
        this.bolts.splice(i, 1)
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]
      t.t += dt
      t.pos.y += t.vy * dt
      const f = t.t / t.life
      if (f >= 1) {
        t.el.remove()
        this.texts.splice(i, 1)
        continue
      }
      this.v.copy(t.pos).project(camera)
      if (this.v.z > 1 || this.v.z < -1) {
        t.el.style.display = 'none'
        continue
      }
      t.el.style.display = ''
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h
      t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${1 + (1 - f) * 0.3})`
      t.el.style.opacity = String(f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3)
    }
  }

  /** pixel speed lines overlay */
  drawSpeedLines(intensity: number, t: number) {
    const c = this.speedCanvas
    if (!c) return
    const ctx = c.getContext('2d')!
    const w = c.width, h = c.height
    ctx.clearRect(0, 0, w, h)
    if (intensity <= 0.02) return
    const n = Math.floor(28 * intensity) + 4
    const cx = w / 2, cy = h / 2
    ctx.fillStyle = `rgba(255,255,255,${0.35 * intensity})`
    const seed = Math.floor(t * 20)
    for (let i = 0; i < n; i++) {
      const a = ((i * 137.5 + seed * 31) % 360) * (Math.PI / 180)
      const r0 = Math.min(w, h) * (0.32 + ((i * 7 + seed) % 10) / 40)
      const len = Math.min(w, h) * (0.12 + intensity * 0.25)
      const px = 3
      for (let s = 0; s < len; s += px * 2) {
        const r = r0 + s
        ctx.fillRect(Math.round((cx + Math.cos(a) * r) / px) * px, Math.round((cy + Math.sin(a) * r) / px) * px, px, px)
      }
    }
  }

  dispose() {
    for (const a of this.arcs) this.scene.remove(a.mesh)
    for (const r of this.rings) this.scene.remove(r.mesh)
    for (const b of this.bolts) this.scene.remove(b.line)
    for (const t of this.texts) t.el.remove()
    this.ropeGeo.dispose()
  }
}
