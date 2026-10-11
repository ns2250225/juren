import * as THREE from 'three'
import { VoxelBuilder, getMaterials } from './VoxelBuilder'
import { emblemTexture } from '../../utils/textures'
import type { CharacterLook } from '../../data/characters'
import { RNG, clamp, damp } from '../../utils/math'

/**
 * Minecraft-proportioned human (8px head, 8×12×4 body, 4×12×4 limbs; 32px tall)
 * with Attack-on-Titan uniforms: cropped brown jacket, white trousers, harness straps,
 * knee boots, green Survey Corps cape with wings emblem, ODM gas tanks + blade boxes at the hips.
 */
export type Faction = 'survey' | 'garrison' | 'civilian' | 'commander' | 'medic' | 'engineer'
export type AnimState = 'idle' | 'run' | 'jump' | 'fly' | 'hurt' | 'death' | 'grabbed' | 'spin' | 'repair' | 'cheer'

const PX = 1.72 / 32

interface Palette {
  jacket: string
  shirt: string
  pants: string
  boots: string
  strap: string
  cape?: string
  gear: boolean
}

function paletteFor(f: Faction, rng: RNG): Palette {
  switch (f) {
    case 'survey':
      return { jacket: '#8a5a32', shirt: '#ebe6da', pants: '#ece6d2', boots: '#3a2215', strap: '#25170e', cape: '#2e5a3a', gear: true }
    case 'garrison':
    case 'engineer':
      return { jacket: '#7d5634', shirt: '#e6e0d0', pants: '#e3dcc6', boots: '#3a2215', strap: '#25170e', cape: f === 'engineer' ? undefined : '#5b2626', gear: true }
    case 'commander':
      return { jacket: '#7d5634', shirt: '#e6e0d0', pants: '#e3dcc6', boots: '#2a1a10', strap: '#25170e', cape: '#5b2626', gear: false }
    case 'medic':
      return { jacket: '#efece4', shirt: '#ffffff', pants: '#e3dcc6', boots: '#3a2215', strap: '#6b5a4a', gear: false }
    default: {
      const shirts = ['#8a6a4a', '#5a6a8a', '#7a3a3a', '#6a7a4a', '#a08a6a', '#4a4a5a', '#b08a5a', '#6a4a6a']
      const pants = ['#4a3a2a', '#3a3a3a', '#5a4a3a', '#6a5a4a', '#2a2a3a']
      return { jacket: rng.pick(shirts), shirt: rng.pick(shirts), pants: rng.pick(pants), boots: '#3a2a1a', strap: '#3a2a1a', gear: false }
    }
  }
}

export interface CharacterOpts {
  look: CharacterLook
  faction: Faction
  seed?: number
  blades?: boolean
}

function buildHair(b: VoxelBuilder, style: CharacterLook['hairStyle'], hair: string, skin: string) {
  // head occupies x[-4,4] y[0,8] z[-4,4] in head-local px; face is +z
  const H = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => b.span(x0, y0, z0, x1, y1, z1, hair, 'plain', { jitter: 0.05 })
  switch (style) {
    case 'eren':
      H(-4.5, 6.5, -4.5, 4.5, 8.6, 4.5)
      H(-4.5, 2, -4.5, 4.5, 7, -3.4) // back to nape
      H(-4.6, 3.5, -3.5, -3.6, 7, 3.5)
      H(3.6, 3.5, -3.5, 4.6, 7, 3.5)
      H(-4.5, 5.5, 3.5, -1, 7, 4.6) // fringe left
      H(0.5, 5.8, 3.5, 4.5, 7, 4.6)
      H(-1, 5, 3.6, 0.5, 6.8, 4.7) // centre strand
      H(-4.6, 2.5, 1, -3.6, 4, 3)
      H(3.6, 2.5, 1, 4.6, 4, 3)
      break
    case 'mikasa':
      H(-4.5, 6.5, -4.5, 4.5, 8.5, 4.5)
      H(-4.6, 1, -4.6, 4.6, 7, -3.4)
      H(-4.7, 1, -3.5, -3.6, 7, 3.6)
      H(3.6, 1, -3.5, 4.7, 7, 3.6)
      H(-4.5, 5.2, 3.5, -0.8, 7, 4.6)
      H(0.6, 5.6, 3.5, 4.5, 7, 4.6)
      break
    case 'armin':
      H(-4.6, 6.5, -4.6, 4.6, 8.6, 4.6)
      H(-4.7, 1.5, -4.7, 4.7, 7, -3.3)
      H(-4.8, 1.5, -3.4, -3.6, 7, 3.8)
      H(3.6, 1.5, -3.4, 4.8, 7, 3.8)
      H(-4.6, 5.5, 3.5, 4.6, 7, 4.7)
      break
    case 'levi':
      H(-4.6, 6.2, -4.6, 4.6, 8.8, 4.6) // thick top overhanging
      H(-4.4, 4.5, -4.5, 4.4, 6.2, -3.6)
      b.span(-4.15, 1.5, -4.2, 4.15, 4.5, -3.9, '#3b2e28') // shaved undercut
      b.span(-4.15, 3, -3, -3.9, 6, 3, '#4a3a32')
      b.span(3.9, 3, -3, 4.15, 6, 3, '#4a3a32')
      H(-3.6, 4.8, 3.6, -0.4, 6.4, 4.7) // middle part
      H(0.4, 4.8, 3.6, 3.6, 6.4, 4.7)
      break
    case 'hange':
      H(-4.5, 6.4, -4.5, 4.5, 8.5, 4.5)
      H(-4.6, 2.5, -4.6, 4.6, 7, -3.4)
      H(-4.6, 3, -3.5, -3.6, 7, 3)
      H(3.6, 3, -3.5, 4.6, 7, 3)
      H(-4.4, 5.6, 3.5, 4.4, 7, 4.6)
      H(-1.5, 3, -6.5, 1.5, 7, -4.4) // ponytail
      H(-1, 0, -6.2, 1, 3.2, -4.8)
      break
    case 'erwin':
      H(-4.5, 6.6, -4.5, 4.5, 8.6, 4.5)
      H(-4.5, 3.5, -4.5, 4.5, 7, -3.5)
      H(-4.6, 4.5, -3.5, -3.6, 7, 3)
      H(3.6, 4.5, -3.5, 4.6, 7, 3)
      H(-4.5, 6, 3.5, 1.5, 7.2, 4.6) // side parted swept
      H(1.5, 6.8, 3.5, 4.5, 8.4, 4.6)
      break
    case 'buzz':
      H(-4.3, 6.8, -4.3, 4.3, 8.3, 4.3)
      H(-4.3, 3.5, -4.3, 4.3, 7, -3.9)
      break
    case 'short':
      H(-4.5, 6.4, -4.5, 4.5, 8.5, 4.5)
      H(-4.5, 3, -4.5, 4.5, 7, -3.5)
      H(-4.6, 4, -3.5, -3.6, 7, 2)
      H(3.6, 4, -3.5, 4.6, 7, 2)
      H(-4.5, 6, 3.5, 4.5, 7, 4.5)
      break
    case 'long':
      H(-4.6, 6.4, -4.6, 4.6, 8.5, 4.6)
      H(-4.7, -2, -4.8, 4.7, 7, -3.4)
      H(-4.8, -1, -3.5, -3.6, 7, 3)
      H(3.6, -1, -3.5, 4.8, 7, 3)
      H(-4.5, 5.6, 3.5, 4.5, 7, 4.6)
      break
    case 'bun':
      H(-4.5, 6.4, -4.5, 4.5, 8.5, 4.5)
      H(-4.5, 3, -4.5, 4.5, 7, -3.5)
      H(-2, 6, -6.5, 2, 9, -4.4)
      H(-4.6, 4, -3.5, -3.6, 7, 2)
      H(3.6, 4, -3.5, 4.6, 7, 2)
      break
    case 'bald':
      b.span(-4.2, 3, -4.3, -3.8, 5, 2, '#cfcfcf')
      b.span(3.8, 3, -4.3, 4.2, 5, 2, '#cfcfcf')
      b.span(-2.5, 1.6, 4, 2.5, 2.4, 4.4, '#d8d8d8') // mustache
      b.span(-3, 1.2, 4, -2, 2.2, 4.4, '#d8d8d8')
      b.span(2, 1.2, 4, 3, 2.2, 4.4, '#d8d8d8')
      void skin
      break
  }
}

export class CharacterModel {
  root = new THREE.Group()
  inner = new THREE.Group() // pitched/rolled during flight
  body = new THREE.Group()
  head = new THREE.Group()
  armL = new THREE.Group()
  armR = new THREE.Group()
  legL = new THREE.Group()
  legR = new THREE.Group()
  cape: THREE.Group | null = null
  bladeL: THREE.Object3D | null = null
  bladeR: THREE.Object3D | null = null
  hipL = new THREE.Object3D()
  hipR = new THREE.Object3D()
  private t = Math.random() * 10
  private capeAngle = 0
  slashT = -1 // 0..1 while slashing
  slashSide = 1
  deathT = 0
  height: number

  constructor(o: CharacterOpts) {
    const rng = new RNG(o.seed ?? 7)
    const L = o.look
    const p = paletteFor(o.faction, rng)
    const bw = L.build ?? 1
    this.height = L.height
    const scale = PX * L.height
    this.root.add(this.inner)
    this.inner.scale.setScalar(scale)

    // ---- legs (pivot at hip y=12)
    const mkLeg = (side: number) => {
      const b = new VoxelBuilder(16)
      b.span(-2, -12, -2, 2, 0, 2, p.pants, 'cloth')
      b.span(-2.25, -12, -2.25, 2.25, -5, 2.25, p.boots, 'plain') // boots
      b.span(-2.3, -12, 1.6, 2.3, -11, 2.8, p.boots) // toe
      if (p.gear || o.faction === 'commander') {
        b.span(-2.2, -3, -2.2, 2.2, -2.2, 2.2, p.strap) // thigh strap
        b.span(-2.2, -1, -2.2, 2.2, -0.3, 2.2, p.strap)
        b.span(side * 2 - 0.4, -3, -0.5, side * 2 + 0.4, 0, 0.5, p.strap)
      }
      return b.mesh()
    }
    this.legL.position.set(2, 12, 0)
    this.legR.position.set(-2, 12, 0)
    this.legL.add(mkLeg(1))
    this.legR.add(mkLeg(-1))
    this.inner.add(this.legL, this.legR)

    // ---- body (pivot at hips y=12)
    this.body.position.set(0, 12, 0)
    this.inner.add(this.body)
    const bb = new VoxelBuilder(16)
    const W = 4 * bw
    bb.span(-W, 0, -2, W, 12, 2, p.shirt, 'cloth')
    if (o.faction !== 'civilian') {
      // cropped jacket: covers chest & back from y=5.5 to 12, open front
      bb.span(-W - 0.25, 5.5, -2.25, W + 0.25, 12.1, -0.5, p.jacket, 'cloth')
      bb.span(-W - 0.25, 5.5, -0.5, -1.2, 12.1, 2.25, p.jacket, 'cloth')
      bb.span(1.2, 5.5, -0.5, W + 0.25, 12.1, 2.25, p.jacket, 'cloth')
      bb.span(-1.3, 10.5, 2.1, -0.9, 12.1, 2.4, p.jacket) // collar
      bb.span(0.9, 10.5, 2.1, 1.3, 12.1, 2.4, p.jacket)
      // harness: chest straps & belt
      bb.span(-W - 0.3, 7.5, -2.3, W + 0.3, 8.2, 2.3, p.strap)
      bb.span(-W - 0.3, 0, -2.3, W + 0.3, 1.2, 2.3, p.strap)
      bb.span(-2.2, 0, 2.2, -1.5, 12, 2.4, p.strap)
      bb.span(1.5, 0, 2.2, 2.2, 12, 2.4, p.strap)
      bb.span(-0.6, 0.1, 2.3, 0.6, 1.1, 2.5, '#b8a060', 'metal') // buckle
      bb.span(-3, 0, -2.4, 3, 2.5, -2.2, p.strap)
      if (o.faction === 'medic') bb.span(W, 9, -1, W + 0.4, 10.5, 1, '#c03030') // armband
    } else {
      bb.span(-W - 0.2, 6, -2.2, W + 0.2, 12, 2.2, p.jacket, 'cloth')
      bb.span(-W - 0.2, 0, -2.2, W + 0.2, 1, 2.2, '#4a3a2a')
    }
    if (L.cravat) bb.span(-1.2, 9, 2.1, 1.2, 12, 2.7, '#f4f4f4')
    if (L.bolo) {
      bb.span(-0.3, 8.5, 2.2, 0.3, 11.5, 2.4, '#202020')
      bb.span(-0.8, 9.6, 2.4, 0.8, 10.8, 2.8, '#2f9a5a', 'glow')
    }
    if (L.scarf) {
      bb.span(-3, 11, -2.6, 3, 12.6, 2.6, L.scarf, 'cloth')
      bb.span(1, 6, 2.1, 2.6, 11, 2.7, L.scarf, 'cloth')
    }
    // ODM gear unit on lower back + hip boxes
    if (p.gear && o.blades !== false) {
      bb.span(-2, 0.5, -3.6, 2, 3.5, -2, '#77736b', 'metal')
      const hip = new VoxelBuilder(16)
      // scabbard / blade box
      hip.span(-1, -2, -5.5, 1.4, 2, 3.5, '#8a8c8f', 'metal')
      hip.span(-1.05, 1.2, -5.55, 1.45, 1.7, 3.55, '#3a3a3a')
      // gas tank cylinder-ish
      hip.span(-0.8, 2.2, -6.5, 1.2, 4, 1.5, '#a7aaad', 'metal')
      hip.span(-0.6, 2.4, 1.5, 1, 3.8, 2.2, '#555')
      const hm = hip.mesh()
      this.hipL.add(hm)
      this.hipR.add(hm.clone())
      this.hipL.position.set(W + 1.1, 1, 0)
      this.hipR.position.set(-W - 1.1, 1, 0)
      this.hipR.scale.x = -1
      this.body.add(this.hipL, this.hipR)
    }
    this.body.add(bb.mesh())

    // ---- head (pivot at neck y=12 of body)
    this.head.position.set(0, 12, 0)
    this.body.add(this.head)
    const hb = new VoxelBuilder(16)
    hb.span(-4, 0, -4, 4, 8, 4, L.skin, 'skin')
    // face: eyes (white + iris), brows, mouth
    hb.span(-3, 3, 4, -1, 4, 4.2, '#ffffff')
    hb.span(1, 3, 4, 3, 4, 4.2, '#ffffff')
    hb.span(-2, 3, 4.05, -1, 4, 4.3, L.eyes, 'glow')
    hb.span(1, 3, 4.05, 2, 4, 4.3, L.eyes, 'glow')
    hb.span(-3, 4.4, 4, -1, 4.9, 4.25, '#3a2a20')
    hb.span(1, 4.4, 4, 3, 4.9, 4.25, '#3a2a20')
    hb.span(-1, 1.2, 4, 1, 1.7, 4.2, '#a0605a')
    hb.span(-0.4, 2.2, 4, 0.4, 3, 4.35, L.skin, 'skin')
    if (L.goggles) {
      hb.span(-4.3, 3, -4.3, 4.3, 4.6, 4.3, '#3a2a1a')
      hb.span(-3.4, 2.6, 4.2, -0.6, 5, 4.9, '#9fd6ff', 'glass')
      hb.span(0.6, 2.6, 4.2, 3.4, 5, 4.9, '#9fd6ff', 'glass')
    }
    buildHair(hb, L.hairStyle, L.hair, L.skin)
    this.head.add(hb.mesh())

    // ---- arms (pivot at shoulder)
    const mkArm = (side: number) => {
      const b = new VoxelBuilder(16)
      const sleeve = o.faction === 'civilian' ? p.jacket : p.jacket
      b.span(-2, -10, -2, 2, 2, 2, sleeve, 'cloth')
      b.span(-2.1, -10, -2.1, 2.1, -8.6, 2.1, p.shirt, 'cloth') // cuff
      b.span(-1.9, -12, -1.9, 1.9, -10, 1.9, L.skin, 'skin')
      void side
      return b.mesh()
    }
    this.armL.position.set(W + 2, 10, 0)
    this.armR.position.set(-W - 2, 10, 0)
    this.armL.add(mkArm(1))
    this.armR.add(mkArm(-1))
    this.body.add(this.armL, this.armR)

    if (o.blades !== false && (p.gear || o.faction === 'survey')) {
      const mkBlade = () => {
        const b = new VoxelBuilder(16)
        b.span(-0.8, -1.2, -1.5, 0.8, 1.2, 2, '#4a4a4a', 'metal') // handle/trigger
        b.span(-0.25, -0.9, 2, 0.25, 0.9, 20, '#dfe6ee', 'metal') // blade
        b.span(-0.3, -0.95, 19, 0.3, 0.2, 21, '#cfd6de', 'metal')
        const m = b.mesh()
        const g = new THREE.Group()
        g.add(m)
        g.position.set(0, -11, 0.5)
        g.rotation.x = 1.25
        return g
      }
      this.bladeL = mkBlade()
      this.bladeR = mkBlade()
      this.armL.add(this.bladeL)
      this.armR.add(this.bladeR)
    }

    // ---- cape
    if (p.cape) {
      this.cape = new THREE.Group()
      this.cape.position.set(0, 11.6, -2.4)
      const cb = new VoxelBuilder(16)
      cb.span(-4.8, -13, -0.7, 4.8, 0, 0, p.cape, 'cloth')
      cb.span(-5, -1, -0.8, 5, 0.6, 0.6, p.cape, 'cloth') // hood fold
      const cm = cb.mesh()
      this.cape.add(cm)
      if (o.faction === 'survey' || o.faction === 'garrison' || o.faction === 'commander') {
        const em = new THREE.Mesh(
          new THREE.PlaneGeometry(7, 7),
          new THREE.MeshLambertMaterial({ map: emblemTexture(o.faction === 'survey' ? 'survey' : 'garrison'), transparent: true, alphaTest: 0.5 }),
        )
        em.position.set(0, -6, -0.75)
        em.rotation.y = Math.PI
        this.cape.add(em)
      }
      this.body.add(this.cape)
    } else if (o.faction === 'garrison' || o.faction === 'engineer') {
      // garrison emblem on jacket back
      const em = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 4.5),
        new THREE.MeshLambertMaterial({ map: emblemTexture('garrison'), transparent: true, alphaTest: 0.5 }),
      )
      em.position.set(0, 9, -2.3)
      em.rotation.y = Math.PI
      this.body.add(em)
    }

    this.root.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = true
    })
  }

  setShadow(on: boolean) {
    this.root.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = on
    })
  }

  /**
   * speed: horizontal speed; vel used for cape and flight pose; state selects pose.
   */
  update(dt: number, state: AnimState, speed: number, vy = 0) {
    this.t += dt
    const t = this.t
    const L = this.legL.rotation, R = this.legR.rotation, AL = this.armL.rotation, AR = this.armR.rotation
    let legSwing = 0, armSwing = 0
    let tLx = 0, tRx = 0, tALx = 0, tARx = 0, tALz = 0.12, tARz = -0.12, bodyX = 0, headX = 0
    let innerX = 0
    const k = 14
    switch (state) {
      case 'run': {
        const f = clamp(speed / 7, 0.4, 1.6)
        legSwing = Math.sin(t * 11 * f) * 0.9 * Math.min(1, speed / 3)
        armSwing = legSwing * 0.8
        tLx = legSwing
        tRx = -legSwing
        tALx = -armSwing
        tARx = armSwing
        bodyX = 0.12
        break
      }
      case 'jump':
        tLx = -0.6
        tRx = 0.3
        tALx = -2.4
        tARx = -2.4
        tALz = 0.4
        tARz = -0.4
        break
      case 'fly': {
        // body leans with velocity; legs trail; arms back with blades
        innerX = clamp(speed / 40, 0, 1) * 0.9 - clamp(vy / 30, -0.4, 0.4)
        tLx = 0.25 + Math.sin(t * 3) * 0.08
        tRx = 0.45 + Math.sin(t * 3 + 1) * 0.08
        tALx = 0.6
        tARx = 0.6
        tALz = 0.55
        tARz = -0.55
        headX = -innerX * 0.6
        break
      }
      case 'spin':
        innerX = 1.2
        tALx = -1.57
        tARx = -1.57
        tALz = 1.4
        tARz = -1.4
        break
      case 'hurt':
        bodyX = -0.3
        tALx = -0.8
        tARx = -0.8
        headX = -0.3
        break
      case 'grabbed':
        tLx = Math.sin(t * 18) * 0.5
        tRx = -Math.sin(t * 18) * 0.5
        tALx = -2.6 + Math.sin(t * 15) * 0.3
        tARx = -2.6 - Math.sin(t * 15) * 0.3
        break
      case 'repair':
        tARx = -1.2 + Math.abs(Math.sin(t * 8)) * -0.9
        tALx = -0.4
        bodyX = 0.3
        break
      case 'cheer':
        tALx = -2.9
        tARx = -2.9 + Math.sin(t * 9) * 0.4
        break
      case 'death':
        this.deathT = Math.min(1, this.deathT + dt * 2)
        innerX = -this.deathT * 1.5
        break
      default:
        tALx = Math.sin(t * 1.6) * 0.05
        tARx = -Math.sin(t * 1.6) * 0.05
    }
    if (state !== 'death') this.deathT = 0
    // slash overrides arms: big diagonal sweep
    if (this.slashT >= 0) {
      const s = this.slashT
      const sw = Math.sin(Math.min(1, s * 1.4) * Math.PI) // 0→1→0
      const side = this.slashSide
      const raise = s < 0.35 ? s / 0.35 : 1 - (s - 0.35) / 0.65
      tARx = -2.6 * raise + 0.6 * (1 - raise)
      tALx = -2.6 * raise + 0.6 * (1 - raise)
      tARz = -0.2 - side * 1.1 * sw
      tALz = 0.2 - side * 1.1 * sw
      bodyX = 0.3 * sw
    }
    L.x = damp(L.x, tLx, k, dt)
    R.x = damp(R.x, tRx, k, dt)
    AL.x = damp(AL.x, tALx, this.slashT >= 0 ? 40 : k, dt)
    AR.x = damp(AR.x, tARx, this.slashT >= 0 ? 40 : k, dt)
    AL.z = damp(AL.z, tALz, this.slashT >= 0 ? 40 : k, dt)
    AR.z = damp(AR.z, tARz, this.slashT >= 0 ? 40 : k, dt)
    this.body.rotation.x = damp(this.body.rotation.x, bodyX, k, dt)
    this.head.rotation.x = damp(this.head.rotation.x, headX, k, dt)
    if (state === 'spin') this.inner.rotation.y += dt * 28
    else this.inner.rotation.y = damp(this.inner.rotation.y, 0, 10, dt)
    this.inner.rotation.x = damp(this.inner.rotation.x, innerX, state === 'death' ? 6 : 8, dt)
    if (this.cape) {
      const target =
        state === 'fly' || state === 'spin'
          ? 0.3 + clamp(speed / 25, 0, 1.25) + Math.sin(t * 22) * 0.08 * clamp(speed / 20, 0, 1)
          : state === 'run'
            ? 0.25 + Math.sin(t * 9) * 0.05
            : 0.05 + Math.sin(t * 2) * 0.03
      this.capeAngle = damp(this.capeAngle, target, 10, dt)
      this.cape.rotation.x = this.capeAngle
    }
  }

  /** world position of a hip gear (rope origin) */
  hipWorld(side: 'L' | 'R', out: THREE.Vector3) {
    const o = side === 'L' ? this.hipL : this.hipR
    return o.getWorldPosition(out)
  }

  dispose() {
    this.root.traverse((c) => {
      const m = c as THREE.Mesh
      if (m.isMesh) m.geometry.dispose()
    })
  }
}

export const sharedMaterials = getMaterials
