import * as THREE from 'three'
import { Environment } from '../world/Environment'
import { getMap } from '../../data/maps'
import { buildWallSegment, buildHouse, HOUSE_DIMS, buildGateDoor } from '../models/BuildingModels'
import { getMaterials } from '../models/VoxelBuilder'
import { TitanModel } from '../models/TitanModel'
import { CharacterModel } from '../models/CharacterModel'
import { Particles } from '../core/Particles'
import { RNG } from '../../utils/math'

/**
 * Main menu backdrop: a towering block wall seen from inside the city, the Colossal Titan's skinless
 * head rising over it in steam, titans approaching across the fields, and a Survey Corps soldier on the parapet.
 */
export class MenuScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(55, 1, 0.5, 4000)
  private env: Environment
  private colossal: TitanModel
  private walkers: { m: TitanModel; speed: number; x: number; z: number }[] = []
  private soldier: CharacterModel
  private particles: Particles
  private raf = 0
  private t = 0
  private last = performance.now()
  private ro: ResizeObserver

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    container.appendChild(this.renderer.domElement)
    const map = getMap('shiganshina')
    this.env = new Environment(this.scene, map, 'medium', true)
    this.env.baseFogNear = 120
    this.env.baseFogFar = 1100
    this.particles = new Particles(this.scene, 'medium')
    const rng = new RNG(4)
    // the wall: a line of segments along x at z=0, outer face toward -z
    for (let i = -4; i <= 4; i++) {
      const geo = buildWallSegment({ len: 40, height: 50, thick: 10, stone: rng.pick(map.wallPalette), seed: i + 10, gate: i === 0 }, 0)
      const m = new THREE.Mesh(geo, getMaterials())
      m.position.set(i * 40, 0, 0)
      m.castShadow = m.receiveShadow = true
      this.scene.add(m)
    }
    const door = new THREE.Mesh(buildGateDoor(0), getMaterials())
    door.position.set(0, 0, -3.8)
    this.scene.add(door)
    // houses on the inside (+z)
    const kinds = Object.keys(HOUSE_DIMS) as (keyof typeof HOUSE_DIMS)[]
    for (let i = 0; i < 26; i++) {
      const kind = rng.pick(kinds)
      const d = HOUSE_DIMS[kind]
      const geo = buildHouse({ kind, w: d.w, d: d.d, floors: d.floors + rng.int(0, 1), roof: rng.pick(map.roofPalette), wall: rng.pick(['#e9e0cc', '#e2d6bc', '#d8ccb0']), timber: '#4a3020', shutter: '#3a5a3a', seed: i * 3 }, 0)
      const m = new THREE.Mesh(geo, getMaterials())
      const row = Math.floor(i / 13)
      m.position.set(-110 + (i % 13) * 18 + rng.range(-2, 2), 0, 22 + row * 18 + rng.range(-2, 2))
      m.rotation.y = rng.chance(0.5) ? 0 : Math.PI
      m.castShadow = m.receiveShadow = true
      this.scene.add(m)
    }
    // Colossal titan behind the wall, peering over
    this.colossal = new TitanModel('colossal', 60, 3)
    this.colossal.root.position.set(18, 0, -14)
    this.colossal.root.rotation.y = 0.08
    this.scene.add(this.colossal.root)
    // approaching titans in the field (visible through the open gate & from the parapet)
    for (let i = 0; i < 7; i++) {
      const type = i === 3 ? 'abnormal' : 'normal'
      const m = new TitanModel(type, rng.range(5, 14), i * 11 + 1)
      const x = rng.range(-160, 160), z = rng.range(-320, -120)
      m.root.position.set(x, 0, z)
      this.scene.add(m.root)
      this.walkers.push({ m, speed: rng.range(1.5, type === 'abnormal' ? 7 : 3), x, z })
    }
    // a soldier with cape on the parapet
    this.soldier = new CharacterModel({ look: { skin: '#e8b98f', hair: '#3a2416', hairStyle: 'eren', eyes: '#2f9a6a', height: 1 }, faction: 'survey', seed: 1 })
    this.soldier.root.position.set(-7, 50, -2)
    this.soldier.root.rotation.y = Math.PI
    this.soldier.root.scale.setScalar(1)
    this.scene.add(this.soldier.root)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    this.tick()
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.particles.setScale(h / (2 * Math.tan((this.camera.fov * Math.PI) / 360)))
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.t += dt
    const t = this.t
    // slow cinematic drift looking up at the wall
    this.camera.position.set(Math.sin(t * 0.05) * 30 - 10, 22 + Math.sin(t * 0.08) * 4, 150 + Math.cos(t * 0.05) * 10)
    this.camera.lookAt(4, 44, 0)
    this.colossal.animate(dt, 'idle', 0, 0)
    this.colossal.head.rotation.y = Math.sin(t * 0.15) * 0.25
    this.colossal.head.rotation.x = 0.25
    this.colossal.root.updateMatrixWorld(true)
    if (Math.random() < 0.35) {
      const p = this.colossal.neck.getWorldPosition(new THREE.Vector3())
      const side = Math.random() < 0.5 ? -1 : 1
      this.particles.emit('steam', p.x + side * (8 + Math.random() * 8), p.y - 6 + Math.random() * 4, p.z - 4, 1, { size: 5, spread: 3, up: 3, speed: 2 })
    }
    for (const w of this.walkers) {
      w.z += w.speed * dt
      if (w.z > -30) w.z = -330
      w.m.root.position.set(w.x, 0, w.z)
      w.m.root.rotation.y = 0
      w.m.animate(dt, w.speed > 4 ? 'run' : 'walk', w.speed, 0)
    }
    this.soldier.update(dt, 'idle', 0)
    this.particles.update(dt)
    this.env.follow(new THREE.Vector3(0, 0, 0), dt)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry?.dispose()
    })
    this.particles.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}
