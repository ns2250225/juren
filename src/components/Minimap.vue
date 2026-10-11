<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { getEngine } from '../game/engineRef'
import { drawMap, type View } from '../utils/mapDraw'

const props = defineProps<{ big?: boolean }>()
const cv = ref<HTMLCanvasElement>()
let timer = 0
const t0 = performance.now()

function draw() {
  const e = getEngine()
  const c = cv.value
  if (!e || !e.ready || !c) return
  const rect = c.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio)
  const w = Math.max(10, Math.round(rect.width * dpr)), h = Math.max(10, Math.round(rect.height * dpr))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const ctx = c.getContext('2d')!
  const d = e.mapData()
  let v: View
  if (props.big) {
    const R = d.radius
    const ext = d.layout === 'district' ? { x0: -R - 320, x1: R + 320, z0: -60, z1: R + 360 } : { x0: -R - 120, x1: R + 120, z0: -270, z1: 420 }
    const scale = Math.min(w / (ext.x1 - ext.x0), h / (ext.z1 - ext.z0))
    v = { cx: (ext.x0 + ext.x1) / 2, cz: (ext.z0 + ext.z1) / 2, scale, w, h }
  } else {
    v = { cx: d.player.x, cz: d.player.z, scale: 0.55 * dpr, w, h }
  }
  ctx.save()
  drawMap(ctx, d, v, { t: (performance.now() - t0) / 1000 })
  ctx.restore()
}

onMounted(() => {
  draw()
  timer = window.setInterval(draw, props.big ? 200 : 150)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="minimap" :class="{ big }">
    <canvas ref="cv"></canvas>
    <div v-if="big" class="legend">
      <span><i style="background: #ffe27a"></i>你</span>
      <span><i style="background: #e04a3a"></i>巨人</span>
      <span><i style="background: #ff8a3a"></i>奇行种</span>
      <span><i style="background: #ff2a2a"></i>Boss</span>
      <span><i style="background: #6fd08a"></i>调查兵团</span>
      <span><i style="background: #e07a5a"></i>驻屯兵团</span>
      <span><i style="background: #f4efe0"></i>居民</span>
      <span><i style="background: #ffcf6a"></i>防御设施</span>
      <span><i style="background: #ffd25a"></i>内城核心</span>
      <span><i style="background: #5aa0d0"></i>补给站</span>
      <span class="muted">墙体颜色 = 耐久 · 红色虚线 = 缺口 · 仅显示侦察范围内的巨人</span>
    </div>
  </div>
</template>

<style scoped>
.minimap {
  position: relative;
  width: 100%;
  height: 100%;
}
canvas {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
}
.legend {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 12px;
  background: rgba(10, 7, 5, 0.7);
  padding: 6px 10px;
  max-width: 70%;
}
.legend i {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 4px;
  box-shadow: 0 0 0 1px #000;
}
</style>
