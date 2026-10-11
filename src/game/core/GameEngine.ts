import * as THREE from 'three'
import { GameLoop } from './GameLoop'
import { InputManager } from './InputManager'
import { CollisionWorld } from './Collision'
import { CameraController } from './CameraController'
import { Particles } from './Particles'
import { Effects } from './Effects'
import { audio } from './Audio'
import { Environment } from '../world/Environment'
import { WallSystem, type WallSegment } from '../world/WallSystem'
import { CityManager, type Building } from '../world/CityManager'
import { DestructionSystem } from '../world/DestructionSystem'
import { TitanManager, type Titan } from '../titans/TitanManager'
import { PlayerController } from '../characters/PlayerController'
import { CombatSystem } from '../characters/CombatSystem'
import { Skills } from '../characters/Skills'
import { NPCManager } from '../npc/NPCManager'
import { DefenseManager, type Facility } from '../defense/DefenseManager'
import { Projectiles } from '../defense/Projectiles'
import { WaveManager } from '../defense/WaveManager'
import { ResourceManager } from '../defense/ResourceManager'
import { getMap, MODES, type GameMode, type MapDef } from '../../data/maps'
import { getCharacter, type CharacterDef } from '../../data/characters'
import type { TitanType } from '../../data/titans'
import type { DamageSource } from '../titans/TitanWeakpoints'
import type { Settings, Quality } from '../../stores/settings'
import type { Profile, RunSave } from '../../stores/profile'
import type { useGame, GameResult } from '../../stores/game'
import { clamp } from '../../utils/math'

type GameStore = ReturnType<typeof useGame>

export interface EngineOptions {
  container: HTMLElement
  overlay: HTMLElement
  speedCanvas: HTMLCanvasElement
  mapId: string
  mode: GameMode
  charId: string
  settings: Settings & { mobile: boolean }
  profile: Profile
  store: GameStore
  resume: RunSave | null
  onProfileKill: (t: TitanType) => void
  onSaveRun: (s: RunSave | null) => void
  onResult: (r: GameResult) => void
  onToggleHud?: () => void
}

const TUTORIAL = [
  { key: 'move', text: '教学：WASD 移动，空格跳跃。从城墙上跳下吧！' },
  { key: 'hook', text: '教学：右键 / Q 向准星发射钩索（准星变绿表示可附着），按住收卷' },
  { key: 'boost', text: '教学：空中按住 Shift 喷射瓦斯加速，按 E 收回钩索' },
  { key: 'slash', text: '教学：绕到巨人身后，左键斩击后颈（橙色标记）。T 锁定目标' },
  { key: 'kill', text: '教学：斩杀巨人！后颈命中即可一击必杀' },
  { key: 'supply', text: '教学：瓦斯 / 刀刃不足时，在补给站（⛽）附近按 F 补给' },
]

export class GameEngine {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  camCtl: CameraController
  loop: GameLoop
  input = new InputManager()
  collision = new CollisionWorld()
  particles!: Particles
  effects!: Effects
  audio = audio
  env!: Environment
  walls!: WallSystem
  city!: CityManager
  destruction!: DestructionSystem
  titans!: TitanManager
  player!: PlayerController
  combat!: CombatSystem
  skills!: Skills
  npcs!: NPCManager
  defense!: DefenseManager
  projectiles!: Projectiles
  waves!: WaveManager
  resources = new ResourceManager()
  map: MapDef
  modeDef: (typeof MODES)[number]
  char: CharacterDef
  quality: Quality
  settings: Settings & { mobile: boolean }
  time = 0
  paused = false
  over = false
  private store: GameStore
  private hudAcc = 0
  private fpsAcc = 0
  private fpsLow = 0
  private fpsHigh = 0
  private pixelRatio = 1
  private basePR = 1
  private ray = { o: new THREE.Vector3(), d: new THREE.Vector3() }
  private resizeObs: ResizeObserver
  private tutorialStep = -1
  private moved = 0
  private flashT = 0
  private disposed = false
  private bossAlarm = false
  ready = false

  constructor(private opts: EngineOptions) {
    this.store = opts.store
    this.map = getMap(opts.mapId)
    this.modeDef = MODES.find((m) => m.id === opts.mode) ?? MODES[1]
    this.char = getCharacter(opts.charId)
    this.settings = opts.settings
    this.quality = opts.settings.quality
    const lowEnd = this.quality === 'low'
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowEnd && !opts.settings.mobile, powerPreference: 'high-performance' })
    this.basePR = Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1) * (lowEnd ? 0.8 : 1)
    this.pixelRatio = this.basePR
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.shadowMap.enabled = opts.settings.shadows && !lowEnd
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    opts.container.appendChild(this.renderer.domElement)
    this.camera = new THREE.PerspectiveCamera(opts.settings.fov, 1, 0.1, 3500)
    this.camCtl = new CameraController(this.camera, this.collision)
    this.camCtl.fovBase = opts.settings.fov
    this.camCtl.sensitivity = opts.settings.sensitivity
    this.camCtl.invertY = opts.settings.invertY
    this.camCtl.shakeEnabled = opts.settings.cameraShake
    this.loop = new GameLoop((dt, real) => this.frame(dt, real))
    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(opts.container)
  }

  /** build world asynchronously with progress callbacks so the loading screen can update */
  async init(progress: (t: string, p: number) => void) {
    const o = this.opts
    const step = async (t: string, p: number) => {
      progress(t, p)
      await new Promise((r) => setTimeout(r, 16))
    }
    await step('生成天空与地形…', 0.05)
    this.env = new Environment(this.scene, this.map, this.quality, o.settings.shadows)
    this.particles = new Particles(this.scene, this.quality)
    this.effects = new Effects(this.scene)
    this.effects.textLayer = o.overlay
    this.effects.speedCanvas = o.speedCanvas
    await step('建造城墙…', 0.2)
    this.walls = new WallSystem(this.map, this.scene, this.collision)
    await step('生成城市街区与建筑…', 0.4)
    this.city = new CityManager(this.map, this.scene, this.collision, this.walls)
    this.destruction = new DestructionSystem(this)
    await step('召集调查兵团…', 0.6)
    this.titans = new TitanManager(this)
    this.player = new PlayerController(this, this.char, o.profile)
    this.combat = new CombatSystem(this)
    this.skills = new Skills(this)
    this.projectiles = new Projectiles(this)
    this.defense = new DefenseManager(this)
    this.npcs = new NPCManager(this)
    this.waves = new WaveManager(this)
    await step('部署驻屯兵团火炮…', 0.75)
    const wallSlots = this.city.slots.filter((s) => s.kind === 'wall')
    for (let i = 0; i < Math.min(this.map.freeCannons, wallSlots.length); i++) this.defense.build(wallSlots[i], 'cannon', true)
    this.npcs.populate()
    this.player.spawn(this.city.playerStart, this.city.playerStartYaw)
    if (o.resume) {
      await step('读取存档…', 0.85)
      this.restore(o.resume)
    } else this.waves.startIntro(25)
    await step('预编译着色器…', 0.92)
    this.resize()
    this.camCtl.update(0.016, this.player.pos.clone().setY(this.player.pos.y + 1.6), new THREE.Vector3())
    this.renderer.compile(this.scene, this.camera)
    this.input.attach(this.renderer.domElement)
    this.input.onPointerLockChange = (locked) => {
      if (!locked && !this.paused && !this.over && !this.store.shopOpen && !this.store.mapOpen && !this.settings.mobile) this.setPaused(true)
    }
    audio.init()
    audio.setVolumes(o.settings.master, o.settings.music, o.settings.sfx)
    audio.playMusic('intermission')
    await step('出发！', 1)
    this.ready = true
    this.store.hud.mapName = this.map.name
    this.loop.start()
  }

  // ------------------------------------------------------------------ helpers used by systems
  banner(text: string, kind: 'info' | 'warn' | 'danger' | 'good' | 'kill' = 'info') {
    this.store.banner(text, kind)
  }
  shake(pos: THREE.Vector3, amount: number) {
    const d = pos.distanceTo(this.camera.position)
    const k = clamp(1 - d / 160, 0, 1)
    if (k > 0) this.camCtl.addTrauma(amount * k)
  }
  aimRay() {
    return this.camCtl.aimRay(this.ray)
  }
  hudFlash(a = 1) {
    this.flashT = Math.max(this.flashT, a)
  }
  flashScreen() {
    this.store.hud.damageFlash = -1
    setTimeout(() => {
      if (this.store.hud.damageFlash === -1) this.store.hud.damageFlash = 0
    }, 200)
  }
  profileKill(t: TitanType) {
    this.opts.onProfileKill(t)
  }
  supplyNear(p: THREE.Vector3): Building | Facility | 'fire' | null {
    let fire = false
    for (const b of this.city.supplyDepots) {
      if (b.state === 2) continue
      if (Math.hypot(b.x - p.x, b.z - p.z) < 11 && p.y < 12) {
        if (b.burning > 0) fire = true
        else return b
      }
    }
    for (const f of this.defense.supplies()) if (f.pos.distanceTo(p) < f.range) return f
    return fire ? 'fire' : null
  }
  closeShop() {
    this.store.shopOpen = false
  }

  onTitanKilled(t: Titan, src: DamageSource) {
    this.combat.onKilled(t, src)
    if (src === 'player' || src === 'skill' || src === 'eren') this.tutorialEvent('kill')
  }
  onBreach(seg: WallSegment) {
    // titans outside re-plan towards the fresh opening
    for (const t of this.titans.list) {
      if (!t.alive || t.inside) continue
      if ((t.state === 'march' || t.state === 'attackWall') && t.pos.distanceTo(seg.outside) < (t.entry ? t.pos.distanceTo(t.entry.outside) * 1.4 : 9999)) {
        if (t.entry) t.entry.attackers = Math.max(0, t.entry.attackers - 1)
        t.entry = seg
        t.setState('march')
      }
    }
    audio.playMusic('breach')
    setTimeout(() => {
      if (!this.disposed && this.waves.phase === 'combat') audio.playMusic(this.titans.boss ? 'boss' : 'battle')
    }, 20000)
  }
  onRepairedBreach(_seg: WallSegment) {}
  onBuildingCollapsed(b: Building) {
    if (b.kind === 'hq') this.npcs.maxSurvey = Math.max(4, this.npcs.maxSurvey - 4)
  }
  onCoreDestroyed() {
    this.endGame(false, `${this.map.coreName}被摧毁，城市陷落…`)
  }
  onIntermission() {
    this.saveRun()
    this.banner('波次间隙：按 B 打开防御建设，按 N 立即开始下一波', 'info')
  }

  // ------------------------------------------------------------------ tutorial
  startTutorial() {
    this.tutorialStep = 0
  }
  endTutorial() {
    this.tutorialStep = -1
  }
  tutorialEvent(key: string) {
    if (this.tutorialStep < 0 || this.tutorialStep >= TUTORIAL.length) return
    if (TUTORIAL[this.tutorialStep].key === key) {
      this.tutorialStep++
      audio.play('uiClick', { pitch: 1.4 })
      if (this.tutorialStep >= TUTORIAL.length) {
        this.banner('教学完成！守住城市！', 'good')
        this.tutorialStep = -1
      }
    }
  }

  // ------------------------------------------------------------------ shop actions
  repairCost(kind: 'walls' | 'gate' | 'city') {
    if (kind === 'walls') {
      let miss = 0
      for (const s of this.walls.breakable) if (!s.gate) miss += s.maxHp - s.hp
      return { funds: Math.round(miss * 0.05), materials: Math.round(miss * 0.12) }
    }
    if (kind === 'gate') {
      const g = this.walls.gate
      const miss = g.maxHp - g.hp
      return { funds: Math.round(miss * 0.1), materials: Math.round(miss * 0.2) }
    }
    let miss = 0
    for (const b of this.city.buildings) miss += b.maxHp - b.hp
    return { funds: Math.round(miss * 0.06), materials: Math.round(miss * 0.14) }
  }
  repair(kind: 'walls' | 'gate' | 'city') {
    const c = this.repairCost(kind)
    if (c.materials <= 0 || !this.resources.spend(c)) return false
    if (kind === 'walls') for (const s of this.walls.breakable) this.destruction.repairSegment(s, 1e6)
    else if (kind === 'gate') this.destruction.repairGate(1e6)
    else for (const b of this.city.buildings) if (b.kind !== 'core') this.destruction.repairBuilding(b, 1e6)
    audio.play('build', {})
    this.banner(kind === 'walls' ? '城墙修复完成' : kind === 'gate' ? '城门修复完成' : '城市建筑修复完成', 'good')
    return true
  }

  // ------------------------------------------------------------------ frame
  private frame(dt: number, real: number) {
    if (this.disposed) return
    const inp = this.input
    // global UI keys (work even while paused)
    if (inp.pressed('pause')) {
      if (this.store.shopOpen) this.store.shopOpen = false
      else if (this.store.mapOpen) this.store.mapOpen = false
      else if (!this.over) this.setPaused(!this.paused)
    }
    if (this.paused || this.over) {
      inp.endFrame()
      this.render()
      return
    }
    if (inp.pressed('map')) this.store.mapOpen = !this.store.mapOpen
    if (inp.pressed('hud')) this.opts.onToggleHud?.()
    if (inp.pressed('shop')) this.toggleShop()
    if (inp.pressed('nextWave')) this.waves.skip()
    if (inp.pressed('rally')) this.npcs.setOrder('rally')
    if (inp.pressed('attackOrder')) this.npcs.setOrder('attack')
    if (inp.pressed('defendOrder')) this.npcs.setOrder('defend')
    if (inp.pressed('skill1')) this.skills.use(0)
    if (inp.pressed('skill2')) this.skills.use(1)
    if (inp.pressed('skill3')) this.skills.use(2)
    // camera look
    if (inp.mouseDX || inp.mouseDY) this.camCtl.look(inp.mouseDX, inp.mouseDY)
    if (inp.wheel) this.camCtl.dist = clamp(this.camCtl.dist + inp.wheel * 0.8, 3, 14)

    this.time += dt
    this.effects.beginRopes()
    this.player.update(dt)
    if (this.tutorialStep === 0 && this.player.speed > 1) {
      this.moved += dt
      if (this.moved > 1) this.tutorialEvent('move')
    }
    this.titans.update(dt)
    this.npcs.update(dt)
    this.defense.update(dt)
    this.projectiles.update(dt)
    this.destruction.update(dt)
    this.waves.update(dt)
    this.combat.update(dt)
    this.skills.update(dt)
    this.effects.endRopes()
    this.particles.update(dt)

    // camera
    const p = this.player
    const focus = p.titanForm ? p.pos.clone().setY(p.pos.y + 13) : p.pos.clone().setY(p.pos.y + 1.6)
    this.camCtl.update(real, focus, p.vel, { dist: p.titanForm ? 20 : p.manning ? 4 : this.camCtl.dist, shoulder: p.titanForm ? 0 : 0.75, speedFx: !p.titanForm })
    this.env.follow(p.pos, dt)
    if (!p.titanForm) p.model.root.visible = this.camCtl.currentDistance > 1.3 || !p.alive
    audio.setListener(this.camera.position, this.camCtl.forward)
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight
    this.effects.update(real, this.camera, w, h)
    this.effects.drawSpeedLines(p.titanForm ? 0 : clamp((p.speed - 22) / 30, 0, 1), this.time)

    // failure: city falls when integrity collapses
    if (!this.overLock && this.cityIntegrity() < 0.15) this.endGame(false, '城市建筑几乎全部损毁，城市陷落…')

    this.hudAcc += real
    if (this.hudAcc > 0.1) {
      this.syncHud(this.hudAcc)
      this.hudAcc = 0
    }
    this.flashT = Math.max(0, this.flashT - real * 2.5)
    this.dynamicResolution(real)
    inp.endFrame()
    this.render()
  }

  private render() {
    this.renderer.render(this.scene, this.camera)
  }

  private dynamicResolution(real: number) {
    if (!this.settings.dynamicRes) return
    this.fpsAcc += real
    if (this.fpsAcc < 1) return
    this.fpsAcc = 0
    const target = this.settings.mobile ? 30 : 50
    const fps = this.loop.fps
    if (fps < target) this.fpsLow++
    else this.fpsLow = 0
    if (fps > target + 12) this.fpsHigh++
    else this.fpsHigh = 0
    if (this.fpsLow >= 2 && this.pixelRatio > 0.5) {
      this.pixelRatio = Math.max(0.5, this.pixelRatio - 0.1)
      this.renderer.setPixelRatio(this.pixelRatio)
      this.fpsLow = 0
    } else if (this.fpsHigh >= 4 && this.pixelRatio < this.basePR) {
      this.pixelRatio = Math.min(this.basePR, this.pixelRatio + 0.1)
      this.renderer.setPixelRatio(this.pixelRatio)
      this.fpsHigh = 0
    }
  }

  cityIntegrity() {
    const b = this.city.integrity()
    const w = this.walls.integrity()
    const c = this.city.core.hp / this.city.core.maxHp
    return b * 0.5 + w * 0.3 + c * 0.2
  }

  private syncHud(dt: number) {
    const h = this.store.hud
    const p = this.player
    const r = this.resources
    const w = this.waves
    h.wave = w.wave
    h.maxWaves = this.modeDef.waves
    h.waveName = w.def?.name ?? '准备迎战'
    h.phase = w.phase
    h.intermission = Math.max(0, w.intermission)
    h.hp = Math.max(0, Math.round(p.titanForm ? (p.titanHp / p.titanMaxHp) * p.stats.maxHp : p.hp))
    h.maxHp = p.stats.maxHp
    h.gas = Math.round(p.gas)
    h.blades = Math.round(p.sharpness)
    h.sharpness = Math.round(p.sharpness)
    h.bladeSets = p.bladeSets
    h.maxBladeSets = p.stats.bladeSets
    h.kills = this.combat.kills
    h.combo = this.combat.combo
    h.comboTimer = this.combat.comboT
    h.titansLeft = w.phase === 'combat' ? w.remaining : 0
    h.cityPct = Math.round(this.cityIntegrity() * 100)
    h.wallPct = Math.round(this.walls.integrity() * 100)
    h.gatePct = Math.round((this.walls.gate.hp / this.walls.gate.maxHp) * 100)
    h.corePct = Math.round((this.city.core.hp / this.city.core.maxHp) * 100)
    const il = this.defense.facilities.find((f) => f.type === 'innerline' && f.alive)
    h.innerPct = il ? Math.round((il.hp / il.maxHp) * 100) : 0
    h.funds = r.funds
    h.materials = Math.round(r.materials)
    h.score = r.score
    h.civilians = this.npcs.civiliansAlive
    h.saved = this.npcs.saved
    h.lost = this.npcs.lost
    h.soldiers = this.npcs.surveyAlive
    h.skills = this.skills.hud()
    h.rage = Math.round(p.rage)
    h.fps = this.loop.fps
    h.speed = Math.round(p.speed * 3.6)
    h.hookL = p.odm.L.state
    h.hookR = p.odm.R.state
    h.aimValid = p.aim.valid
    h.aimDist = Math.round(p.aim.dist)
    h.lockOn = !!p.lockTarget
    h.titanForm = p.titanForm ? Math.ceil(p.titanT) : 0
    h.respawn = p.alive ? 0 : Math.ceil(p.respawnT)
    h.grabbed = p.grabbedBy ? Math.max(0, 6 - p.struggle) : 0
    h.time = Math.round(this.time)
    if (h.damageFlash !== -1) h.damageFlash = this.flashT
    h.steamFog = this.env.extraFog
    h.order = this.npcs.order === 'attack' ? '进攻' : this.npcs.order === 'defend' ? '防守' : '集结'
    h.tutorial = this.tutorialStep >= 0 && this.tutorialStep < TUTORIAL.length ? TUTORIAL[this.tutorialStep].text : ''
    const boss = this.titans.boss
    h.bossName = boss ? boss.def.name : ''
    h.bossHp = boss ? Math.round((boss.napeHP / boss.napeMax) * 100) : 0
    h.bossPhase = boss ? (boss.armor > 0 ? `装甲 ${Math.round(boss.armor)}%` : boss.bossPhase) : ''
    if (boss && !this.bossAlarm) {
      this.bossAlarm = true
      audio.playMusic('boss')
    } else if (!boss) this.bossAlarm = false
    // contextual prompt
    let prompt = ''
    if (p.manning) prompt = '左键开炮 · F 离开火炮'
    else if (p.alive && !p.titanForm) {
      const sup = this.supplyNear(p.pos)
      if (sup === 'fire') prompt = '补给站失火中'
      else if (sup && (p.gas < 95 || p.bladeSets < p.stats.bladeSets || p.sharpness < 100)) prompt = 'F 补给瓦斯与刀刃'
      else if (this.defense.nearestCannon(p.pos, 5)) prompt = 'F 手动操炮'
      else if (p.bladeBroken && p.bladeSets > 0) prompt = 'R 更换刀刃'
    }
    h.prompt = prompt
    void dt
  }

  toggleShop() {
    const ph = this.waves.phase
    if (ph !== 'intermission' && ph !== 'intro') {
      this.banner('只能在波次间隙建造防御设施', 'info')
      return
    }
    this.store.shopOpen = !this.store.shopOpen
    if (this.store.shopOpen) this.input.exitLock()
  }

  setPaused(p: boolean) {
    if (this.over) return
    this.paused = p
    this.store.paused = p
    audio.setPaused(p)
    if (p) {
      this.input.exitLock()
      this.input.clearAll()
    }
  }

  // ------------------------------------------------------------------ minimap
  mapData() {
    const p = this.player
    return {
      layout: this.map.layout,
      radius: this.map.radius,
      player: { x: p.pos.x, z: p.pos.z, yaw: this.camCtl.yaw },
      segments: this.walls.segments.map((s) => ({ ax: s.mid.x - (s.dir.x * s.len) / 2, az: s.mid.z - (s.dir.z * s.len) / 2, bx: s.mid.x + (s.dir.x * s.len) / 2, bz: s.mid.z + (s.dir.z * s.len) / 2, hp: s.breakable ? (s.gate ? this.walls.gate.hp / this.walls.gate.maxHp : s.hpFrac) : 1, open: s.open, gate: !!s.gate, breakable: s.breakable })),
      buildings: this.city.buildings.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d, yaw: b.yaw, state: b.state, kind: b.kind, fire: b.fire > 0 })),
      titans: this.titans.list.filter((t) => t.alive).map((t) => ({ x: t.pos.x, z: t.pos.z, boss: t.def.boss, type: t.type, marked: t.markedT > 0, inside: t.inside })),
      soldiers: this.npcs.soldiers.filter((s) => s.alive).map((s) => ({ x: s.pos.x, z: s.pos.z, kind: s.kind })),
      civilians: this.npcs.civilians.filter((c) => c.alive && c.state !== 'saved').map((c) => ({ x: c.pos.x, z: c.pos.z })),
      facilities: this.defense.facilities.filter((f) => f.alive).map((f) => ({ x: f.pos.x, z: f.pos.z, type: f.type })),
      detection: this.defense.detection(),
      core: { x: this.city.core.x, z: this.city.core.z },
      trees: this.city.trees.filter((t) => t.giant).map((t) => ({ x: t.x, z: t.z })),
    }
  }

  // ------------------------------------------------------------------ save / restore
  saveRun() {
    const s: RunSave = {
      mapId: this.map.id,
      charId: this.char.id,
      mode: this.modeDef.id,
      wave: this.waves.wave,
      funds: this.resources.funds,
      materials: Math.round(this.resources.materials),
      score: this.resources.score,
      kills: this.combat.kills,
      napeKills: this.combat.napeKills,
      maxCombo: this.combat.maxCombo,
      time: this.time,
      coreHP: this.city.core.hp,
      segHP: this.walls.segments.map((x) => (x.breakable ? x.hp : -1)),
      gateHP: [this.walls.gate.hp],
      buildingHP: this.city.buildings.map((b) => b.hp),
      facilities: this.defense.facilities.filter((f) => f.alive).map((f) => ({ slot: f.slot.id, type: f.type, level: f.level })),
      civiliansSaved: this.npcs.saved,
      civiliansLost: this.npcs.lost,
      savedAt: Date.now(),
    }
    this.opts.onSaveRun(s)
  }

  private restore(s: RunSave) {
    this.resources.funds = s.funds
    this.resources.materials = s.materials
    this.resources.score = s.score
    this.combat.kills = s.kills
    this.combat.napeKills = s.napeKills
    this.combat.maxCombo = s.maxCombo
    this.time = s.time
    this.npcs.saved = s.civiliansSaved
    this.npcs.lost = s.civiliansLost
    this.walls.segments.forEach((seg, i) => {
      const hp = s.segHP[i]
      if (hp === undefined || hp < 0 || !seg.breakable || seg.gate) return
      seg.hp = hp
      const st = hp <= 0 ? 2 : seg.hpFrac < 0.55 ? 1 : 0
      this.walls.setSegmentState(seg, st)
    })
    const g = this.walls.gate
    g.hp = s.gateHP[0] ?? g.maxHp
    this.walls.setGateState(g.hp <= 0 ? 2 : g.hp / g.maxHp < 0.5 ? 1 : 0)
    this.city.buildings.forEach((b, i) => {
      const hp = s.buildingHP[i]
      if (hp === undefined) return
      b.hp = hp
      const f = hp / b.maxHp
      this.city.setState(b, hp <= 0 ? 2 : f < 0.6 ? 1 : 0)
    })
    this.city.core.hp = s.coreHP
    for (const f of [...this.defense.facilities]) {
      f.destroy()
    }
    this.defense.facilities.length = 0
    for (const fs of s.facilities) {
      const slot = this.city.slots.find((x) => x.id === fs.slot)
      if (!slot) continue
      this.defense.build(slot, fs.type, true)
      const fac = this.defense.bySlot(slot.id)
      if (fac) {
        fac.level = fs.level
        fac.hp = fac.maxHp
        fac.rebuild()
      }
    }
    this.waves.wave = s.wave
    this.waves.phase = 'intermission'
    this.waves.intermission = 30
    this.banner(`已读取存档：第 ${s.wave} 波之后`, 'good')
  }

  // ------------------------------------------------------------------ end
  endGame(victory: boolean, reason: string) {
    if (this.over || this.overLock) return
    this.overLock = true
    this.waves.phase = 'over'
    this.store.hud.phase = 'over'
    this.syncHud(0)
    this.input.exitLock()
    audio.setLoop('gas', 0)
    audio.setLoop('wind', 0)
    audio.setLoop('steam', 0)
    audio.playMusic(victory ? 'victory' : 'defeat')
    const wavesDone = victory ? this.waves.wave : Math.max(0, this.waves.wave - 1)
    const score = this.resources.score + (victory ? 3000 : 0) + Math.round(this.cityIntegrity() * 1000)
    const merit = Math.round(score / 150) + wavesDone * 4 + (victory ? 30 : 0) + this.resources.merit
    const res: GameResult = {
      victory, reason, wave: this.waves.wave, kills: this.combat.kills, napeKills: this.combat.napeKills, maxCombo: this.combat.maxCombo,
      score, merit, time: Math.round(this.time), civiliansSaved: this.npcs.saved, civiliansLost: this.npcs.lost,
      buildingsLost: this.destruction.buildingsLost, cityPct: Math.round(this.cityIntegrity() * 100), bossKills: this.combat.bossKills,
    }
    this.opts.onSaveRun(null)
    // let the final moment play for a beat in slow motion before the result screen
    this.loop.slowMo(0.3, 2)
    setTimeout(() => {
      if (this.disposed) return
      this.over = true
      this.opts.onResult(res)
    }, 1800)
  }
  private overLock = false

  // ------------------------------------------------------------------ lifecycle
  resize() {
    const el = this.opts.container
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.particles) this.particles.setScale((h * this.pixelRatio) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)))
    const sc = this.opts.speedCanvas
    sc.width = Math.floor(w / 2)
    sc.height = Math.floor(h / 2)
  }

  applySettings(s: Settings & { mobile: boolean }) {
    this.settings = s
    this.camCtl.fovBase = s.fov
    this.camCtl.sensitivity = s.sensitivity
    this.camCtl.invertY = s.invertY
    this.camCtl.shakeEnabled = s.cameraShake
    audio.setVolumes(s.master, s.music, s.sfx)
  }

  dispose() {
    this.disposed = true
    this.loop.stop()
    this.input.detach()
    this.resizeObs.disconnect()
    audio.setLoop('gas', 0)
    audio.setLoop('wind', 0)
    audio.setLoop('fire', 0)
    audio.setLoop('steam', 0)
    this.player?.dispose()
    this.titans?.dispose()
    this.npcs?.dispose()
    this.defense?.dispose()
    this.projectiles?.dispose()
    this.city?.dispose()
    this.walls?.dispose()
    this.env?.dispose()
    this.particles?.dispose()
    this.effects?.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry?.dispose()
    })
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}
