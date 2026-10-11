import { shallowRef } from 'vue'
import type { GameEngine } from './core/GameEngine'

/** the running engine instance, shared by HUD / shop / minimap / touch controls */
export const engineRef = shallowRef<GameEngine | null>(null)
export const getEngine = () => engineRef.value
