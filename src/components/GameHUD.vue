<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../stores/game'
import { useSettings } from '../stores/settings'
import { getEngine } from '../game/engineRef'
import Minimap from './Minimap.vue'

const game = useGame()
const settings = useSettings()
const h = computed(() => game.hud)
const pct = (v: number, m: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, m)) * 100))}%`
const barCol = (f: number) => (f > 66 ? 'var(--green)' : f > 33 ? '#c9a23a' : 'var(--red)')
const waveLabel = computed(() => (h.value.wave ? `第 ${String(h.value.wave).padStart(2, '0')} 波 · ${h.value.waveName}` : '准备迎战'))
const phaseCountdown = computed(() => (h.value.phase === 'intro' || h.value.phase === 'intermission' ? Math.ceil(h.value.intermission) : 0))
function nextWave() {
  getEngine()?.waves.skip()
}
function openShop() {
  getEngine()?.toggleShop()
}
</script>

<template>
  <div class="hud" :class="{ hidden: !settings.hudVisible, mobile: settings.mobile }" :style="{ '--s': settings.hudScale }">
    <!-- full-screen overlays -->
    <div class="flash" :style="{ opacity: h.damageFlash > 0 ? Math.min(0.75, h.damageFlash) : 0 }"></div>
    <div class="white" :class="{ on: h.damageFlash === -1 }"></div>
    <div class="steam" :style="{ opacity: h.steamFog * 0.55 }"></div>

    <!-- top centre: wave + banners -->
    <div class="top-center">
      <div class="wave">{{ waveLabel }}<span v-if="h.maxWaves < 999" class="muted"> / {{ h.maxWaves }}</span></div>
      <div v-if="h.bossName" class="boss">
        <div class="boss-name">{{ h.bossName }} <small>{{ h.bossPhase }}</small></div>
        <div class="bar boss-bar"><i :style="{ width: h.bossHp + '%', background: 'var(--red)' }"></i></div>
      </div>
      <TransitionGroup name="ban" tag="div" class="banners">
        <div v-for="b in game.banners" :key="b.id" class="banner" :class="b.kind">{{ b.text }}</div>
      </TransitionGroup>
      <div v-if="h.tutorial" class="tutorial">{{ h.tutorial }}</div>
    </div>

    <!-- top left: city status -->
    <div class="top-left hud-block">
      <div class="city-title">城市 <b :style="{ color: barCol(h.cityPct) }">{{ h.cityPct }}%</b></div>
      <div class="mini-row"><span>城墙</span><div class="bar"><i :style="{ width: h.wallPct + '%', background: barCol(h.wallPct) }"></i></div><em>{{ h.wallPct }}%</em></div>
      <div class="mini-row"><span>城门</span><div class="bar"><i :style="{ width: h.gatePct + '%', background: barCol(h.gatePct) }"></i></div><em>{{ h.gatePct }}%</em></div>
      <div class="mini-row"><span>核心</span><div class="bar"><i :style="{ width: h.corePct + '%', background: barCol(h.corePct) }"></i></div><em>{{ h.corePct }}%</em></div>
      <div v-if="h.innerPct" class="mini-row"><span>防线</span><div class="bar"><i :style="{ width: h.innerPct + '%', background: '#9a8a74' }"></i></div><em>{{ h.innerPct }}%</em></div>
      <div class="res">
        <span title="军团资金">💰 {{ h.funds }}</span>
        <span title="建筑材料">🧱 {{ h.materials }}</span>
        <span title="调查兵团">🪽 {{ h.soldiers }}</span>
        <span title="居民（已疏散/遇难）">👥 {{ h.civilians }} <small class="green">+{{ h.saved }}</small> <small class="red">-{{ h.lost }}</small></span>
      </div>
      <div class="order">兵团指令：<b>{{ h.order }}</b> <small class="muted">Z 集结 · X 进攻 · C 防守</small></div>
    </div>

    <!-- top right: minimap + kills -->
    <div class="top-right">
      <div class="mini hud-block"><Minimap /></div>
      <div class="kills hud-block">
        <div>击杀 <b>{{ h.kills }}</b><span v-if="h.combo > 1" class="combo"> · 连斩 ×{{ h.combo }}</span></div>
        <div>剩余巨人 <b class="red">{{ h.titansLeft }}</b></div>
        <div class="muted small">得分 {{ h.score }}<span v-if="settings.showFps"> · {{ h.fps }} FPS</span> · {{ h.speed }} km/h</div>
      </div>
    </div>

    <!-- crosshair -->
    <div v-if="!h.titanForm" class="cross" :class="{ valid: h.aimValid, lock: h.lockOn }">
      <i class="l" :class="h.hookL"></i>
      <span class="dot"></span>
      <i class="r" :class="h.hookR"></i>
      <em v-if="h.aimValid">{{ h.aimDist }}m</em>
    </div>

    <!-- bottom left: player vitals -->
    <div class="bottom-left hud-block">
      <div class="vital">
        <label>{{ h.titanForm ? '巨人体力' : '生命值' }}</label>
        <div class="bar big"><i :style="{ width: pct(h.hp, h.maxHp), background: 'var(--hp)' }"></i></div>
        <b>{{ h.hp }} / {{ h.maxHp }}</b>
      </div>
      <div class="vital">
        <label>瓦斯</label>
        <div class="bar big"><i :style="{ width: h.gas + '%', background: h.gas < 25 ? 'var(--red-hi)' : 'var(--gas)' }"></i></div>
        <b>{{ h.gas }}%</b>
      </div>
      <div class="vital">
        <label>刀刃</label>
        <div class="bar big"><i :style="{ width: h.sharpness + '%', background: 'var(--steel)' }"></i></div>
        <b>{{ h.bladeSets }} / {{ h.maxBladeSets }}</b>
      </div>
    </div>

    <!-- bottom centre: skills & prompt -->
    <div class="bottom-center">
      <div v-if="h.prompt" class="prompt">{{ h.prompt }}</div>
      <div class="skills">
        <div v-for="s in h.skills" :key="s.key" class="skill" :class="{ ready: s.ready, active: s.active > 0 }">
          <div class="cd" :style="{ height: s.cd > 0 ? (s.cd / s.max) * 100 + '%' : '0%' }"></div>
          <kbd>{{ s.key }}</kbd>
          <span>{{ s.name }}</span>
          <small v-if="s.active > 0">{{ Math.ceil(s.active) }}s</small>
          <small v-else-if="s.cd > 0">{{ Math.ceil(s.cd) }}</small>
          <small v-else-if="s.extra">{{ s.extra }}</small>
        </div>
      </div>
    </div>

    <!-- state overlays -->
    <div v-if="phaseCountdown" class="intermission hud-block">
      <div>{{ h.phase === 'intro' ? '巨人即将来袭' : '波次间隙' }} · <b>{{ phaseCountdown }}</b> 秒后开始第 {{ h.wave + 1 }} 波</div>
      <div class="row" style="justify-content: center; margin-top: 8px; pointer-events: auto">
        <button class="btn btn-sm btn-gold" @click="openShop">防御建设 (B)</button>
        <button class="btn btn-sm btn-primary" @click="nextWave">立即开始 (N)</button>
      </div>
    </div>
    <div v-if="h.grabbed" class="grabbed">被巨人抓住！<br />连续点击斩击挣脱 ×{{ h.grabbed }}</div>
    <div v-if="h.respawn" class="respawn">阵亡 · {{ h.respawn }} 秒后复活</div>
    <div v-if="h.titanForm" class="titanform">巨人化剩余 {{ h.titanForm }} 秒 · 左键重拳 · 右键咆哮</div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-size: calc(14px * var(--s));
  text-shadow: 1px 1px 0 #000;
}
.hud.hidden > *:not(.flash):not(.white):not(.steam):not(.cross) {
  display: none;
}
.hud-block {
  background: rgba(15, 10, 7, 0.62);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 220, 160, 0.08);
  padding: 8px 10px;
}
.flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(180, 0, 0, 0.85) 100%);
  transition: opacity 0.1s;
}
.white {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  transition: opacity 0.4s;
}
.white.on {
  opacity: 0.85;
  transition: none;
}
.steam {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.5), rgba(240, 240, 240, 0.9));
}
.top-center {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: min(640px, 60vw);
}
.wave {
  font-family: var(--font-title);
  font-size: calc(24px * var(--s));
  letter-spacing: 2px;
  color: var(--parchment);
  text-shadow: 2px 2px 0 #000;
}
.boss {
  width: 100%;
}
.boss-name {
  text-align: center;
  font-weight: 900;
  color: #ffb0a0;
}
.boss-name small {
  color: var(--text-dim);
  font-weight: 400;
}
.boss-bar {
  height: 12px;
}
.banners {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.banner {
  font-weight: 900;
  padding: 4px 16px;
  background: rgba(15, 10, 7, 0.75);
  box-shadow: 0 0 0 2px #000;
  font-size: calc(15px * var(--s));
  color: var(--parchment);
}
.banner.warn {
  color: #ffd27a;
  background: rgba(70, 45, 10, 0.85);
}
.banner.danger {
  color: #fff;
  background: rgba(150, 25, 18, 0.9);
  animation: pulse 0.6s ease-in-out 3;
}
.banner.good {
  color: #d8ffe0;
  background: rgba(30, 80, 45, 0.85);
}
.banner.kill {
  font-family: var(--font-title);
  font-size: calc(26px * var(--s));
  color: #ffe27a;
  background: none;
  box-shadow: none;
  text-shadow: 3px 3px 0 #000, 0 0 20px rgba(255, 140, 40, 0.6);
  font-weight: 400;
}
@keyframes pulse {
  50% {
    filter: brightness(1.5);
  }
}
.ban-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(1.15);
}
.ban-leave-to {
  opacity: 0;
}
.ban-enter-active,
.ban-leave-active {
  transition: all 0.25s;
}
.tutorial {
  margin-top: 4px;
  padding: 6px 14px;
  background: rgba(46, 90, 58, 0.85);
  box-shadow: 0 0 0 2px #000;
  color: #eaffef;
  font-weight: 700;
  text-align: center;
}
.top-left {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  left: max(10px, env(safe-area-inset-left));
  width: calc(230px * var(--s));
}
.city-title {
  font-family: var(--font-title);
  font-size: calc(20px * var(--s));
  margin-bottom: 4px;
}
.mini-row {
  display: grid;
  grid-template-columns: 34px 1fr 38px;
  align-items: center;
  gap: 6px;
  font-size: calc(12px * var(--s));
  margin: 3px 0;
}
.mini-row em {
  font-style: normal;
  text-align: right;
}
.res {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 6px;
  font-size: calc(12px * var(--s));
}
.order {
  font-size: calc(11px * var(--s));
  margin-top: 4px;
}
.top-right {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  right: max(10px, env(safe-area-inset-right));
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}
.mini {
  width: calc(180px * var(--s));
  height: calc(180px * var(--s));
  padding: 3px;
}
.kills {
  text-align: right;
  font-size: calc(13px * var(--s));
  min-width: calc(180px * var(--s));
}
.combo {
  color: #ffb347;
  font-weight: 900;
}
.small {
  font-size: 11px;
}
.cross {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 14px;
}
.cross .dot {
  width: 6px;
  height: 6px;
  background: #fff;
  box-shadow: 0 0 0 2px #000;
}
.cross.valid .dot {
  background: var(--green-hi);
}
.cross.lock .dot {
  background: #ff8a3a;
  width: 10px;
  height: 10px;
}
.cross i {
  width: 10px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 0 0 1px #000;
}
.cross i.l {
  border-right: none;
}
.cross i.r {
  border-left: none;
}
.cross i.attached {
  border-color: var(--green-hi);
}
.cross i.flying {
  border-color: #ffe27a;
}
.cross em {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-style: normal;
  font-size: 11px;
  color: var(--green-hi);
}
.bottom-left {
  position: absolute;
  left: max(10px, env(safe-area-inset-left));
  bottom: max(10px, env(safe-area-inset-bottom));
  width: calc(270px * var(--s));
}
.vital {
  display: grid;
  grid-template-columns: 52px 1fr 64px;
  gap: 8px;
  align-items: center;
  margin: 4px 0;
  font-size: calc(12px * var(--s));
}
.vital b {
  text-align: right;
}
.bar.big {
  height: 12px;
}
.bottom-center {
  position: absolute;
  bottom: max(12px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.prompt {
  background: rgba(15, 10, 7, 0.75);
  padding: 4px 14px;
  box-shadow: 0 0 0 2px #000;
  font-weight: 700;
  color: var(--parchment);
}
.skills {
  display: flex;
  gap: 8px;
}
.skill {
  position: relative;
  width: calc(78px * var(--s));
  height: calc(54px * var(--s));
  background: rgba(15, 10, 7, 0.75);
  box-shadow: 0 0 0 2px #000, inset 0 0 0 1px #5a4330;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: calc(12px * var(--s));
  opacity: 0.7;
}
.skill.ready {
  opacity: 1;
  box-shadow: 0 0 0 2px #000, inset 0 0 0 2px var(--gold);
}
.skill.active {
  box-shadow: 0 0 0 2px #000, inset 0 0 0 2px var(--green-hi);
}
.skill kbd {
  position: absolute;
  top: 2px;
  left: 2px;
  font-size: 10px;
  min-width: 14px;
  padding: 0 3px;
}
.skill small {
  font-weight: 900;
  color: #ffe27a;
}
.skill .cd {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
}
.intermission {
  position: absolute;
  bottom: calc(110px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  font-size: calc(16px * var(--s));
}
.grabbed,
.respawn,
.titanform {
  position: absolute;
  top: 62%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  font-family: var(--font-title);
  font-size: calc(26px * var(--s));
  color: #ffd0c0;
  text-shadow: 3px 3px 0 #000;
}
.grabbed {
  color: #ff6a5a;
  animation: pulse 0.4s infinite;
}
.titanform {
  top: 120px;
  bottom: auto;
  font-size: calc(18px * var(--s));
  color: #9fffbf;
}
.hud.mobile .skills,
.hud.mobile .kills .small {
  display: none;
}
.hud.mobile .intermission {
  bottom: auto;
  top: 96px;
  font-size: 13px;
  padding: 5px 10px;
}
.hud.mobile .kills {
  margin-top: 0;
}
.hud.mobile .bottom-center {
  bottom: 6px;
}
@media (max-width: 900px), (max-height: 560px) {
  .top-left {
    width: 170px;
    padding: 5px 7px;
  }
  .order,
  .res span:nth-child(n + 3) {
    display: none;
  }
  .mini {
    width: 120px;
    height: 120px;
  }
  .kills {
    min-width: 120px;
    font-size: 11px;
  }
  .bottom-left {
    top: 150px;
    bottom: auto;
    width: 170px;
    padding: 4px 7px;
  }
  .vital {
    grid-template-columns: 30px 1fr 44px;
    gap: 4px;
    margin: 2px 0;
    font-size: 10px;
  }
  .top-center {
    width: 46vw;
  }
  .wave {
    font-size: 18px;
  }
}
</style>
