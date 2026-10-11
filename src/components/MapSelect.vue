<script setup lang="ts">
import { MAPS, MODES, type MapId, type GameMode } from '../data/maps'
import { useProfile } from '../stores/profile'
import { audio } from '../game/core/Audio'

const emit = defineEmits<{ back: [] }>()
const profile = useProfile()

function pickMap(id: MapId) {
  audio.play('uiClick')
  profile.selectedMap = id
  profile.save()
}
function pickMode(id: GameMode) {
  audio.play('uiClick')
  profile.selectedMode = id
  profile.save()
}
function back() {
  audio.play('uiClick')
  emit('back')
}
</script>

<template>
  <div class="screen">
    <div class="screen-head">
      <h2 class="panel-title">选择战场 <small>地图与模式</small></h2>
      <button class="btn" @click="back">返回</button>
    </div>
    <div class="screen-body scroll">
      <div class="sec-title">作战模式</div>
      <div class="modes">
        <button
          v-for="m in MODES"
          :key="m.id"
          class="card mode"
          :class="{ active: profile.selectedMode === m.id }"
          @click="pickMode(m.id)"
        >
          <b>{{ m.name }}</b>
          <span class="muted">{{ m.desc }}</span>
        </button>
      </div>

      <div class="sec-title">地图</div>
      <div class="maps">
        <div
          v-for="m in MAPS"
          :key="m.id"
          class="card map"
          :class="{ active: profile.selectedMap === m.id }"
          @click="pickMap(m.id)"
        >
          <div class="thumb" :style="{ background: `linear-gradient(180deg, ${m.preview.sky} 0%, ${m.preview.sky} 48%, ${m.preview.ground} 52%, ${m.preview.ground} 100%)` }">
            <div class="wall" :class="m.layout" />
            <span class="tag lay">{{ m.layout === 'district' ? '环形城区' : '直线城墙' }}</span>
            <span v-if="profile.selectedMap === m.id" class="tag tag-gold sel">已选择</span>
          </div>
          <div class="m-body">
            <div class="row"><b class="m-name">{{ m.name }}</b></div>
            <div class="muted m-sub">{{ m.subtitle }}</div>
            <p class="subtitle m-desc">{{ m.desc }}</p>
            <div class="rec">
              <template v-if="profile.records[m.id]">
                <span>最高波次 <b class="gold">{{ profile.records[m.id]!.bestWave }}</b></span>
                <span>最高分 <b class="gold">{{ profile.records[m.id]!.bestScore }}</b></span>
                <span>胜利 <b class="green">{{ profile.records[m.id]!.wins }}</b></span>
              </template>
              <span v-else class="muted">暂无战绩</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sec-title { font-family: var(--font-title); font-size: 18px; letter-spacing: 2px; color: var(--gold); margin: 4px 0 8px; }
.modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }
.mode { display: flex; flex-direction: column; gap: 4px; text-align: left; color: var(--text); font: inherit; }
.mode b { font-size: 15px; }
.mode span { font-size: 12px; }
.maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.map { padding: 0; display: flex; flex-direction: column; }
.thumb { position: relative; height: 110px; overflow: hidden; border-bottom: 2px solid var(--line); image-rendering: pixelated; }
.wall { position: absolute; background: repeating-linear-gradient(90deg, #e8dcc0 0 12px, #cfc2a6 12px 14px); box-shadow: 0 3px 0 rgba(0, 0, 0, 0.4); }
.wall.line { left: 0; right: 0; top: 40%; height: 18px; }
.wall.district { left: 50%; top: 30%; width: 120px; height: 60px; transform: translateX(-50%); border-radius: 50% 50% 0 0; background: transparent; border: 8px solid #e8dcc0; border-bottom: none; }
.lay { position: absolute; left: 8px; top: 8px; }
.sel { position: absolute; right: 8px; top: 8px; }
.m-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.m-name { font-size: 17px; color: var(--parchment); }
.m-sub { font-size: 12px; }
.m-desc { margin: 4px 0; font-size: 12px; flex: 1; }
.rec { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--text-dim); border-top: 1px dashed var(--line); padding-top: 6px; }
@media (max-height: 520px) {
  .thumb { height: 70px; }
  .maps { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .m-desc { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .mode { padding: 8px; }
}
</style>
