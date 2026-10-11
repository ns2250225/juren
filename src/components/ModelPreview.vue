<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { PreviewScene } from '../game/scenes/PreviewScene'
import type { TitanType } from '../data/titans'
import type { CharacterLook } from '../data/characters'
import { audio } from '../game/core/Audio'

const props = withDefaults(
  defineProps<{
    kind: 'titan' | 'character'
    titanType?: TitanType
    look?: CharacterLook
    anims?: string[]
    exportName?: string
  }>(),
  { anims: () => ['idle'], exportName: 'model' },
)

const ANIM_LABEL: Record<string, string> = {
  idle: '待机', walk: '行走', run: '奔跑', smash: '捶击', swipe: '横扫', grab: '抓取', roar: '咆哮',
  kick: '踢击', throw: '投掷', punch: '重拳', harden: '硬质化', steam: '蒸汽', charge: '冲锋', bite: '啃咬',
  crawl: '爬行', fly: '飞行', slash: '斩击', jump: '跳跃', spin: '旋转', cheer: '欢呼', dodge: '闪避',
  stunned: '硬直', knockdown: '倒地', death: '死亡', bound: '束缚',
}

const canvas = ref<HTMLCanvasElement | null>(null)
const scene = shallowRef<PreviewScene | null>(null)
const current = ref('idle')
const exporting = ref(false)

function show() {
  const s = scene.value
  if (!s) return
  current.value = props.anims[0] ?? 'idle'
  s.setAnim(current.value)
  if (props.kind === 'titan' && props.titanType) s.showTitan(props.titanType)
  else if (props.kind === 'character' && props.look) s.showCharacter(props.look)
}

function pick(a: string) {
  audio.play('uiClick')
  current.value = a
  scene.value?.setAnim(a)
}

async function doExport() {
  if (!scene.value || exporting.value) return
  audio.play('uiClick')
  exporting.value = true
  try {
    await scene.value.exportGLB(props.exportName)
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  if (!canvas.value) return
  scene.value = new PreviewScene(canvas.value)
  show()
})
onBeforeUnmount(() => {
  scene.value?.dispose()
  scene.value = null
})
watch([() => props.kind, () => props.titanType, () => props.look, () => props.anims.join(',')], show)
</script>

<template>
  <div class="mp">
    <div class="stage">
      <canvas ref="canvas" class="cv" />
      <div class="hint">拖动旋转 · 滚轮缩放</div>
    </div>
    <div class="ctrl">
      <button
        v-for="a in anims"
        :key="a"
        class="btn btn-sm"
        :class="current === a ? 'btn-gold' : 'btn-ghost'"
        @click="pick(a)"
      >{{ ANIM_LABEL[a] ?? a }}</button>
      <span class="spacer" />
      <button class="btn btn-sm btn-ghost" :disabled="exporting" @click="doExport">导出 GLB</button>
    </div>
  </div>
</template>

<style scoped>
.mp { display: flex; flex-direction: column; gap: 8px; width: 100%; height: 100%; min-height: 260px; }
.stage {
  position: relative; flex: 1; min-height: 220px;
  background: radial-gradient(ellipse at 50% 40%, rgba(90, 67, 48, 0.45), rgba(10, 7, 5, 0.9));
  border: 2px solid var(--line); box-shadow: 0 0 0 2px #0a0705;
}
.cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
.cv:active { cursor: grabbing; }
.hint { position: absolute; left: 8px; bottom: 6px; font-size: 11px; color: var(--text-faint); pointer-events: none; }
.ctrl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.spacer { flex: 1; }
@media (max-height: 520px) {
  .mp { min-height: 200px; }
  .stage { min-height: 150px; }
  .ctrl .btn-sm { padding: 4px 8px; font-size: 12px; }
}
</style>
