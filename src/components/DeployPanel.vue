<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../stores/game'
import { useProfile } from '../stores/profile'
import { getCharacter, COMMON_SKILLS } from '../data/characters'
import { getMap, MODES, type GameMode } from '../data/maps'
import { EQUIPMENT } from '../data/upgrades'
import { audio } from '../game/core/Audio'

const emit = defineEmits<{ start: []; back: [] }>()
const game = useGame()
const profile = useProfile()
const char = computed(() => getCharacter(profile.selectedChar))
const map = computed(() => getMap(profile.selectedMap))
const gear = computed(() => Object.values(profile.equipped).map((id) => EQUIPMENT.find((e) => e.id === id)?.name ?? id))

function setMode(m: GameMode) {
  audio.play('uiClick')
  profile.selectedMode = m
  profile.save()
}
function start() {
  audio.play('waveStart', { volume: 0.6 })
  if (profile.runSave && !confirm('开始新的守城将覆盖当前的存档进度，确定吗？')) return
  profile.runSave = null
  profile.save()
  emit('start')
}
</script>

<template>
  <div class="screen">
    <div class="screen-head">
      <h2 class="panel-title">出征准备 <small>确认地图、角色与装备</small></h2>
      <button class="btn" @click="emit('back')">返回</button>
    </div>
    <div class="screen-body deploy">
      <div class="panel">
        <div class="sec-title">守城地图</div>
        <div class="map-thumb" :style="{ background: `linear-gradient(180deg, ${map.preview.sky}, ${map.preview.ground})` }">
          <span>{{ map.name }}</span>
        </div>
        <p class="subtitle">{{ map.subtitle }} — {{ map.desc }}</p>
        <button class="btn btn-sm" @click="game.screen = 'maps'">更改地图</button>
        <div class="sec-title" style="margin-top: 14px">模式</div>
        <div class="modes">
          <button v-for="m in MODES" :key="m.id" class="card mode" :class="{ active: profile.selectedMode === m.id }" @click="setMode(m.id)">
            <b>{{ m.name }}</b>
            <small>{{ m.desc }}</small>
          </button>
        </div>
      </div>
      <div class="panel">
        <div class="sec-title">出战角色</div>
        <div class="char-name" :style="{ color: char.accent }">{{ char.name }}</div>
        <div class="tag">{{ char.role }}</div>
        <p class="subtitle">{{ char.desc }}</p>
        <div class="skill"><kbd>1</kbd> <b>{{ char.skillName }}</b><span class="muted"> — {{ char.skillDesc }}</span></div>
        <div v-for="s in COMMON_SKILLS" :key="s.id" class="skill"><kbd>{{ s.key }}</kbd> <b>{{ s.name }}</b><span class="muted"> — {{ s.desc }}</span></div>
        <button class="btn btn-sm" style="margin-top: 10px" @click="game.screen = 'characters'">更改角色</button>
        <div class="sec-title" style="margin-top: 14px">装备</div>
        <div class="gear"><span v-for="g in gear" :key="g" class="tag tag-gold">{{ g }}</span></div>
        <button class="btn btn-sm" style="margin-top: 10px" @click="game.screen = 'equipment'">装备升级</button>
      </div>
    </div>
    <div class="row go">
      <span class="muted">提示：从城墙上跳下，用钩索在屋顶之间机动，绕到巨人身后斩击后颈。</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-lg" @click="start">献出心脏！出击</button>
    </div>
  </div>
</template>

<style scoped>
.deploy {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-content: start;
}
.sec-title {
  font-weight: 900;
  color: var(--gold);
  font-size: 13px;
  letter-spacing: 2px;
  margin-bottom: 8px;
}
.map-thumb {
  height: 90px;
  display: flex;
  align-items: flex-end;
  padding: 8px 12px;
  box-shadow: 0 0 0 3px #0a0705, inset 0 -30px 40px rgba(0, 0, 0, 0.5);
  font-family: var(--font-title);
  font-size: 28px;
  text-shadow: 2px 2px 0 #000;
  margin-bottom: 8px;
}
.modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.mode {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  color: var(--text);
  font-family: inherit;
}
.mode small {
  color: var(--text-dim);
  font-size: 11px;
}
.char-name {
  font-family: var(--font-title);
  font-size: 30px;
  text-shadow: 2px 2px 0 #000;
  margin-bottom: 4px;
}
.skill {
  font-size: 13px;
  margin: 6px 0;
  line-height: 1.5;
}
.gear {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.go {
  padding-top: 4px;
}
@media (max-width: 760px), (max-height: 520px) {
  .modes {
    grid-template-columns: 1fr;
  }
  .go .muted {
    display: none;
  }
}
</style>
