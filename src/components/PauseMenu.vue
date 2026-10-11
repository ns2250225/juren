<script setup lang="ts">
import { ref } from 'vue'
import SettingsPanel from './SettingsPanel.vue'
import { useGame } from '../stores/game'
import { useSettings } from '../stores/settings'
import { audio } from '../game/core/Audio'

const emit = defineEmits<{ resume: []; quit: []; restart: []; settingsChanged: []; editLayout: [] }>()
const game = useGame()
const settings = useSettings()
const showSettings = ref(false)
function click(fn: () => void) {
  audio.play('uiClick')
  fn()
}
function confirmRestart() {
  if (confirm('重新开始本局？当前进度将丢失（最近一次波次间隙的存档会保留）。')) emit('restart')
}
</script>

<template>
  <div class="pause-wrap" @click.stop>
    <SettingsPanel v-if="showSettings" in-game @back="showSettings = false" @changed="emit('settingsChanged')" @edit-layout="showSettings = false; emit('editLayout')" />
    <div v-else class="panel pause">
      <h2 class="panel-title">暂停</h2>
      <div class="info muted">第 {{ game.hud.wave }} 波 · 击杀 {{ game.hud.kills }} · 城市 {{ game.hud.cityPct }}%</div>
      <button class="btn btn-primary btn-lg btn-block" @click="click(() => emit('resume'))">继续战斗</button>
      <button class="btn btn-block" @click="click(() => (showSettings = true))">设置</button>
      <button v-if="settings.mobile" class="btn btn-block" @click="click(() => emit('editLayout'))">调整触控按钮</button>
      <button class="btn btn-block" @click="click(confirmRestart)">重新开始</button>
      <button class="btn btn-ghost btn-block" @click="click(() => emit('quit'))">返回主菜单</button>
      <div class="keys">
        <span><kbd>右键</kbd>/<kbd>Q</kbd> 钩索</span><span><kbd>Shift</kbd> 瓦斯</span><span><kbd>左键</kbd> 斩击</span>
        <span><kbd>E</kbd> 收回</span><span><kbd>R</kbd> 换刀</span><span><kbd>F</kbd> 补给</span><span><kbd>T</kbd> 锁定</span><span><kbd>Tab</kbd> 地图</span>
      </div>
      <p class="muted small">提示：返回主菜单后可通过「继续守城」从最近一次波次间隙继续。</p>
    </div>
  </div>
</template>

<style scoped>
.pause-wrap {
  position: absolute;
  inset: 0;
  background: rgba(5, 3, 2, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.pause {
  width: min(380px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 94vh;
  overflow: auto;
}
.info {
  margin-top: -8px;
  font-size: 13px;
}
.keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 12px;
  margin-top: 6px;
  color: var(--text-dim);
}
.small {
  font-size: 11px;
  margin: 0;
}
</style>
