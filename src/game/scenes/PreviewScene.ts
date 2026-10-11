import * as THREE from 'three'
import { TitanModel, type TitanPose } from '../models/TitanModel'
import { CharacterModel, type AnimState } from '../models/CharacterModel'
import type { TitanType } from '../../data/titans'
import type { CharacterLook } from '../../data/characters'
import { TITANS } from '../../data/titans'

/**
 * Small self-contained renderer for model previews (bestiary, character select):
 * drag to rotate, wheel / pinch to zoom, animation switching, GLB export.
 */
export class PreviewScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(35, 1, 0.05, 2000)
  private root = new THREE.Group()
  private titan: TitanModel | null = null
  private human: CharacterModel | null = null
  private yaw = 0.6
  private pitch = 0.15
  private zoom = 1
  private dragging = false
  private lastX = 0
  private lastY = 0
  private raf = 0
  private last = performance.now()
  private size = 2
  anim: string = 'idle'
  private animT = 0
  autoRotate = true
  private ro: ResizeObserver

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x5a4a3a, 1.6))
    const sun = new THREE.DirectionalLight(0xffe2c0, 2.2)
    sun.position.set(3, 6, 4)
    this.scene.add(sun)
    const rim = new THREE.DirectionalLight(0x9ab8ff, 0.8)
    rim.position.set(-4, 3, -5)
    this.scene.add(rim)
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.04, 24), new THREE.MeshLambertMaterial({ color: 0x3a3028 }))
    disc.name = 'disc'
    this.scene.add(disc, this.root)
    canvas.addEventListener('pointerdown', this.pd)
    window.addEventListener('pointermove', this.pm)
    window.addEventListener('pointerup', this.pu)
    canvas.addEventListener('wheel', this.wh, { passive: false })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    this.tick()
  }

  private pd = (e: PointerEvent) => {
    this.dragging = true
    this.autoRotate = false
    this.lastX = e.clientX
    this.lastY = e.clientY
  }
  private pm = (e: PointerEvent) => {
    if (!this.dragging) return
    this.yaw -= (e.clientX - this.lastX) * 0.01
    this.pitch = Math.max(-0.3, Math.min(1.2, this.pitch + (e.clientY - this.lastY) * 0.006))
    this.lastX = e.clientX
    this.lastY = e.clientY
  }
  private pu = () => (this.dragging = false)
  private wh = (e: WheelEvent) => {
    e.preventDefault()
    this.zoom = Math.max(0.35, Math.min(2.2, this.zoom * (e.deltaY > 0 ? 1.1 : 0.9)))
  }

  private clear() {
    this.root.clear()
    this.titan?.dispose()
    this.human?.dispose()
    this.titan = null
    this.human = null
  }

  showTitan(type: TitanType, seed = 7) {
    this.clear()
    const def = TITANS[type]
    const h = (def.height[0] + def.height[1]) / 2
    this.titan = new TitanModel(type, h, seed)
    this.root.add(this.titan.root)
    this.size = h
    this.titan.setCrystal(type === 'female' && this.anim === 'harden')
    const disc = this.scene.getObjectByName('disc')!
    disc.scale.set(h * 0.5, 1, h * 0.5)
  }

  showCharacter(look: CharacterLook, faction: 'survey' | 'garrison' | 'civilian' = 'survey') {
    this.clear()
    this.human = new CharacterModel({ look, faction, seed: 5 })
    this.root.add(this.human.root)
    this.size = 1.8
    const disc = this.scene.getObjectByName('disc')!
    disc.scale.set(0.9, 1, 0.9)
  }

  setAnim(a: string) {
    this.anim = a
    this.animT = 0
    if (this.titan) this.titan.setCrystal(this.titan.type === 'female' && a === 'harden')
  }

  private resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    if (this.autoRotate) this.yaw += dt * 0.4
    this.animT += dt
    if (this.titan) {
      const loopDur = 1.8
      const p = (this.animT % loopDur) / loopDur
      const pose = this.anim as TitanPose
      const moving = pose === 'walk' || pose === 'run'
      this.titan.animate(dt, pose, moving ? this.titan.height * 0.25 : 0, p)
      this.titan.root.position.set(0, 0, 0)
    }
    if (this.human) {
      const st = (this.anim === 'slash' ? 'idle' : this.anim) as AnimState
      if (this.anim === 'slash') {
        const p = (this.animT % 0.9) / 0.9
        this.human.slashT = p < 0.4 ? p / 0.4 : -1
        this.human.slashSide = Math.floor(this.animT / 0.9) % 2 ? 1 : -1
      } else this.human.slashT = -1
      this.human.update(dt, st, st === 'run' ? 7 : st === 'fly' ? 30 : 0)
    }
    const d = this.size * 2.4 * this.zoom + 1
    const target = new THREE.Vector3(0, this.size * 0.5, 0)
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * d, target.y + Math.sin(this.pitch) * d, Math.cos(this.yaw) * Math.cos(this.pitch) * d)
    this.camera.lookAt(target)
    this.camera.near = this.size * 0.02
    this.camera.far = this.size * 40
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
  }

  async exportGLB(name: string) {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
    const exp = new GLTFExporter()
    const obj = this.root.children[0]
    if (!obj) return
    const res = await exp.parseAsync(obj, { binary: true })
    const blob = new Blob([res as ArrayBuffer], { type: 'model/gltf-binary' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}.glb`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointerdown', this.pd)
    window.removeEventListener('pointermove', this.pm)
    window.removeEventListener('pointerup', this.pu)
    this.canvas.removeEventListener('wheel', this.wh)
    this.ro.disconnect()
    this.clear()
    this.renderer.dispose()
  }
}
