<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import { useGame } from './stores/game'
import { useProfile } from './stores/profile'
import { useSettings } from './stores/settings'
import { audio } from './game/core/Audio'
import { MenuScene } from './game/scenes/MenuScene'
import MainMenu from './components/MainMenu.vue'
import DeployPanel from './components/DeployPanel.vue'
import MapSelect from './components/MapSelect.vue'
import CharacterSelect from './components/CharacterSelect.vue'
import EquipmentUpgrade from './components/EquipmentUpgrade.vue'
import Bestiary from './components/Bestiary.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import HelpPanel from './components/HelpPanel.vue'
import GameView from './components/GameView.vue'
import RotatePrompt from './components/RotatePrompt.vue'

const game = useGame()
const profile = useProfile()
const settings = useSettings()
const bg = ref<HTMLDivElement>()
let menuScene: MenuScene | null = null
const gameKey = ref(0)
const inGame = computed(() => game.screen === 'game')

function ensureMenuScene() {
  if (!menuScene && bg.value) {
    try {
      menuScene = new MenuScene(bg.value)
    } catch (e) {
      console.warn('menu scene failed', e)
    }
  }
}
function dropMenuScene() {
  menuScene?.dispose()
  menuScene = null
}

const unlockAudio = () => {
  audio.init()
  audio.setVolumes(settings.master, settings.music, settings.sfx)
  if (!inGame.value) audio.playMusic('menu')
  window.removeEventListener('pointerdown', unlockAudio)
  window.removeEventListener('keydown', unlockAudio)
}

onMounted(async () => {
  await profile.load()
  ensureMenuScene()
  window.addEventListener('pointerdown', unlockAudio)
  window.addEventListener('keydown', unlockAudio)
})
onBeforeUnmount(dropMenuScene)

watch(
  () => game.screen,
  (s, prev) => {
    if (s === 'game') {
      dropMenuScene()
      gameKey.value++
    } else if (prev === 'game') {
      setTimeout(ensureMenuScene, 50)
      audio.playMusic('menu')
    }
  },
)

function startGame(resume: boolean) {
  game.resume = resume
  game.result = null
  game.screen = 'game'
}
function restart() {
  game.result = null
  game.resume = false
  gameKey.value++
}
</script>

<template>
  <div class="app-root">
    <div ref="bg" class="menu-bg" v-show="!inGame"></div>
    <div class="menu-vignette" v-show="!inGame"></div>
    <MainMenu v-if="game.screen === 'menu'" @start="startGame(false)" @resume="startGame(true)" />
    <DeployPanel v-else-if="game.screen === 'deploy'" @start="startGame(false)" @back="game.screen = 'menu'" />
    <MapSelect v-else-if="game.screen === 'maps'" @back="game.screen = 'menu'" />
    <CharacterSelect v-else-if="game.screen === 'characters'" @back="game.screen = 'menu'" />
    <EquipmentUpgrade v-else-if="game.screen === 'equipment'" @back="game.screen = 'menu'" />
    <Bestiary v-else-if="game.screen === 'bestiary'" @back="game.screen = 'menu'" />
    <SettingsPanel v-else-if="game.screen === 'settings'" @back="game.screen = 'menu'" />
    <HelpPanel v-else-if="game.screen === 'help'" @back="game.screen = 'menu'" />
    <GameView v-else-if="game.screen === 'game'" :key="gameKey" @quit="game.screen = 'menu'" @restart="restart" />
    <RotatePrompt />
  </div>
</template>

<style scoped>
.app-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
}
.menu-bg {
  position: absolute;
  inset: 0;
}
.menu-bg :deep(canvas) {
  display: block;
}
.menu-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(10, 6, 4, 0.75) 100%);
}
</style>
