<script setup lang="ts">
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useSettings, type MobileBtnPos } from '../stores/settings'
import { useGame } from '../stores/game'
import { getEngine } from '../game/engineRef'
import type { Action } from '../game/core/InputManager'

const props = defineProps<{ edit: boolean }>()
const emit = defineEmits<{ doneEdit: [] }>()
const settings = useSettings()
const game = useGame()

interface Btn {
  id: string
  label: string
  action?: Action
  mode: 'hold' | 'tap' | 'fn'
  fn?: () => void
  x: number
  y: number
  s: number
  cls?: string
}

const DEFAULTS: Btn[] = [
  { id: 'jump', label: '跳跃', action: 'jump', mode: 'hold', x: 30, y: 84, s: 60 },
  { id: 'boost', label: '加速', action: 'boost', mode: 'hold', x: 35, y: 64, s: 60, cls: 'gas' },
  { id: 'slash', label: '斩击', action: 'slash', mode: 'tap', x: 89, y: 78, s: 92, cls: 'main' },
  { id: 'hookL', label: '左钩', action: 'hookL', mode: 'hold', x: 70, y: 79, s: 64, cls: 'hook' },
  { id: 'hookR', label: '右钩', action: 'hookR', mode: 'hold', x: 79, y: 58, s: 64, cls: 'hook' },
  { id: 'dual', label: '双钩', action: 'dualHook', mode: 'hold', x: 92, y: 53, s: 54, cls: 'hook' },
  { id: 'retract', label: '收回', action: 'retract', mode: 'tap', x: 68, y: 57, s: 46 },
  { id: 'lock', label: '锁定', action: 'lock', mode: 'tap', x: 84, y: 38, s: 46 },
  { id: 's1', label: '技能1', action: 'skill1', mode: 'tap', x: 58, y: 88, s: 50, cls: 'skill' },
  { id: 's2', label: '信号', action: 'skill2', mode: 'tap', x: 49, y: 91, s: 44, cls: 'skill' },
  { id: 's3', label: '冲刺', action: 'skill3', mode: 'tap', x: 60, y: 68, s: 48, cls: 'skill' },
  { id: 'interact', label: '补给F', action: 'interact', mode: 'tap', x: 51, y: 73, s: 44 },
  { id: 'reload', label: '换刀', action: 'reload', mode: 'tap', x: 79, y: 92, s: 42 },
]

const btns = reactive<Btn[]>(
  DEFAULTS.map((b) => {
    const o: MobileBtnPos | undefined = settings.mobileLayout[b.id]
    return o ? { ...b, x: o.x, y: o.y, s: o.s } : { ...b }
  }),
)
const topBtns = [
  { id: 'pause', label: '⏸', fn: () => getEngine()?.setPaused(true) },
  { id: 'map', label: '地图', fn: () => (game.mapOpen = !game.mapOpen) },
  { id: 'shop', label: '建设', fn: () => getEngine()?.toggleShop() },
  { id: 'order', label: '指令', fn: () => cycleOrder() },
  { id: 'next', label: '下一波', fn: () => getEngine()?.waves.skip() },
]
const orders = ['attack', 'defend', 'rally'] as const
let orderI = 0
function cycleOrder() {
  orderI = (orderI + 1) % 3
  getEngine()?.npcs.setOrder(orders[orderI])
}

const root = ref<HTMLDivElement>()
const stick = reactive({ active: false, id: -1, bx: 0, by: 0, kx: 0, ky: 0 })
const looks = new Map<number, { x: number; y: number }>()
const held = new Map<number, Btn>()
const dragging = ref<{ id: number; b: Btn } | null>(null)
const opacity = computed(() => settings.mobileOpacity)
const skillCd = (id: string) => {
  const i = id === 's1' ? 0 : id === 's2' ? 1 : id === 's3' ? 2 : -1
  const sk = i >= 0 ? game.hud.skills[i] : null
  return sk && sk.cd > 0 ? Math.ceil(sk.cd) : 0
}

function input() {
  return getEngine()?.input
}

function onBtnDown(e: PointerEvent, b: Btn) {
  e.preventDefault()
  e.stopPropagation()
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  if (props.edit) {
    dragging.value = { id: e.pointerId, b }
    return
  }
  const inp = input()
  if (!inp || !b.action) return
  if (b.mode === 'hold') inp.press(b.action)
  else inp.tap(b.action)
  held.set(e.pointerId, b)
  navigator.vibrate?.(8)
}
function onBtnUp(e: PointerEvent) {
  const b = held.get(e.pointerId)
  if (b?.action && b.mode === 'hold') input()?.release(b.action)
  held.delete(e.pointerId)
  if (dragging.value?.id === e.pointerId) {
    const d = dragging.value.b
    settings.mobileLayout = { ...settings.mobileLayout, [d.id]: { x: d.x, y: d.y, s: d.s } }
    settings.save()
    dragging.value = null
  }
}

function onZoneDown(e: PointerEvent) {
  if (props.edit) return
  const r = root.value!.getBoundingClientRect()
  const x = e.clientX - r.left, y = e.clientY - r.top
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  if (x < r.width * 0.42 && y > r.height * 0.35 && !stick.active) {
    stick.active = true
    stick.id = e.pointerId
    stick.bx = x
    stick.by = y
    stick.kx = 0
    stick.ky = 0
  } else looks.set(e.pointerId, { x: e.clientX, y: e.clientY })
}
function onMove(e: PointerEvent) {
  if (dragging.value && dragging.value.id === e.pointerId) {
    const r = root.value!.getBoundingClientRect()
    dragging.value.b.x = Math.max(3, Math.min(97, ((e.clientX - r.left) / r.width) * 100))
    dragging.value.b.y = Math.max(5, Math.min(95, ((e.clientY - r.top) / r.height) * 100))
    return
  }
  const inp = input()
  if (!inp) return
  if (stick.active && e.pointerId === stick.id) {
    const r = root.value!.getBoundingClientRect()
    let dx = e.clientX - r.left - stick.bx, dy = e.clientY - r.top - stick.by
    const m = Math.hypot(dx, dy), R = 55
    if (m > R) {
      dx = (dx / m) * R
      dy = (dy / m) * R
    }
    stick.kx = dx
    stick.ky = dy
    inp.stickX = dx / R
    inp.stickY = -dy / R
    return
  }
  const l = looks.get(e.pointerId)
  if (l) {
    inp.look((e.clientX - l.x) * 1.7 * settings.sensitivity, (e.clientY - l.y) * 1.7 * settings.sensitivity)
    l.x = e.clientX
    l.y = e.clientY
  }
}
function onUp(e: PointerEvent) {
  onBtnUp(e)
  if (stick.active && e.pointerId === stick.id) {
    stick.active = false
    const inp = input()
    if (inp) inp.stickX = inp.stickY = 0
  }
  looks.delete(e.pointerId)
}

function resizeBtn(b: Btn, d: number) {
  b.s = Math.max(36, Math.min(120, b.s + d))
  settings.mobileLayout = { ...settings.mobileLayout, [b.id]: { x: b.x, y: b.y, s: b.s } }
  settings.save()
}
function resetLayout() {
  settings.mobileLayout = {}
  settings.save()
  DEFAULTS.forEach((d, i) => Object.assign(btns[i], d))
}

onMounted(() => {
  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
  input()?.clearAll()
})
</script>

<template>
  <div ref="root" class="touch" :class="{ edit }" :style="{ '--op': opacity }" @pointerdown="onZoneDown">
    <div v-if="stick.active" class="stick" :style="{ left: stick.bx + 'px', top: stick.by + 'px' }">
      <div class="knob" :style="{ transform: `translate(${stick.kx}px, ${stick.ky}px)` }"></div>
    </div>
    <div v-else class="stick-hint">移动</div>
    <button
      v-for="b in btns"
      :key="b.id"
      class="tbtn"
      :class="[b.cls, { dragging: dragging?.b === b }]"
      :style="{ left: b.x + '%', top: b.y + '%', width: b.s + 'px', height: b.s + 'px', fontSize: Math.max(11, b.s / 5) + 'px' }"
      @pointerdown="onBtnDown($event, b)"
    >
      {{ b.label }}
      <em v-if="skillCd(b.id)" class="cdn">{{ skillCd(b.id) }}</em>
      <span v-if="edit" class="sz">
        <i @pointerdown.stop="resizeBtn(b, -6)">−</i><i @pointerdown.stop="resizeBtn(b, 6)">＋</i>
      </span>
    </button>
    <div class="topbar">
      <button v-for="b in topBtns" :key="b.id" class="tbtn small" @pointerdown.stop.prevent="b.fn()">{{ b.label }}</button>
    </div>
    <div v-if="edit" class="edit-bar panel" @pointerdown.stop>
      <b>调整触控布局</b>：拖动按钮移动位置，− / ＋ 调整大小
      <button class="btn btn-sm" @click="resetLayout">恢复默认</button>
      <button class="btn btn-sm btn-green" @click="emit('doneEdit')">完成</button>
    </div>
  </div>
</template>

<style scoped>
.touch {
  position: absolute;
  inset: 0;
  z-index: 10;
  touch-action: none;
}
.tbtn {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 3px solid rgba(255, 240, 210, 0.55);
  background: rgba(30, 20, 14, 0.55);
  color: #fff;
  font-weight: 900;
  opacity: var(--op);
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: 1px 1px 0 #000;
  padding: 0;
}
.tbtn:active {
  background: rgba(200, 160, 90, 0.6);
}
.tbtn.main {
  background: rgba(150, 40, 30, 0.6);
  border-color: rgba(255, 180, 160, 0.7);
}
.tbtn.hook {
  background: rgba(40, 70, 50, 0.6);
}
.tbtn.gas {
  background: rgba(60, 100, 140, 0.55);
}
.tbtn.skill {
  background: rgba(120, 90, 30, 0.6);
}
.tbtn.small {
  position: static;
  transform: none;
  width: auto;
  height: 30px;
  border-radius: 4px;
  padding: 0 10px;
  font-size: 12px;
}
.topbar {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  margin-top: 64px;
}
.stick {
  position: absolute;
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.2);
  opacity: var(--op);
}
.knob {
  position: absolute;
  left: 35px;
  top: 35px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 240, 210, 0.6);
}
.stick-hint {
  position: absolute;
  left: 12%;
  bottom: 14%;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
  pointer-events: none;
  opacity: var(--op);
}
.edit .tbtn {
  border-style: dashed;
  opacity: 1;
}
.tbtn.dragging {
  border-color: #ffe27a;
}
.sz {
  position: absolute;
  bottom: -22px;
  display: flex;
  gap: 4px;
}
.sz i {
  font-style: normal;
  background: #3a2a1e;
  width: 22px;
  height: 20px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cdn {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-style: normal;
  color: #ffe27a;
}
.edit-bar {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  padding: 10px 14px;
}
</style>
