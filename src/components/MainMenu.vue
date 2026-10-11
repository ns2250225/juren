<script setup lang="ts">
import { computed } from 'vue'
import { useGame, type Screen } from '../stores/game'
import { useProfile } from '../stores/profile'
import { getCharacter } from '../data/characters'
import { getMap, MODES } from '../data/maps'
import { audio } from '../game/core/Audio'

const emit = defineEmits<{ start: []; resume: [] }>()
const game = useGame()
const profile = useProfile()
const char = computed(() => getCharacter(profile.selectedChar))
const map = computed(() => getMap(profile.selectedMap))
const mode = computed(() => MODES.find((m) => m.id === profile.selectedMode) ?? MODES[1])
const save = computed(() => profile.runSave)

function go(s: Screen) {
  audio.play('uiClick')
  game.screen = s
}
const items: { label: string; sub: string; screen: Screen }[] = [
  { label: '选择地图', sub: '希干希纳区 · 托洛斯特区 · 玛利亚之墙 · 巨大树森林', screen: 'maps' },
  { label: '选择角色', sub: '艾伦 · 三笠 · 利威尔 · 阿尔敏 · 艾尔文 · 韩吉', screen: 'characters' },
  { label: '装备升级', sub: '战功点数强化角色与立体机动装置', screen: 'equipment' },
  { label: '巨人图鉴', sub: '3D 模型预览 · 击杀记录', screen: 'bestiary' },
  { label: '设置', sub: '画质 · 操作 · 辅助 · 音量', screen: 'settings' },
  { label: '游戏说明', sub: '键位与立体机动技巧', screen: 'help' },
]
</script>

<template>
  <div class="menu">
    <div class="brand">
      <div class="logo">
        <span class="l1">方块进击</span>
        <span class="l2">巨人守城</span>
      </div>
      <div class="tagline">BLOCK ATTACK · TITAN DEFENSE</div>
      <p class="intro">身为调查兵团的一员，驾驭立体机动装置在城墙与屋顶之间飞驰，斩击巨人后颈，守住人类最后的城墙。</p>
    </div>

    <div class="col">
      <div class="panel main-panel">
        <button class="btn btn-primary btn-lg btn-block" @click="go('deploy')">开始守城</button>
        <button v-if="save" class="btn btn-gold btn-block resume" @click="audio.play('uiClick'); emit('resume')">
          继续守城 <small>{{ getMap(save.mapId).name }} · 第 {{ save.wave }} 波后 · {{ getCharacter(save.charId).name }}</small>
        </button>
        <div class="list">
          <button v-for="it in items" :key="it.screen" class="btn btn-ghost item" @click="go(it.screen)">
            <span>{{ it.label }}</span>
            <small>{{ it.sub }}</small>
          </button>
        </div>
      </div>
      <div class="panel summary">
        <div class="kv"><span>当前角色</span><b :style="{ color: char.accent }">{{ char.name }} · {{ char.role }}</b></div>
        <div class="kv"><span>守城地图</span><b>{{ map.name }} · {{ mode.name }}</b></div>
        <div class="kv"><span>战功点数</span><b class="gold">{{ profile.merit }}</b></div>
        <div class="kv"><span>累计斩杀</span><b>{{ profile.totalKills }}</b></div>
      </div>
    </div>
    <div class="foot">同人原型 · 全部模型/音效均为程序化原创生成 · 致敬《进击的巨人》与方块沙盒美术</div>
  </div>
</template>

<style scoped>
.menu {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1.2fr minmax(320px, 420px);
  gap: 24px;
  padding: max(28px, env(safe-area-inset-top)) max(36px, env(safe-area-inset-right)) 40px max(36px, env(safe-area-inset-left));
  align-items: center;
}
.brand {
  align-self: center;
}
.logo {
  display: flex;
  flex-direction: column;
  font-family: var(--font-title);
  line-height: 1;
  text-shadow: 5px 5px 0 #000, 0 0 40px rgba(200, 57, 46, 0.35);
}
.l1 {
  font-size: clamp(48px, 9vw, 120px);
  color: var(--parchment);
  letter-spacing: 8px;
}
.l2 {
  font-size: clamp(40px, 7vw, 96px);
  color: var(--red-hi);
  letter-spacing: 10px;
  margin-top: 6px;
  -webkit-text-stroke: 2px #2a0a06;
}
.tagline {
  margin-top: 14px;
  font-family: ui-monospace, monospace;
  letter-spacing: 6px;
  color: var(--gold);
  font-size: 14px;
  text-shadow: 2px 2px 0 #000;
}
.intro {
  max-width: 520px;
  color: var(--text);
  font-size: 15px;
  line-height: 1.8;
  text-shadow: 1px 1px 2px #000;
  margin-top: 18px;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 100%;
  overflow: auto;
}
.main-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.resume small {
  display: block;
  font-size: 12px;
  font-weight: 400;
  opacity: 0.85;
  margin-top: 2px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}
.item small {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0;
}
.summary {
  padding: 10px 16px;
}
.foot {
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
  text-shadow: 1px 1px 0 #000;
}
@media (max-width: 820px), (max-height: 560px) {
  .menu {
    grid-template-columns: 1fr 1fr;
    padding: 14px 18px 26px;
    gap: 14px;
  }
  .intro {
    display: none;
  }
  .item small {
    display: none;
  }
  .summary {
    display: none;
  }
}
</style>
