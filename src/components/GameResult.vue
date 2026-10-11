<script setup lang="ts">
import type { GameResult } from '../stores/game'
import { formatTime } from '../utils/math'

defineProps<{ result: GameResult }>()
const emit = defineEmits<{ restart: []; quit: [] }>()
</script>

<template>
  <div class="result-wrap">
    <div class="panel result" :class="{ win: result.victory }">
      <div class="title">{{ result.victory ? '城市守住了！' : '城市陷落' }}</div>
      <div class="reason">{{ result.reason }}</div>
      <div class="stats">
        <div><span>坚守波次</span><b>{{ result.wave }}</b></div>
        <div><span>斩杀巨人</span><b>{{ result.kills }}</b></div>
        <div><span>后颈斩杀</span><b>{{ result.napeKills }}</b></div>
        <div><span>最高连斩</span><b>×{{ result.maxCombo }}</b></div>
        <div><span>Boss 击破</span><b>{{ result.bossKills }}</b></div>
        <div><span>城市完整度</span><b>{{ result.cityPct }}%</b></div>
        <div><span>疏散居民</span><b class="green">{{ result.civiliansSaved }}</b></div>
        <div><span>居民遇难</span><b class="red">{{ result.civiliansLost }}</b></div>
        <div><span>建筑损毁</span><b>{{ result.buildingsLost }}</b></div>
        <div><span>战斗时长</span><b>{{ formatTime(result.time) }}</b></div>
      </div>
      <div class="score">总评分 <b>{{ result.score }}</b></div>
      <div class="merit">获得战功点数 <b>+{{ result.merit }}</b> <small class="muted">（可在「装备升级」中使用）</small></div>
      <div class="row btns">
        <button class="btn btn-primary btn-lg" @click="emit('restart')">再战一局</button>
        <button class="btn btn-lg" @click="emit('quit')">返回主菜单</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-wrap {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(30, 10, 6, 0.6), rgba(0, 0, 0, 0.9));
  animation: fade 0.8s;
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
.result {
  width: min(640px, 94vw);
  max-height: 94vh;
  overflow: auto;
  text-align: center;
}
.title {
  font-family: var(--font-title);
  font-size: clamp(36px, 7vw, 64px);
  color: var(--red-hi);
  text-shadow: 4px 4px 0 #000;
  letter-spacing: 6px;
}
.result.win .title {
  color: var(--gold);
}
.reason {
  color: var(--text-dim);
  margin-bottom: 14px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}
.stats div {
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 0 0 2px #0a0705;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stats span {
  font-size: 12px;
  color: var(--text-dim);
}
.stats b {
  font-size: 20px;
}
.score {
  margin-top: 14px;
  font-size: 18px;
}
.score b {
  font-family: var(--font-title);
  font-size: 34px;
  color: #ffe27a;
}
.merit {
  margin: 6px 0 14px;
}
.merit b {
  color: var(--gold);
  font-size: 20px;
}
.btns {
  justify-content: center;
  flex-wrap: wrap;
}
</style>
