import { defineStore } from 'pinia'

export type Screen = 'menu' | 'deploy' | 'maps' | 'characters' | 'equipment' | 'bestiary' | 'settings' | 'help' | 'game'
export type Phase = 'loading' | 'intro' | 'combat' | 'intermission' | 'over'

export interface Banner { id: number; text: string; kind: 'info' | 'warn' | 'danger' | 'good' | 'kill'; t: number }
export interface SkillHud { key: string; name: string; cd: number; max: number; active: number; ready: boolean; extra?: string }
export interface GameResult {
  victory: boolean
  reason: string
  wave: number
  kills: number
  napeKills: number
  maxCombo: number
  score: number
  merit: number
  time: number
  civiliansSaved: number
  civiliansLost: number
  buildingsLost: number
  cityPct: number
  bossKills: number
}

export interface HudState {
  wave: number
  maxWaves: number
  waveName: string
  phase: Phase
  intermission: number
  hp: number
  maxHp: number
  gas: number
  blades: number
  bladeSets: number
  maxBladeSets: number
  sharpness: number
  kills: number
  combo: number
  comboTimer: number
  titansLeft: number
  cityPct: number
  wallPct: number
  gatePct: number
  corePct: number
  innerPct: number
  funds: number
  materials: number
  score: number
  civilians: number
  saved: number
  lost: number
  soldiers: number
  skills: SkillHud[]
  rage: number
  fps: number
  speed: number
  hookL: string
  hookR: string
  aimValid: boolean
  aimDist: number
  lockOn: boolean
  prompt: string
  titanForm: number
  respawn: number
  grabbed: number
  mapName: string
  time: number
  damageFlash: number
  steamFog: number
  tutorial: string
  order: string
  bossName: string
  bossHp: number
  bossPhase: string
}

export const emptyHud = (): HudState => ({
  wave: 0, maxWaves: 10, waveName: '', phase: 'loading', intermission: 0, hp: 100, maxHp: 100, gas: 100,
  blades: 100, bladeSets: 4, maxBladeSets: 4, sharpness: 100, kills: 0, combo: 0, comboTimer: 0, titansLeft: 0,
  cityPct: 100, wallPct: 100, gatePct: 100, corePct: 100, innerPct: 0, funds: 0, materials: 0, score: 0,
  civilians: 0, saved: 0, lost: 0, soldiers: 0, skills: [], rage: 0, fps: 0, speed: 0, hookL: 'idle',
  hookR: 'idle', aimValid: false, aimDist: 0, lockOn: false, prompt: '', titanForm: 0, respawn: 0, grabbed: 0,
  mapName: '', time: 0, damageFlash: 0, steamFog: 0, tutorial: '', order: '防守', bossName: '', bossHp: 0, bossPhase: '',
})

let bannerId = 1
export const useGame = defineStore('game', {
  state: () => ({
    screen: 'menu' as Screen,
    hud: emptyHud(),
    banners: [] as Banner[],
    paused: false,
    mapOpen: false,
    shopOpen: false,
    result: null as GameResult | null,
    resume: false,
    loadingText: '',
  }),
  actions: {
    banner(text: string, kind: Banner['kind'] = 'info') {
      if (this.banners.some((b) => b.text === text)) return
      const b = { id: bannerId++, text, kind, t: Date.now() }
      this.banners.push(b)
      if (this.banners.length > 4) this.banners.shift()
      setTimeout(() => {
        const i = this.banners.findIndex((x) => x.id === b.id)
        if (i >= 0) this.banners.splice(i, 1)
      }, kind === 'kill' ? 1600 : 3200)
    },
  },
})
