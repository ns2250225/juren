import { defineStore } from 'pinia'
import { idbGet, idbSet } from '../utils/storage'
import type { StatId, EquipSlot } from '../data/upgrades'
import { EQUIPMENT, statCost } from '../data/upgrades'
import type { TitanType } from '../data/titans'
import type { MapId, GameMode } from '../data/maps'
import type { CharacterId } from '../data/characters'
import type { DefenseType } from '../data/defenses'

export interface RunSave {
  mapId: MapId
  charId: CharacterId
  mode: GameMode
  wave: number
  funds: number
  materials: number
  score: number
  kills: number
  napeKills: number
  maxCombo: number
  time: number
  coreHP: number
  segHP: number[]
  gateHP: number[]
  buildingHP: number[]
  facilities: { slot: number; type: DefenseType; level: number }[]
  civiliansSaved: number
  civiliansLost: number
  savedAt: number
}

export interface Profile {
  merit: number
  upgrades: Record<StatId, number>
  owned: string[]
  equipped: Record<EquipSlot, string>
  bestiary: Partial<Record<TitanType, { firstKill: number; kills: number }>>
  records: Partial<Record<MapId, { bestWave: number; bestScore: number; wins: number }>>
  selectedChar: CharacterId
  selectedMap: MapId
  selectedMode: GameMode
  totalKills: number
  games: number
  runSave: RunSave | null
}

const DEFAULT: Profile = {
  merit: 60,
  upgrades: { maxHp: 0, hookRange: 0, gasEff: 0, flySpeed: 0, bladeDur: 0, napeDmg: 0, dodge: 0, cooldown: 0 },
  owned: ['odm_basic', 'hook_basic', 'gas_basic', 'blade_basic'],
  equipped: { odm: 'odm_basic', hook: 'hook_basic', gas: 'gas_basic', blade: 'blade_basic' },
  bestiary: {},
  records: {},
  selectedChar: 'eren',
  selectedMap: 'shiganshina',
  selectedMode: 'standard',
  totalKills: 0,
  games: 0,
  runSave: null,
}

export const useProfile = defineStore('profile', {
  state: (): Profile & { loaded: boolean } => ({ ...structuredClone(DEFAULT), loaded: false }),
  actions: {
    async load() {
      const p = await idbGet<Profile>('profile')
      if (p) {
        const d = structuredClone(DEFAULT)
        this.$patch({ ...d, ...p, upgrades: { ...d.upgrades, ...p.upgrades }, equipped: { ...d.equipped, ...p.equipped } })
      }
      this.loaded = true
    },
    async save() {
      const { loaded, ...rest } = this.$state
      await idbSet('profile', rest)
    },
    buyStat(id: StatId) {
      const lv = this.upgrades[id]
      const c = statCost(lv)
      if (lv >= 5 || this.merit < c) return false
      this.merit -= c
      this.upgrades[id] = lv + 1
      this.save()
      return true
    },
    buyEquip(id: string) {
      const e = EQUIPMENT.find((x) => x.id === id)
      if (!e || this.owned.includes(id) || this.merit < e.cost) return false
      this.merit -= e.cost
      this.owned.push(id)
      this.equipped[e.slot] = id
      this.save()
      return true
    },
    equip(id: string) {
      const e = EQUIPMENT.find((x) => x.id === id)
      if (!e || !this.owned.includes(id)) return
      this.equipped[e.slot] = id
      this.save()
    },
    recordKill(type: TitanType) {
      const b = this.bestiary[type]
      if (b) b.kills++
      else this.bestiary[type] = { firstKill: Date.now(), kills: 1 }
      this.totalKills++
    },
    async resetAll() {
      this.$patch({ ...structuredClone(DEFAULT), loaded: true })
      await this.save()
    },
  },
})
