import { defineStore } from 'pinia'
import { lsGet, lsSet } from '../utils/storage'

export type Quality = 'low' | 'medium' | 'high'
export interface MobileBtnPos { x: number; y: number; s: number }
export interface Settings {
  quality: Quality
  shadows: boolean
  dynamicRes: boolean
  fov: number
  sensitivity: number
  invertY: boolean
  master: number
  music: number
  sfx: number
  autoAim: boolean
  hookAssist: boolean
  autoAltitude: boolean
  cameraShake: boolean
  showFps: boolean
  hudScale: number
  hudVisible: boolean
  mobileMode: 'auto' | 'on' | 'off'
  mobileOpacity: number
  mobileLayout: Record<string, MobileBtnPos>
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  shadows: true,
  dynamicRes: true,
  fov: 75,
  sensitivity: 1,
  invertY: false,
  master: 0.8,
  music: 0.55,
  sfx: 0.9,
  autoAim: true,
  hookAssist: true,
  autoAltitude: true,
  cameraShake: true,
  showFps: true,
  hudScale: 1,
  hudVisible: true,
  mobileMode: 'auto',
  mobileOpacity: 0.75,
  mobileLayout: {},
}

export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0

export const useSettings = defineStore('settings', {
  state: (): Settings => {
    const s = lsGet<Settings>('settings', { ...DEFAULT_SETTINGS })
    if (!localStorage.getItem('titan-defense:settings') && isTouchDevice()) s.quality = 'low'
    return s
  },
  getters: {
    mobile: (s) => (s.mobileMode === 'auto' ? isTouchDevice() : s.mobileMode === 'on'),
  },
  actions: {
    save() {
      lsSet('settings', this.$state)
    },
    reset() {
      this.$patch({ ...DEFAULT_SETTINGS, mobileLayout: {} })
      this.save()
    },
  },
})
