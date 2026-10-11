import * as THREE from 'three'
import { VoxelBuilder, getMaterials, makeFadeMaterials, type MatId } from './VoxelBuilder'
import type { TitanType } from '../../data/titans'
import { RNG, clamp, damp } from '../../utils/math'

/**
 * Voxel titans. Each titan type keeps the silhouette features that make it recognisable in the
 * original series while being made only from blocks:
 *  - 普通巨人: Ken-doll bodies with varied builds (fat / lanky / big-head), creepy wide grins with rows of teeth.
 *  - 奇行种: gangly limbs, staring eyes and a gaping mouth; runs hunched or on all fours.
 *  - 超大型巨人: 60 m, skinless striated red muscle with pale sinew bands, lipless full teeth, deep eye sockets.
 *  - 铠之巨人: pale hardened armour plates over red muscle, exposed joints, glowing eyes.
 *  - 女巨人: lean, blonde short hair, exposed muscle around eyes/cheeks, crystal hardening on nape and fists.
 *  - 兽之巨人: ape-like, fur covered, hunched with very long arms.
 *  - 进击的巨人: lean muscular, long dark hair, pointed ears, cheekless exposed teeth, green eyes.
 */

export type TitanPart = 'head' | 'nape' | 'body' | 'armL' | 'armR' | 'legL' | 'legR'
export interface Hitbox {
  bone: THREE.Object3D
  center: THREE.Vector3
  half: THREE.Vector3
  part: TitanPart
  armored: boolean
  /** cached world inverse */
  inv: THREE.Matrix4
  world: THREE.Matrix4
}

export type TitanPose =
  | 'idle' | 'walk' | 'run' | 'crawl' | 'smash' | 'swipe' | 'grab' | 'kick' | 'throw' | 'roar'
  | 'stunned' | 'knockdown' | 'death' | 'punch' | 'dodge' | 'harden' | 'steam' | 'charge' | 'bite' | 'bound'

interface Spec {
  skin: string
  skinMat: MatId
  shade: string
  legLen: number
  legW: number
  torsoW: number
  torsoH: number
  torsoD: number
  belly: number
  neckH: number
  neckW: number
  headW: number
  headH: number
  headD: number
  armLen: number
  armW: number
  hunch: number
}

export class TitanModel {
  root = new THREE.Group()
  inner = new THREE.Group()
  hips = new THREE.Group()
  torso = new THREE.Group()
  neck = new THREE.Group()
  head = new THREE.Group()
  jaw = new THREE.Group()
  shoulderL = new THREE.Group()
  shoulderR = new THREE.Group()
  elbowL = new THREE.Group()
  elbowR = new THREE.Group()
  thighL = new THREE.Group()
  thighR = new THREE.Group()
  kneeL = new THREE.Group()
  kneeR = new THREE.Group()
  handR = new THREE.Object3D()
  handL = new THREE.Object3D()
  mouth = new THREE.Object3D()
  hitboxes: Hitbox[] = []
  heightPx = 32
  scale = 1
  napeMarker: THREE.Mesh
  crystal: THREE.Object3D[] = []
  armorPlates: THREE.Object3D[] = []
  private spec!: Spec
  private t = Math.random() * 10
  private walkPhase = Math.random() * 6
  private meshes: THREE.Mesh[] = []
  private fadeMats: THREE.Material[] | null = null
  fallDir = 1

  constructor(public type: TitanType, public height: number, seed = 1) {
    const rng = new RNG(seed)
    this.root.add(this.inner)
    this.inner.add(this.hips)
    this.hips.add(this.torso)
    this.spec = this.makeSpec(rng)
    this.build(rng)
    this.heightPx = this.spec.legLen + this.spec.torsoH + this.spec.neckH + this.spec.headH
    this.scale = height / this.heightPx
    this.inner.scale.setScalar(this.scale)
    // nape marker (highlight when locked / marked)
    const mk = new THREE.Mesh(
      new THREE.BoxGeometry(this.spec.neckW * 0.9, this.spec.neckH + 1.6, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.0, depthTest: false }),
    )
    mk.position.set(0, this.spec.neckH / 2, -this.spec.neckW / 2 - 0.4)
    mk.renderOrder = 10
    mk.visible = false
    this.neck.add(mk)
    this.napeMarker = mk
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m !== mk) {
        m.castShadow = true
        m.receiveShadow = false
        this.meshes.push(m)
      }
    })
  }

  private makeSpec(rng: RNG): Spec {
    const skins = ['#e2ad88', '#d39a76', '#c88a66', '#e9bc98', '#b97a58', '#dca07c', '#c99474']
    const base: Spec = {
      skin: rng.pick(skins), skinMat: 'skin', shade: '#000', legLen: 12, legW: 4, torsoW: 9, torsoH: 12, torsoD: 5, belly: 0,
      neckH: 2, neckW: 4, headW: 9, headH: 9, headD: 9, armLen: 13, armW: 3.6, hunch: 0,
    }
    switch (this.type) {
      case 'normal': {
        const build = rng.pick(['avg', 'avg', 'fat', 'thin', 'bighead', 'short'] as const)
        if (build === 'fat') Object.assign(base, { torsoW: 12, torsoD: 7, belly: 3, legLen: 10, legW: 4.6, headW: 10, headH: 9, armW: 4.2, armLen: 12 })
        if (build === 'thin') Object.assign(base, { torsoW: 7.5, torsoD: 4, legLen: 15, legW: 3.2, armLen: 15, armW: 3, headW: 8, headH: 9 })
        if (build === 'bighead') Object.assign(base, { headW: 12, headH: 12, headD: 11, legLen: 10, torsoH: 10, neckH: 1.5 })
        if (build === 'short') Object.assign(base, { legLen: 8, torsoH: 10, headW: 10, headH: 10, torsoW: 10, belly: 1.5 })
        base.hunch = rng.range(0, 0.15)
        break
      }
      case 'abnormal':
        Object.assign(base, { legLen: 17, legW: 3, torsoW: 7, torsoH: 12, torsoD: 4, armLen: 19, armW: 2.8, headW: 9, headH: 10, headD: 9, neckH: 3, neckW: 3.2, hunch: 0.25 })
        base.skin = rng.pick(['#d9a684', '#c58f6c', '#e3b897', '#bf8a6a'])
        break
      case 'colossal':
        Object.assign(base, { skin: '#a3392e', skinMat: 'muscle', legLen: 15, legW: 4.4, torsoW: 10, torsoH: 13, torsoD: 5.5, armLen: 15, armW: 3.6, headW: 9, headH: 10, headD: 9, neckH: 2.5, neckW: 4.5 })
        break
      case 'armored':
        Object.assign(base, { skin: '#9c3a30', skinMat: 'muscle', legLen: 12.5, legW: 4.6, torsoW: 11, torsoH: 12, torsoD: 6, armLen: 13.5, armW: 4.2, headW: 8.5, headH: 9, headD: 8.5, neckH: 2, neckW: 5 })
        break
      case 'female':
        Object.assign(base, { skin: '#f0c8a8', legLen: 15, legW: 3.6, torsoW: 8, torsoH: 12, torsoD: 4.5, armLen: 14, armW: 3, headW: 8, headH: 8.5, headD: 8, neckH: 2.5, neckW: 3.4 })
        break
      case 'beast':
        Object.assign(base, { skin: '#b09670', skinMat: 'fur', legLen: 10, legW: 4.6, torsoW: 13, torsoH: 14, torsoD: 7, armLen: 22, armW: 4.4, headW: 9, headH: 9, headD: 9, neckH: 1.5, neckW: 5.5, hunch: 0.45 })
        break
      case 'attack':
        Object.assign(base, { skin: '#c99272', legLen: 14, legW: 4, torsoW: 9.5, torsoH: 12.5, torsoD: 5, armLen: 14, armW: 3.6, headW: 8.5, headH: 9, headD: 8.5, neckH: 2.4, neckW: 4.2 })
        break
    }
    base.shade = new THREE.Color(base.skin).multiplyScalar(0.82).getStyle()
    return base
  }

  private addHit(bone: THREE.Object3D, cx: number, cy: number, cz: number, w: number, h: number, d: number, part: TitanPart, armored = false) {
    this.hitboxes.push({ bone, center: new THREE.Vector3(cx, cy, cz), half: new THREE.Vector3(w / 2, h / 2, d / 2), part, armored, inv: new THREE.Matrix4(), world: new THREE.Matrix4() })
  }

  private build(rng: RNG) {
    const s = this.spec
    const T = this.type
    const sk = s.skin, sm = s.skinMat, sh = s.shade
    const muscle = '#a8433a', sinew = '#e5cdb8', armor = '#e3d7b8', armorDark = '#b8a888'

    // ---------- legs
    const mkLeg = (side: number, thigh: THREE.Group, knee: THREE.Group) => {
      thigh.position.set(side * (s.torsoW / 2 - s.legW / 2), s.legLen, 0)
      this.hips.add(thigh)
      const half = s.legLen / 2
      const a = new VoxelBuilder(16, 11 + side)
      a.span(-s.legW / 2, -half, -s.legW / 2, s.legW / 2, 0, s.legW / 2, sk, sm, { jitter: 0.03 })
      if (T === 'colossal') {
        a.span(-s.legW / 2 - 0.15, -half, s.legW / 2 - 1, -s.legW / 2 + 0.8, 0, s.legW / 2 + 0.15, sinew)
        a.span(s.legW / 2 - 0.8, -half + 1, -0.6, s.legW / 2 + 0.15, -1, 0.6, sinew)
      }
      if (T === 'armored') a.span(-s.legW / 2 - 0.4, -half + 1.2, -s.legW / 2 + 0.6, s.legW / 2 + 0.4, -0.8, s.legW / 2 + 0.4, armor, 'plain', { jitter: 0.04 })
      if (T === 'beast') a.span(-s.legW / 2 - 0.5, -half, -s.legW / 2 - 0.5, s.legW / 2 + 0.5, 0, s.legW / 2 + 0.5, sk, 'fur')
      thigh.add(a.mesh())
      knee.position.set(0, -half, 0)
      thigh.add(knee)
      const b = new VoxelBuilder(16, 21 + side)
      b.span(-s.legW / 2 + 0.1, -half, -s.legW / 2 + 0.1, s.legW / 2 - 0.1, 0, s.legW / 2 - 0.1, sk, sm, { jitter: 0.03 })
      b.span(-s.legW / 2, -half, -s.legW / 2, s.legW / 2, -half + 1.2, s.legW / 2 + 1.6, sh, sm) // foot
      for (let i = 0; i < 4; i++) b.span(-s.legW / 2 + i * (s.legW / 4) + 0.1, -half, s.legW / 2 + 1.6, -s.legW / 2 + (i + 1) * (s.legW / 4) - 0.15, -half + 0.7, s.legW / 2 + 2.1, sk, sm) // toes
      if (T !== 'armored' && T !== 'beast') b.span(-s.legW / 2 + 0.6, -1.4, s.legW / 2 - 0.2, s.legW / 2 - 0.6, 0.6, s.legW / 2 + 0.3, sh, sm) // kneecap
      if (T === 'armored') {
        b.span(-s.legW / 2 - 0.3, -half + 1.4, -0.2, s.legW / 2 + 0.3, -1.2, s.legW / 2 + 0.5, armor, 'plain', { jitter: 0.04 })
        b.span(-1.4, -1.2, s.legW / 2 - 0.2, 1.4, 1, s.legW / 2 + 0.8, armorDark)
      }
      if (T === 'colossal') b.span(-0.6, -half + 1, s.legW / 2 - 0.1, 0.6, -0.5, s.legW / 2 + 0.15, sinew)
      if (T === 'beast') b.span(-s.legW / 2 - 0.4, -half + 1.5, -s.legW / 2 - 0.4, s.legW / 2 + 0.4, 0, s.legW / 2 + 0.4, sk, 'fur')
      knee.add(b.mesh())
      const legPart = side > 0 ? 'legL' : 'legR'
      this.addHit(thigh, 0, -half / 2, 0, s.legW + 0.6, half, s.legW + 0.6, legPart)
      this.addHit(knee, 0, -half / 2, 0.4, s.legW + 0.6, half, s.legW + 1.6, legPart)
    }
    mkLeg(1, this.thighL, this.kneeL)
    mkLeg(-1, this.thighR, this.kneeR)

    // ---------- torso
    this.hips.position.set(0, 0, 0)
    this.torso.position.set(0, s.legLen, 0)
    this.torso.rotation.x = s.hunch
    const tb = new VoxelBuilder(16, 31)
    const W = s.torsoW / 2, D = s.torsoD / 2, H = s.torsoH
    tb.span(-W, 0, -D, W, H, D, sk, sm, { jitter: 0.02 })
    // pelvis (smooth, featureless)
    tb.span(-W + 0.3, -0.8, -D + 0.3, W - 0.3, 1.5, D + 0.1, sh, sm)
    if (s.belly > 0) tb.span(-W + 1, 1.5, D - 0.2, W - 1, H * 0.62, D + s.belly, sk, sm)
    if (T === 'normal' || T === 'abnormal' || T === 'attack' || T === 'female') {
      // pecs, navel, collarbones, ribs for definition
      tb.span(-W + 0.6, H * 0.66, D - 0.1, -0.3, H * 0.86, D + 0.5, sh, sm)
      tb.span(0.3, H * 0.66, D - 0.1, W - 0.6, H * 0.86, D + 0.5, sh, sm)
      tb.span(-0.4, H * 0.3 - 0.4, D - 0.1, 0.4, H * 0.3 + 0.4, D + (s.belly ? s.belly + 0.1 : 0.2), '#7a4a3a')
      tb.span(-W + 1, H - 0.8, D - 0.2, W - 1, H - 0.3, D + 0.3, sh, sm)
      if (T === 'attack' || T === 'female') {
        for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) tb.span(sx > 0 ? 0.25 : -2.2, H * (0.28 + r * 0.12), D, sx > 0 ? 2.2 : -0.25, H * (0.28 + r * 0.12) + H * 0.09, D + 0.35, T === 'female' ? '#c88f80' : sh, sm)
      }
      if (T === 'abnormal') for (let r = 0; r < 4; r++) tb.span(-W + 0.2, H * (0.45 + r * 0.09), D - 0.1, W - 0.2, H * (0.45 + r * 0.09) + 0.35, D + 0.2, sh, sm)
    }
    if (T === 'colossal') {
      // exposed ribcage & sinew bands
      for (let r = 0; r < 5; r++) tb.span(-W + 0.4, H * (0.4 + r * 0.1), D - 0.1, W - 0.4, H * (0.4 + r * 0.1) + 0.5, D + 0.35, sinew)
      tb.span(-0.6, H * 0.15, D - 0.1, 0.6, H * 0.95, D + 0.4, sinew)
      tb.span(-W - 0.2, H * 0.1, -1, -W + 0.6, H * 0.9, 1, sinew)
      tb.span(W - 0.6, H * 0.1, -1, W + 0.2, H * 0.9, 1, sinew)
      for (let r = 0; r < 4; r++) tb.span(-W + 1, H * (0.2 + r * 0.18), -D - 0.3, W - 1, H * (0.2 + r * 0.18) + 0.5, -D + 0.1, sinew)
    }
    if (T === 'armored') {
      // breastplates, segmented abdomen, back plate, pauldrons
      const plate = (x0: number, y0: number, x1: number, y1: number, z: number, t = 0.7) => tb.span(x0, y0, z, x1, y1, z + t, armor, 'plain', { jitter: 0.05 })
      plate(-W + 0.4, H * 0.62, -0.25, H * 0.95, D - 0.1)
      plate(0.25, H * 0.62, W - 0.4, H * 0.95, D - 0.1)
      for (let r = 0; r < 3; r++) {
        plate(-W + 1.5, H * (0.18 + r * 0.14), -0.2, H * (0.18 + r * 0.14) + H * 0.12, D - 0.1, 0.6)
        plate(0.2, H * (0.18 + r * 0.14), W - 1.5, H * (0.18 + r * 0.14) + H * 0.12, D - 0.1, 0.6)
      }
      tb.span(-W + 0.3, H * 0.2, -D - 0.7, W - 0.3, H * 0.95, -D + 0.1, armor, 'plain', { jitter: 0.05 })
      tb.span(-0.3, H * 0.2, -D - 0.9, 0.3, H * 0.95, -D - 0.5, armorDark)
      tb.span(-W - 1.2, H - 2.6, -D - 0.4, -W + 1.4, H + 0.9, D + 0.4, armor, 'plain', { jitter: 0.05 })
      tb.span(W - 1.4, H - 2.6, -D - 0.4, W + 1.2, H + 0.9, D + 0.4, armor, 'plain', { jitter: 0.05 })
    }
    if (T === 'female') {
      // exposed muscle on shoulders & sides
      tb.span(-W - 0.1, H * 0.7, -D + 0.5, -W + 1.2, H, D - 0.5, muscle)
      tb.span(W - 1.2, H * 0.7, -D + 0.5, W + 0.1, H, D - 0.5, muscle)
    }
    if (T === 'beast') {
      tb.span(-W - 0.8, H * 0.15, -D - 0.8, W + 0.8, H + 0.5, D + 0.6, sk, 'fur', { jitter: 0.05 })
      tb.span(-W + 1.5, H * 0.25, D + 0.5, W - 1.5, H * 0.85, D + 1, '#d0bc94', 'fur') // lighter chest
      tb.span(-W - 1, H - 2, -D - 1.6, W + 1, H + 2.5, D - 0.5, '#9a8260', 'fur') // hump
    }
    this.torso.add(tb.mesh())
    this.addHit(this.torso, 0, H / 2, 0, s.torsoW + 1, H, s.torsoD + 1 + s.belly, 'body', T === 'armored')

    // ---------- neck & head
    this.neck.position.set(0, H, -0.3)
    this.torso.add(this.neck)
    const nb = new VoxelBuilder(16, 41)
    nb.span(-s.neckW / 2, -0.5, -s.neckW / 2, s.neckW / 2, s.neckH + 0.5, s.neckW / 2, sk, sm)
    if (T === 'colossal') nb.span(-1.5, 0, s.neckW / 2 - 0.2, -0.8, s.neckH, s.neckW / 2 + 0.2, sinew)
    if (T === 'colossal') nb.span(0.8, 0, s.neckW / 2 - 0.2, 1.5, s.neckH, s.neckW / 2 + 0.2, sinew)
    this.neck.add(nb.mesh())
    if (T === 'armored') {
      const napeArmor = new VoxelBuilder(16, 43)
      napeArmor.span(-s.neckW / 2 - 0.4, -0.6, -s.neckW / 2 - 0.9, s.neckW / 2 + 0.4, s.neckH + 1.2, -s.neckW / 2 + 0.2, armor, 'plain', { jitter: 0.05 })
      napeArmor.span(-0.3, -0.4, -s.neckW / 2 - 1.1, 0.3, s.neckH + 1, -s.neckW / 2 - 0.8, armorDark)
      const m = napeArmor.mesh()
      this.armorPlates.push(m)
      this.neck.add(m)
    }
    if (T === 'female') {
      const cr = new VoxelBuilder(16, 44)
      cr.span(-s.neckW / 2 - 0.4, -0.6, -s.neckW / 2 - 0.8, s.neckW / 2 + 0.4, s.neckH + 1.2, -s.neckW / 2 + 0.2, '#bfefff', 'glass')
      cr.span(-1, 0, -s.neckW / 2 - 1.1, 1, s.neckH, -s.neckW / 2 - 0.6, '#e8fbff', 'glass')
      const m = cr.mesh()
      m.visible = false
      this.crystal.push(m)
      this.neck.add(m)
    }
    // nape hitbox: generous slab behind the neck, extended down to the shoulders
    this.addHit(this.neck, 0, s.neckH / 2 - 0.3, -s.neckW / 2 - 0.4, s.neckW + 2.4, s.neckH + 3.2, 3.2, 'nape', T === 'armored')

    this.head.position.set(0, s.neckH, 0.3)
    this.neck.add(this.head)
    this.buildHead(rng)
    this.addHit(this.head, 0, s.headH / 2, 0.3, s.headW + 0.6, s.headH + 0.6, s.headD + 0.6, 'head', T === 'armored')

    // ---------- arms
    const mkArm = (side: number, shoulder: THREE.Group, elbow: THREE.Group, hand: THREE.Object3D) => {
      shoulder.position.set(side * (W + s.armW / 2), H - s.armW / 2 - 0.3, 0)
      this.torso.add(shoulder)
      const half = s.armLen / 2
      const a = new VoxelBuilder(16, 51 + side)
      a.span(-s.armW / 2, -half, -s.armW / 2, s.armW / 2, s.armW / 2, s.armW / 2, sk, sm, { jitter: 0.03 })
      if (T === 'colossal') a.span(-0.5, -half, s.armW / 2 - 0.1, 0.5, s.armW / 2, s.armW / 2 + 0.2, sinew)
      if (T === 'armored') a.span(-s.armW / 2 - 0.4, -half + 1.6, -s.armW / 2 - 0.4, s.armW / 2 + 0.4, -0.5, s.armW / 2 + 0.4, armor, 'plain', { jitter: 0.04 })
      if (T === 'beast') a.span(-s.armW / 2 - 0.6, -half, -s.armW / 2 - 0.6, s.armW / 2 + 0.6, s.armW / 2 + 0.6, s.armW / 2 + 0.6, sk, 'fur')
      if (T === 'female') a.span(side * (s.armW / 2) - 0.6, -half + 1, -0.8, side * (s.armW / 2) + 0.15, 0, 0.8, muscle)
      shoulder.add(a.mesh())
      elbow.position.set(0, -half, 0)
      shoulder.add(elbow)
      const f = new VoxelBuilder(16, 61 + side)
      const fw = s.armW - 0.3
      f.span(-fw / 2, -half, -fw / 2, fw / 2, 0, fw / 2, sk, sm, { jitter: 0.03 })
      // hand with fingers
      const hw = s.armW + 0.6
      f.span(-hw / 2, -half - 2.2, -hw / 2 + 0.3, hw / 2, -half + 0.2, hw / 2 - 0.3, sk, sm)
      for (let i = 0; i < 4; i++) f.span(-hw / 2 + i * (hw / 4) + 0.1, -half - 3.6, hw / 2 - 1.4, -hw / 2 + (i + 1) * (hw / 4) - 0.1, -half - 2.1, hw / 2 - 0.3, sh, sm)
      f.span(-side * hw / 2 - side * 0.2 - 0.5, -half - 2.6, 0, -side * hw / 2 - side * 0.2 + 0.5, -half - 0.6, 1.2, sh, sm) // thumb
      if (T === 'armored') {
        f.span(-fw / 2 - 0.4, -half + 0.5, -fw / 2 - 0.4, fw / 2 + 0.4, -0.8, fw / 2 + 0.4, armor, 'plain', { jitter: 0.04 })
        f.span(-hw / 2 - 0.2, -half - 2.4, hw / 2 - 1, hw / 2 + 0.2, -half - 1, hw / 2 + 0.2, armor)
      }
      if (T === 'beast') f.span(-fw / 2 - 0.6, -half + 1, -fw / 2 - 0.6, fw / 2 + 0.6, 0, fw / 2 + 0.6, sk, 'fur')
      if (T === 'colossal') f.span(-0.5, -half, fw / 2 - 0.1, 0.5, 0, fw / 2 + 0.2, sinew)
      elbow.add(f.mesh())
      if (T === 'female') {
        const cr = new VoxelBuilder(16, 71 + side)
        cr.span(-hw / 2 - 0.4, -half - 3.8, -hw / 2, hw / 2 + 0.4, -half, hw / 2 + 0.3, '#c4f1ff', 'glass')
        const m = cr.mesh()
        m.visible = false
        this.crystal.push(m)
        elbow.add(m)
      }
      hand.position.set(0, -half - 2, 0.5)
      elbow.add(hand)
      const part = side > 0 ? 'armL' : 'armR'
      this.addHit(shoulder, 0, -half / 2, 0, s.armW + 0.6, half + s.armW / 2, s.armW + 0.6, part, false)
      this.addHit(elbow, 0, -half / 2 - 1.5, 0, s.armW + 1, half + 3, s.armW + 1, part, false)
    }
    mkArm(1, this.shoulderL, this.elbowL, this.handL)
    mkArm(-1, this.shoulderR, this.elbowR, this.handR)
    void rng
  }

  private buildHead(rng: RNG) {
    const s = this.spec
    const T = this.type
    const hb = new VoxelBuilder(16, 81)
    const w = s.headW / 2, h = s.headH, d = s.headD / 2
    const sk = s.skin, sm = s.skinMat, sh = s.shade
    const fz = d // face plane
    const jawH = h * 0.28
    // cranium (upper part); lower jaw is separate so the mouth can open
    const faceSkin = T === 'beast' ? '#c9a584' : T === 'colossal' ? '#a3392e' : sk
    const faceMat: MatId = T === 'beast' ? 'skin' : sm
    hb.span(-w, jawH, -d, w, h, d, faceSkin, faceMat, { jitter: 0.02 })
    // ears
    const earC = faceSkin
    if (T === 'attack') {
      hb.span(-w - 0.8, h * 0.45, -0.6, -w, h * 0.75, 0.6, earC, faceMat)
      hb.span(-w - 1.4, h * 0.65, -0.4, -w - 0.6, h * 0.95, 0.4, earC, faceMat) // pointed tip
      hb.span(w, h * 0.45, -0.6, w + 0.8, h * 0.75, 0.6, earC, faceMat)
      hb.span(w + 0.6, h * 0.65, -0.4, w + 1.4, h * 0.95, 0.4, earC, faceMat)
    } else if (T !== 'colossal' && T !== 'armored') {
      hb.span(-w - 0.7, h * 0.42, -0.8, -w, h * 0.68, 0.6, earC, faceMat)
      hb.span(w, h * 0.42, -0.8, w + 0.7, h * 0.68, 0.6, earC, faceMat)
    }
    // eyes
    const eyeY = h * 0.6
    const eyeW = Math.max(1.4, s.headW * 0.18)
    const eyeX = s.headW * 0.22
    const eyeColor = T === 'attack' ? '#3fe08a' : T === 'female' ? '#7fc4ff' : T === 'armored' ? '#ffcf6a' : T === 'colossal' ? '#f0e0c0' : T === 'beast' ? '#d7b46a' : '#3a2a1a'
    if (T === 'colossal') {
      // deep sockets with heavy brow
      hb.span(-w + 0.4, eyeY - 1, fz - 0.6, w - 0.4, eyeY + 1.1, fz + 0.01, '#3a0e0a')
      hb.span(-eyeX - 0.5, eyeY - 0.3, fz - 0.4, -eyeX + 0.5, eyeY + 0.5, fz + 0.05, eyeColor, 'glow')
      hb.span(eyeX - 0.5, eyeY - 0.3, fz - 0.4, eyeX + 0.5, eyeY + 0.5, fz + 0.05, eyeColor, 'glow')
      hb.span(-w, eyeY + 1.1, fz - 0.2, w, eyeY + 2, fz + 0.9, '#8f2f26', 'muscle')
      // cheek muscles & sinew lines
      hb.span(-w - 0.1, jawH, fz - 2, -w + 1.4, eyeY - 1, fz + 0.4, '#e0c8b4')
      hb.span(w - 1.4, jawH, fz - 2, w + 0.1, eyeY - 1, fz + 0.4, '#e0c8b4')
      hb.span(-0.7, eyeY - 2.4, fz - 0.1, 0.7, eyeY - 0.8, fz + 0.8, '#7a221a') // nose cavity
      // upper teeth (lipless, fully exposed)
      for (let i = 0; i < 8; i++) hb.span(-w + 1.4 + i * ((2 * w - 2.8) / 8) + 0.1, jawH - 0.1, fz - 0.4, -w + 1.4 + (i + 1) * ((2 * w - 2.8) / 8) - 0.1, jawH + 1.6, fz + 0.25, '#f2ead8')
      hb.span(-w + 1.2, jawH + 1.6, fz - 0.4, w - 1.2, jawH + 2.2, fz + 0.3, '#c86a5a') // gum
    } else if (T === 'armored') {
      // helmet-like plates
      const A = '#e3d7b8'
      hb.span(-w - 0.4, h * 0.72, -d - 0.4, w + 0.4, h + 0.5, d + 0.5, A, 'plain', { jitter: 0.05 })
      hb.span(-w - 0.4, jawH, -d - 0.3, -w + 0.9, h * 0.72, d + 0.5, A, 'plain', { jitter: 0.05 })
      hb.span(w - 0.9, jawH, -d - 0.3, w + 0.4, h * 0.72, d + 0.5, A, 'plain', { jitter: 0.05 })
      hb.span(-0.7, jawH + 1.6, fz, 0.7, h * 0.72, fz + 0.9, A) // nose ridge
      hb.span(-w + 0.9, eyeY - 0.8, fz, w - 0.9, eyeY + 0.9, fz + 0.05, '#3a1a12')
      hb.span(-eyeX - 0.7, eyeY - 0.4, fz + 0.05, -eyeX + 0.7, eyeY + 0.5, fz + 0.15, eyeColor, 'glow')
      hb.span(eyeX - 0.7, eyeY - 0.4, fz + 0.05, eyeX + 0.7, eyeY + 0.5, fz + 0.15, eyeColor, 'glow')
      for (let i = 0; i < 6; i++) hb.span(-w + 1.5 + i * ((2 * w - 3) / 6) + 0.1, jawH - 0.1, fz - 0.2, -w + 1.5 + (i + 1) * ((2 * w - 3) / 6) - 0.1, jawH + 1.2, fz + 0.3, '#f0e8d6')
      hb.span(-w - 0.3, h * 0.8, -d - 0.6, w + 0.3, h * 0.95, -d + 0.2, '#d8c79a') // short blond tuft at back
    } else {
      // whites
      const ew = T === 'abnormal' ? eyeW * 1.3 : eyeW
      const eh = T === 'abnormal' ? 1.8 : 1.2
      hb.span(-eyeX - ew / 2, eyeY - eh / 2, fz, -eyeX + ew / 2, eyeY + eh / 2, fz + 0.15, '#f4efe6')
      hb.span(eyeX - ew / 2, eyeY - eh / 2, fz, eyeX + ew / 2, eyeY + eh / 2, fz + 0.15, '#f4efe6')
      const pw = T === 'abnormal' ? 0.5 : 0.7
      const glow: MatId = T === 'attack' || T === 'female' ? 'glow' : 'plain'
      const lookOff = T === 'normal' ? rng.range(-0.3, 0.3) : 0
      hb.span(-eyeX - pw / 2 + lookOff, eyeY - 0.4, fz + 0.1, -eyeX + pw / 2 + lookOff, eyeY + 0.4, fz + 0.25, eyeColor, glow)
      hb.span(eyeX - pw / 2 + lookOff, eyeY - 0.4, fz + 0.1, eyeX + pw / 2 + lookOff, eyeY + 0.4, fz + 0.25, eyeColor, glow)
      // brows
      const browC = T === 'female' ? '#d9b866' : T === 'attack' ? '#2c1a10' : sh
      const angry = T === 'attack' || T === 'female' ? 0.35 : 0
      hb.span(-eyeX - ew / 2 - 0.2, eyeY + eh / 2 + 0.2 - angry, fz, -eyeX + ew / 2 + 0.2, eyeY + eh / 2 + 0.8 - angry, fz + 0.4, browC)
      hb.span(eyeX - ew / 2 - 0.2, eyeY + eh / 2 + 0.2 - angry, fz, eyeX + ew / 2 + 0.2, eyeY + eh / 2 + 0.8 - angry, fz + 0.4, browC)
      // nose
      hb.span(-0.6, eyeY - 2.2, fz, 0.6, eyeY - 0.4, fz + 1, sh, faceMat)
      if (T === 'normal') {
        // signature wide creepy grin: corners turned up, full row of teeth
        const mw = w * rng.range(0.6, 0.9)
        hb.span(-mw, jawH - 0.1, fz - 0.05, mw, jawH + 1.2, fz + 0.12, '#3a1210')
        for (let i = 0; i < 8; i++) hb.span(-mw + 0.2 + i * ((2 * mw - 0.4) / 8) + 0.06, jawH + 0.3, fz + 0.05, -mw + 0.2 + (i + 1) * ((2 * mw - 0.4) / 8) - 0.06, jawH + 1.1, fz + 0.2, '#f6efe0')
        hb.span(-mw - 0.8, jawH + 0.8, fz, -mw + 0.2, jawH + 1.6, fz + 0.18, '#7a3a30') // up-turned corners
        hb.span(mw - 0.2, jawH + 0.8, fz, mw + 0.8, jawH + 1.6, fz + 0.18, '#7a3a30')
        hb.span(-mw, jawH + 1.2, fz, mw, jawH + 1.6, fz + 0.2, '#b06a5a') // upper lip
      } else if (T === 'abnormal') {
        // gaping O-mouth
        hb.span(-1.4, jawH - 0.1, fz - 0.4, 1.4, jawH + 1.8, fz + 0.1, '#2a0c0a')
        hb.span(-1.6, jawH + 1.8, fz, 1.6, jawH + 2.2, fz + 0.2, '#a05a4a')
      } else if (T === 'attack') {
        // lipless sides: teeth exposed from cheek to cheek
        hb.span(-w + 0.3, jawH - 0.1, fz - 1.6, w - 0.3, jawH + 1.5, fz + 0.1, '#3a1210')
        for (let i = 0; i < 10; i++) hb.span(-w + 0.4 + i * ((2 * w - 0.8) / 10) + 0.05, jawH, fz - 0.1, -w + 0.4 + (i + 1) * ((2 * w - 0.8) / 10) - 0.05, jawH + 1.3, fz + 0.18, '#f1eadb')
        hb.span(-w - 0.1, jawH, fz - 2.6, -w + 0.5, jawH + 1.4, fz - 0.4, '#a4473c')
        hb.span(w - 0.5, jawH, fz - 2.6, w + 0.1, jawH + 1.4, fz - 0.4, '#a4473c')
      } else if (T === 'female') {
        hb.span(-1.6, jawH + 0.2, fz, 1.6, jawH + 0.7, fz + 0.12, '#9a5a4a')
        // exposed muscle around eyes & cheek lines
        hb.span(-w - 0.05, eyeY - 2.2, fz - 2, -eyeX - ew / 2 - 0.1, eyeY + 1.2, fz + 0.1, '#b5463c')
        hb.span(eyeX + ew / 2 + 0.1, eyeY - 2.2, fz - 2, w + 0.05, eyeY + 1.2, fz + 0.1, '#b5463c')
        hb.span(-eyeX - ew / 2, eyeY - 1.1, fz, -eyeX + ew / 2, eyeY - 0.6, fz + 0.12, '#b5463c')
        hb.span(eyeX - ew / 2, eyeY - 1.1, fz, eyeX + ew / 2, eyeY - 0.6, fz + 0.12, '#b5463c')
      } else if (T === 'beast') {
        hb.span(-1.6, jawH + 0.2, fz, 1.6, jawH + 0.8, fz + 0.12, '#5a3a2a')
      }
    }
    // hair
    const hairOf = (c: string, style: string) => {
      const H = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => hb.span(x0, y0, z0, x1, y1, z1, c, 'plain', { jitter: 0.06 })
      if (style === 'short') { H(-w - 0.3, h - 1.6, -d - 0.3, w + 0.3, h + 0.6, d + 0.3); H(-w - 0.3, h * 0.5, -d - 0.3, w + 0.3, h, -d + 1) }
      if (style === 'messy') { H(-w - 0.4, h - 1.8, -d - 0.4, w + 0.4, h + 1, d + 0.2); for (let i = 0; i < 5; i++) H(-w + i * (w / 2.5), h - 3 - (i % 2), d - 0.4, -w + i * (w / 2.5) + 1.4, h - 1, d + 0.4) }
      if (style === 'long') { H(-w - 0.4, h - 1.6, -d - 0.4, w + 0.4, h + 0.6, d + 0.4); H(-w - 0.5, jawH - 2, -d - 0.6, w + 0.5, h, -d + 1.2); H(-w - 0.5, jawH - 1, -d, -w + 0.4, h, d - 2); H(w - 0.4, jawH - 1, -d, w + 0.5, h, d - 2) }
      if (style === 'side') { H(-w - 0.3, h - 1.4, -d - 0.3, w + 0.3, h + 0.5, d + 0.3); H(-w - 0.4, h * 0.5, -d, -w + 0.4, h, d); H(w - 0.4, h * 0.5, -d, w + 0.4, h, d) }
      if (style === 'bob') { H(-w - 0.4, h - 1.5, -d - 0.4, w + 0.4, h + 0.6, d + 0.4); H(-w - 0.5, jawH, -d - 0.5, w + 0.5, h, -d + 1.5); H(-w - 0.5, jawH, -d, -w + 0.5, h, d - 0.5); H(w - 0.5, jawH, -d, w + 0.5, h, d - 0.5); H(-w, h - 2.2, d - 0.3, w * 0.4, h - 0.8, d + 0.45) }
    }
    if (T === 'normal') {
      const style = rng.pick(['none', 'short', 'short', 'messy', 'long', 'side', 'none'])
      if (style !== 'none') hairOf(rng.pick(['#2a1a10', '#4a2e1a', '#6a4a2a', '#1a1410', '#8a6a3a', '#b89a5a', '#5a5a5a']), style)
    }
    if (T === 'abnormal') hairOf(rng.pick(['#3a2a1a', '#6a4a2a', '#1a1410']), rng.pick(['long', 'messy']))
    if (T === 'female') hairOf('#e9cf7f', 'bob')
    if (T === 'attack') {
      hairOf('#2c1a10', 'long')
      hb.span(-w - 0.4, h - 3, d - 0.3, -0.5, h - 0.6, d + 0.5, '#2c1a10')
      hb.span(0.5, h - 3.4, d - 0.3, w + 0.4, h - 0.6, d + 0.5, '#2c1a10')
    }
    if (T === 'beast') {
      // fur mane framing the face, beard
      hb.span(-w - 1.2, jawH - 2, -d - 1.2, w + 1.2, h + 1.2, -d + 2, '#9a8260', 'fur')
      hb.span(-w - 1.2, jawH - 2, -d, -w + 0.3, h + 1, d - 0.3, '#9a8260', 'fur')
      hb.span(w - 0.3, jawH - 2, -d, w + 1.2, h + 1, d - 0.3, '#9a8260', 'fur')
      hb.span(-w - 0.4, h - 1, -d, w + 0.4, h + 1.2, d + 0.3, '#9a8260', 'fur')
      hb.span(-w + 0.4, jawH - 2.4, fz - 1, w - 0.4, jawH + 0.2, fz + 0.4, '#8a7458', 'fur')
    }
    this.head.add(hb.mesh())

    // lower jaw (opens for bites / roars)
    this.jaw.position.set(0, jawH, -d + 0.5)
    this.head.add(this.jaw)
    const jb = new VoxelBuilder(16, 91)
    const jz0 = 0, jz1 = 2 * d - 0.5
    jb.span(-w + 0.3, -jawH, jz0 - 0.5, w - 0.3, 0.05, jz1, faceSkin, faceMat)
    if (T === 'normal' || T === 'attack' || T === 'colossal' || T === 'armored') {
      const mw = T === 'normal' ? w * 0.75 : w - 1.2
      for (let i = 0; i < 8; i++) jb.span(-mw + i * ((2 * mw) / 8) + 0.08, -0.6, jz1 - 0.5, -mw + (i + 1) * ((2 * mw) / 8) - 0.08, 0.15, jz1 + 0.12, '#efe6d2')
    }
    if (T === 'colossal') jb.span(-w + 0.3, -jawH, jz1 - 0.6, -w + 1.4, 0, jz1 + 0.3, '#e0c8b4')
    if (T === 'beast') jb.span(-w, -jawH - 1, jz0, w, 0, jz1 + 0.3, '#8a7458', 'fur')
    if (T === 'armored') jb.span(-w - 0.3, -jawH - 0.2, jz0, w + 0.3, -jawH * 0.4, jz1 + 0.4, '#e3d7b8', 'plain', { jitter: 0.05 })
    this.jaw.add(jb.mesh())
    this.mouth.position.set(0, jawH * 0.6, d + 0.5)
    this.head.add(this.mouth)
  }

  setCrystal(on: boolean) {
    this.crystal.forEach((c) => (c.visible = on))
  }
  setNapeArmor(on: boolean) {
    this.armorPlates.forEach((c) => (c.visible = on))
  }

  setMarker(alpha: number) {
    const m = this.napeMarker.material as THREE.MeshBasicMaterial
    m.opacity = alpha
    this.napeMarker.visible = alpha > 0.01
  }

  setShadows(on: boolean) {
    for (const m of this.meshes) m.castShadow = on
  }

  /** begin fade (steam dissipation) */
  setFade(alpha: number) {
    if (!this.fadeMats) {
      this.fadeMats = makeFadeMaterials()
      for (const m of this.meshes) m.material = this.fadeMats
    }
    for (const m of this.fadeMats) {
      m.opacity = alpha
      ;(m as THREE.MeshLambertMaterial).color?.setRGB(0.6 + alpha * 0.4, 0.45 + alpha * 0.55, 0.42 + alpha * 0.58)
    }
  }

  /** world-space nape centre */
  napeWorld(out: THREE.Vector3) {
    const hb = this.hitboxes.find((h) => h.part === 'nape')!
    return out.copy(hb.center).applyMatrix4(hb.bone.matrixWorld)
  }

  updateHitboxes() {
    for (const h of this.hitboxes) {
      h.world.copy(h.bone.matrixWorld)
      h.inv.copy(h.world).invert()
    }
  }

  /**
   * Procedural animation. `p` (0..1) is the action progress for one-shot poses.
   */
  animate(dt: number, pose: TitanPose, speed: number, p = 0) {
    this.t += dt
    const t = this.t
    const s = this.spec
    const k = pose === 'dodge' || pose === 'punch' || pose === 'kick' ? 18 : 8
    const strideHz = speed / Math.max(2, this.height * 0.45)
    if (pose === 'walk' || pose === 'run' || pose === 'charge' || pose === 'crawl') this.walkPhase += dt * Math.PI * 2 * Math.max(0.25, strideHz)
    const ph = this.walkPhase
    let thL = 0, thR = 0, knL = 0, knR = 0, shLx = 0, shRx = 0, shLz = 0.08, shRz = -0.08, elL = -0.15, elR = -0.15
    let torsoX = s.hunch, torsoY = 0, torsoZ = 0, headX = 0, headY = 0, jaw = 0, innerX = 0, innerZ = 0, bob = 0
    const big = pose === 'run' || pose === 'charge' ? 1.35 : 1
    switch (pose) {
      case 'walk':
      case 'run':
      case 'charge': {
        const a = 0.45 * big
        thL = Math.sin(ph) * a
        thR = -Math.sin(ph) * a
        knL = Math.max(0, -Math.cos(ph)) * 0.7 * big
        knR = Math.max(0, Math.cos(ph)) * 0.7 * big
        shLx = -Math.sin(ph) * 0.4 * big
        shRx = Math.sin(ph) * 0.4 * big
        bob = Math.abs(Math.cos(ph)) * 0.6
        torsoZ = Math.sin(ph) * 0.05
        torsoX = s.hunch + (pose === 'run' ? 0.35 : pose === 'charge' ? 0.55 : 0.05)
        if (this.type === 'normal') headY = Math.sin(t * 0.7) * 0.25
        if (this.type === 'abnormal') { headX = Math.sin(t * 7) * 0.15; shLz = 0.5; shRz = -0.5 }
        if (pose === 'charge') { shLx = 0.9; shRx = 0.9; elL = -0.6; elR = -0.6; headX = 0.5 }
        jaw = this.type === 'normal' ? 0.05 + Math.max(0, Math.sin(t * 1.3)) * 0.12 : this.type === 'abnormal' ? 0.4 : 0
        break
      }
      case 'crawl': {
        innerX = 1.1
        thL = Math.sin(ph) * 0.5 - 0.9
        thR = -Math.sin(ph) * 0.5 - 0.9
        knL = 1.2
        knR = 1.2
        shLx = -1.2 + Math.sin(ph + 1.5) * 0.6
        shRx = -1.2 - Math.sin(ph + 1.5) * 0.6
        headX = -0.9
        jaw = 0.5
        bob = 0.3
        break
      }
      case 'smash': {
        // raise both arms then slam
        const up = p < 0.55 ? p / 0.55 : 1 - (p - 0.55) / 0.45
        shLx = -2.9 * up - 0.5 * (1 - up) * (p > 0.55 ? 1 : 0)
        shRx = shLx
        elL = -0.3
        elR = -0.3
        torsoX = s.hunch + (p > 0.55 ? 0.55 : -0.15 * up)
        jaw = 0.25
        break
      }
      case 'swipe': {
        const q = Math.sin(p * Math.PI)
        shRx = -1.5
        shRz = -0.2 - 1.3 * (p < 0.4 ? p / 0.4 : 1) + 2.2 * Math.max(0, (p - 0.4) / 0.6)
        torsoY = -0.6 * q + (p > 0.4 ? 1 : 0) * 0.8 * q
        elR = -0.2
        break
      }
      case 'grab': {
        // reach then pull to mouth
        const reach = p < 0.45 ? p / 0.45 : 1
        const pull = p > 0.55 ? (p - 0.55) / 0.45 : 0
        shRx = -1.6 * reach + 0.2 * pull
        elR = -0.2 - 1.6 * pull
        shRz = -0.2 + 0.4 * pull
        torsoX = s.hunch + 0.45 * reach - 0.3 * pull
        jaw = 0.15 + 0.55 * pull
        headX = -0.2 * pull
        break
      }
      case 'bite':
        jaw = 0.6 * Math.abs(Math.sin(p * Math.PI * 2))
        shRx = -2.2
        elR = -1.8
        shLx = -2.0
        elL = -1.7
        break
      case 'kick': {
        const q = Math.sin(p * Math.PI)
        thR = -1.6 * q
        knR = 0.6 * (1 - q)
        shLx = 0.6 * q
        shRx = -0.6 * q
        torsoX = -0.2 * q
        break
      }
      case 'punch': {
        const q = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7
        shRx = -1.65 * q - 0.2
        elR = -1.4 * (1 - q)
        torsoY = 0.6 * q
        shLx = -0.6
        elL = -1.6
        thL = -0.3
        thR = 0.3
        jaw = 0.4
        break
      }
      case 'throw': {
        // beast: wind-up back then overhand throw
        const wind = p < 0.5 ? p / 0.5 : 1
        const rel = p > 0.5 ? (p - 0.5) / 0.5 : 0
        shRx = p < 0.5 ? 1.2 * wind : 1.2 - 3.9 * Math.min(1, rel * 1.8)
        elR = -0.4
        torsoY = p < 0.5 ? -0.5 * wind : -0.5 + 1.0 * rel
        torsoX = s.hunch + (p > 0.5 ? 0.3 * rel : -0.1)
        shLx = -0.6
        break
      }
      case 'roar':
        headX = -0.45
        jaw = 0.85
        shLz = 0.9
        shRz = -0.9
        shLx = -0.4
        shRx = -0.4
        elL = -1.2
        elR = -1.2
        torsoX = s.hunch - 0.15
        break
      case 'stunned':
        headX = 0.4 + Math.sin(t * 5) * 0.2
        headY = Math.sin(t * 3) * 0.4
        shLx = 0.2
        shRx = 0.2
        elL = -0.1
        elR = -0.1
        torsoX = s.hunch + 0.25
        jaw = 0.3
        break
      case 'knockdown':
        innerX = 1.5
        thL = -0.2
        thR = 0.1
        shLx = -2.6
        shRx = -2.4
        shLz = 0.5
        shRz = -0.5
        headX = -0.6
        jaw = 0.4
        break
      case 'death': {
        const f = clamp(p * 1.6, 0, 1)
        innerX = 1.45 * f * this.fallDir
        innerZ = 0.25 * f
        thL = -0.4 * f
        knL = 0.8 * f
        shLx = -0.6 * f
        shRx = -1.4 * f
        headX = 0.5 * f
        jaw = 0.5
        break
      }
      case 'dodge':
        torsoZ = Math.sin(p * Math.PI) * 0.5
        thL = -0.6
        thR = 0.6
        knL = 0.8
        break
      case 'harden':
        shLx = -1.2
        shRx = -1.2
        elL = -2.2
        elR = -2.2
        shLz = -0.5
        shRz = 0.5
        headX = 0.5
        torsoX = s.hunch + 0.3
        break
      case 'steam':
        shLz = 0.5
        shRz = -0.5
        headX = -0.3
        jaw = 0.4
        torsoX = -0.1
        break
      case 'bound':
        // pinned by traps: struggling
        shLx = -0.8 + Math.sin(t * 6) * 0.3
        shRx = -0.8 - Math.sin(t * 6) * 0.3
        headX = Math.sin(t * 4) * 0.3
        jaw = 0.4 + Math.sin(t * 8) * 0.2
        thL = 0.1
        thR = -0.1
        break
      default: {
        // idle breathing & head turning (normal titans' uncanny stare)
        shLx = Math.sin(t * 0.9) * 0.05
        shRx = -Math.sin(t * 0.9) * 0.05
        headY = Math.sin(t * 0.4) * 0.5
        headX = Math.sin(t * 0.6) * 0.1
        jaw = this.type === 'normal' ? 0.08 : 0
        bob = Math.sin(t * 1.5) * 0.15
      }
    }
    if (this.type === 'beast' && (pose === 'walk' || pose === 'idle')) {
      // long arms hang near the ground
      shLx += 0.15
      shRx += 0.15
    }
    const dm = (a: number, b: number) => damp(a, b, k, dt)
    this.thighL.rotation.x = dm(this.thighL.rotation.x, thL)
    this.thighR.rotation.x = dm(this.thighR.rotation.x, thR)
    this.kneeL.rotation.x = dm(this.kneeL.rotation.x, knL)
    this.kneeR.rotation.x = dm(this.kneeR.rotation.x, knR)
    this.shoulderL.rotation.x = dm(this.shoulderL.rotation.x, shLx)
    this.shoulderR.rotation.x = dm(this.shoulderR.rotation.x, shRx)
    this.shoulderL.rotation.z = dm(this.shoulderL.rotation.z, shLz)
    this.shoulderR.rotation.z = dm(this.shoulderR.rotation.z, shRz)
    this.elbowL.rotation.x = dm(this.elbowL.rotation.x, elL)
    this.elbowR.rotation.x = dm(this.elbowR.rotation.x, elR)
    this.torso.rotation.x = dm(this.torso.rotation.x, torsoX)
    this.torso.rotation.y = dm(this.torso.rotation.y, torsoY)
    this.torso.rotation.z = dm(this.torso.rotation.z, torsoZ)
    this.head.rotation.x = dm(this.head.rotation.x, headX)
    this.head.rotation.y = dm(this.head.rotation.y, headY)
    this.jaw.rotation.x = dm(this.jaw.rotation.x, jaw)
    this.inner.rotation.x = damp(this.inner.rotation.x, innerX, pose === 'death' || pose === 'knockdown' ? 3 : 6, dt)
    this.inner.rotation.z = damp(this.inner.rotation.z, innerZ, 3, dt)
    // when lying down, lower the body so it rests on the ground
    const lying = Math.abs(this.inner.rotation.x)
    const lieDrop = Math.sin(Math.min(lying, 1.57)) * (s.legLen * 0.75)
    this.hips.position.y = damp(this.hips.position.y, bob - lieDrop * 0.2, 10, dt)
    this.inner.position.y = -Math.sin(Math.min(lying, 1.57)) * this.scale * (s.legLen * 0.15)
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose()
    this.fadeMats?.forEach((m) => m.dispose())
    this.napeMarker.geometry.dispose()
    ;(this.napeMarker.material as THREE.Material).dispose()
  }
}

export const titanMaterials = getMaterials
