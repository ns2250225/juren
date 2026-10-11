<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { useGame, emptyHud, type GameResult as Result } from '../stores/game'
import { useProfile } from '../stores/profile'
import { useSettings } from '../stores/settings'
import { GameEngine } from '../game/core/GameEngine'
import { engineRef } from '../game/engineRef'
import { audio } from '../game/core/Audio'
import GameHUD from './GameHUD.vue'
import Minimap from './Minimap.vue'
import DefenseShop from './DefenseShop.vue'
import PauseMenu from './PauseMenu.vue'
import GameResult from './GameResult.vue'
import MobileControls from './MobileControls.vue'
import type { TitanType } from '../data/titans'

const emit = defineEmits<{ quit: []; restart: [] }>()
const game = useGame()
const profile = useProfile()
const settings = useSettings()
const host = ref<HTMLDivElement>()
const overlay = ref<HTMLDivElement>()
const speed = ref<HTMLCanvasElement>()
const loading = ref(true)
const loadText = ref('准备中…')
const loadP = ref(0)
const error = ref('')
const editLayout = ref(false)
let engine: GameEngine | null = null
const mobile = computed(() => settings.mobile)
const tips = [
  '速度越快，斩击伤害越高。',
  '巨人的弱点在后颈：从背后接近，左键斩击。',
  '刀刃会逐渐变钝，按 R 更换；补给站按 F 免费补满。',
  '奇行种会绕开炮台，从防守薄弱的城墙段突破。',
  '铠之巨人的后颈有装甲，强化刀刃与弩炮更有效。',
  '超大型巨人释放蒸汽时无法接近，等待间歇期！',
  'Tab 查看战场地图，警戒塔可以扩大侦察范围。',
  '波次间隙按 B 建造炮台、陷阱与维修站。',
]
const tip = tips[Math.floor(Math.random() * tips.length)]

async function lockLandscape() {
  if (!mobile.value) return
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.()
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await so.lock?.('landscape')
  } catch {
    /* unsupported: RotatePrompt asks the player to rotate manually */
  }
}

onMounted(async () => {
  game.hud = emptyHud()
  game.banners = []
  game.paused = false
  game.shopOpen = false
  game.mapOpen = false
  game.result = null
  lockLandscape()
  const resume = game.resume ? profile.runSave : null
  const mapId = resume?.mapId ?? profile.selectedMap
  const charId = resume?.charId ?? profile.selectedChar
  const mode = resume?.mode ?? profile.selectedMode
  try {
    engine = new GameEngine({
      container: host.value!,
      overlay: overlay.value!,
      speedCanvas: speed.value!,
      mapId,
      mode,
      charId,
      settings: { ...JSON.parse(JSON.stringify(settings.$state)), mobile: settings.mobile },
      profile: JSON.parse(JSON.stringify(profile.$state)),
      store: game,
      resume,
      onProfileKill: (t: TitanType) => profile.recordKill(t),
      onSaveRun: (s) => {
        profile.runSave = s
        profile.save()
      },
      onResult: (r) => finish(r, mapId),
      onToggleHud: () => {
        settings.hudVisible = !settings.hudVisible
        settings.save()
      },
    })
    engineRef.value = engine
    if (import.meta.env.DEV) (window as unknown as { __engine: GameEngine }).__engine = engine
    await engine.init((t, p) => {
      loadText.value = t
      loadP.value = p
    })
    loading.value = false
  } catch (e) {
    console.error(e)
    error.value = String((e as Error)?.message ?? e)
  }
})

onBeforeUnmount(() => {
  engine?.dispose()
  engine = null
  engineRef.value = null
  game.paused = false
  game.shopOpen = false
  game.mapOpen = false
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
})

function finish(r: Result, mapId: string) {
  game.result = r
  profile.merit += r.merit
  profile.games++
  const rec = profile.records[mapId as keyof typeof profile.records] ?? { bestWave: 0, bestScore: 0, wins: 0 }
  rec.bestWave = Math.max(rec.bestWave, r.wave)
  rec.bestScore = Math.max(rec.bestScore, r.score)
  if (r.victory) rec.wins++
  profile.records[mapId as keyof typeof profile.records] = rec
  profile.save()
}

function resume() {
  engine?.setPaused(false)
  if (!mobile.value) engine?.input.requestLock()
}
function quit() {
  // keep the run save made at the last intermission so the player can continue later
  emit('quit')
}
function settingsChanged() {
  engine?.applySettings({ ...JSON.parse(JSON.stringify(settings.$state)), mobile: settings.mobile })
}
function clickToPlay() {
  if (!mobile.value && engine && !game.paused && !game.shopOpen && !game.result) engine.input.requestLock()
  audio.init()
}
</script>

<template>
  <div class="gameview" @click="clickToPlay">
    <div ref="host" class="host"></div>
    <canvas ref="speed" class="speed"></canvas>
    <div ref="overlay" class="world-ui"></div>

    <GameHUD v-if="!loading" />
    <div v-if="game.mapOpen && !loading" class="bigmap panel" @click.stop>
      <div class="row"><h3 class="panel-title">战场地图 <small>Tab 关闭</small></h3><span class="spacer"></span><button class="btn btn-sm" @click="game.mapOpen = false">关闭</button></div>
      <div class="bigmap-body"><Minimap big /></div>
    </div>
    <MobileControls v-if="mobile && !loading && !game.result" :edit="editLayout" @done-edit="editLayout = false" />
    <DefenseShop v-if="game.shopOpen && !loading" @close="game.shopOpen = false" />
    <PauseMenu v-if="game.paused && !game.result" @resume="resume" @quit="quit" @restart="emit('restart')" @settings-changed="settingsChanged" @edit-layout="editLayout = true; resume()" />
    <GameResult v-if="game.result" :result="game.result" @restart="emit('restart')" @quit="emit('quit')" />

    <div v-if="loading" class="loading">
      <div class="load-box">
        <div class="load-title">{{ error ? '加载失败' : '方块进击：巨人守城' }}</div>
        <div v-if="!error" class="bar"><i :style="{ width: loadP * 100 + '%', background: 'var(--red)' }"></i></div>
        <div class="muted">{{ error || loadText }}</div>
        <div v-if="!error" class="tip">提示：{{ tip }}</div>
        <button v-if="error" class="btn" @click="emit('quit')">返回主菜单</button>
      </div>
    </div>
    <div v-if="!loading && !mobile && !game.paused && !game.result && !game.shopOpen" class="clickhint">点击画面锁定鼠标 · Esc 暂停</div>
  </div>
</template>

<style scoped>
.gameview {
  position: absolute;
  inset: 0;
  background: #000;
}
.host {
  position: absolute;
  inset: 0;
}
.host :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.speed {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  image-rendering: pixelated;
}
.world-ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.bigmap {
  position: absolute;
  inset: 5% 8%;
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.bigmap-body {
  flex: 1;
  min-height: 0;
}
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #2a1c14, #0a0705);
  z-index: 50;
}
.load-box {
  width: min(520px, 86vw);
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
}
.load-title {
  font-family: var(--font-title);
  font-size: 34px;
  color: var(--parchment);
  text-shadow: 3px 3px 0 #000;
}
.load-box .bar {
  height: 14px;
}
.tip {
  color: var(--gold);
  font-size: 13px;
}
.clickhint {
  position: absolute;
  bottom: 4px;
  right: 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  pointer-events: none;
}
</style>
