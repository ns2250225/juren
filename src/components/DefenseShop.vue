<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { getEngine } from '../game/engineRef'
import { drawMap, mapToWorld, worldToMap, type View } from '../utils/mapDraw'
import { DEFENSES, DEFENSE_ORDER, type DefenseType } from '../data/defenses'
import type { Slot } from '../game/world/CityManager'
import { audio } from '../game/core/Audio'

const emit = defineEmits<{ close: [] }>()
const cv = ref<HTMLCanvasElement>()
const tick = ref(0)
const selected = ref<number>(-1)
const msg = ref('')
let view: View | null = null
let timer = 0
const KIND_NAME = { wall: '城墙槽位', ground: '城内槽位', trap: '陷阱槽位', core: '内城防线槽位' }

const e = () => getEngine()!
const res = computed(() => {
  void tick.value
  const r = e().resources
  return { funds: r.funds, materials: Math.round(r.materials) }
})
const slot = computed<Slot | null>(() => {
  void tick.value
  return e().city.slots.find((s) => s.id === selected.value) ?? null
})
const fac = computed(() => {
  void tick.value
  return slot.value ? e().defense.bySlot(slot.value.id) : null
})
const options = computed(() => (slot.value ? DEFENSE_ORDER.filter((t) => DEFENSES[t].slot === slot.value!.kind) : []))
const repairs = computed(() => {
  void tick.value
  const g = e()
  return (['walls', 'gate', 'city'] as const).map((k) => ({ k, name: k === 'walls' ? '修复全部城墙' : k === 'gate' ? '修复城门' : '修复城市建筑', cost: g.repairCost(k) }))
})
const counts = computed(() => {
  void tick.value
  const m = new Map<DefenseType, number>()
  for (const f of e().defense.facilities) if (f.alive) m.set(f.type, (m.get(f.type) ?? 0) + 1)
  return m
})

function flash(t: string) {
  msg.value = t
  setTimeout(() => {
    if (msg.value === t) msg.value = ''
  }, 2000)
}
function affordable(c: { funds: number; materials: number }) {
  return res.value.funds >= c.funds && res.value.materials >= c.materials
}
function build(t: DefenseType) {
  if (!slot.value) return
  if (e().defense.build(slot.value, t)) flash(`已建造 ${DEFENSES[t].name}`)
  else flash('资源不足或槽位不可用（城墙缺口处无法建造）')
  tick.value++
  draw()
}
function upgrade() {
  if (slot.value && e().defense.upgrade(slot.value)) flash('升级完成')
  else flash('资源不足')
  tick.value++
}
function sell() {
  if (!slot.value) return
  e().defense.sell(slot.value)
  audio.play('uiClick')
  flash('已拆除（返还 50% 资源）')
  tick.value++
  draw()
}
function repair(k: 'walls' | 'gate' | 'city') {
  if (!e().repair(k)) flash('无需修复或资源不足')
  tick.value++
}
function startNext() {
  e().waves.skip()
  emit('close')
}

function draw() {
  const c = cv.value
  const g = getEngine()
  if (!c || !g) return
  const rect = c.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio)
  c.width = Math.round(rect.width * dpr)
  c.height = Math.round(rect.height * dpr)
  const d = g.mapData()
  const R = d.radius
  const ext = d.layout === 'district' ? { x0: -R - 40, x1: R + 40, z0: -20, z1: R + 110 } : { x0: -R - 20, x1: R + 20, z0: -250, z1: 110 }
  const scale = Math.min(c.width / (ext.x1 - ext.x0), c.height / (ext.z1 - ext.z0))
  view = { cx: (ext.x0 + ext.x1) / 2, cz: (ext.z0 + ext.z1) / 2, scale, w: c.width, h: c.height }
  const occ = new Set(g.defense.facilities.filter((f) => f.alive).map((f) => f.slot.id))
  drawMap(c.getContext('2d')!, d, view, { slots: g.city.slots, selected: selected.value, occupied: occ, detectAll: true })
}

function onClick(ev: MouseEvent) {
  const c = cv.value
  if (!c || !view) return
  const r = c.getBoundingClientRect()
  const dpr = c.width / r.width
  const px = (ev.clientX - r.left) * dpr, py = (ev.clientY - r.top) * dpr
  let best = -1, bd = 22 * dpr
  for (const s of e().city.slots) {
    const [x, y] = worldToMap(view, s.pos.x, s.pos.z)
    const d = Math.hypot(x - px, y - py)
    if (d < bd) {
      bd = d
      best = s.id
    }
  }
  void mapToWorld
  if (best >= 0) {
    selected.value = best
    audio.play('uiClick')
    draw()
  }
}

onMounted(() => {
  const free = e().city.slots.find((s) => s.kind === 'wall' && !e().defense.bySlot(s.id))
  selected.value = free?.id ?? 0
  draw()
  timer = window.setInterval(() => {
    tick.value++
    draw()
  }, 500)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="shop-wrap" @click.stop>
    <div class="panel shop">
      <div class="head row">
        <h2 class="panel-title">防御建设 <small>波次间隙 · 点击地图上的槽位</small></h2>
        <span class="spacer"></span>
        <span class="res">💰 <b>{{ res.funds }}</b> · 🧱 <b>{{ res.materials }}</b></span>
        <button class="btn btn-primary btn-sm" @click="startNext">开始下一波</button>
        <button class="btn btn-sm" @click="emit('close')">关闭 (B)</button>
      </div>
      <div class="body">
        <div class="map">
          <canvas ref="cv" @click="onClick"></canvas>
          <div class="legend muted">□ 城墙槽位 · ◇ 城内槽位 · ○ 陷阱槽位 · ◎ 内城防线 · 金色 = 已建造</div>
        </div>
        <div class="side scroll">
          <template v-if="slot">
            <div class="sec">{{ KIND_NAME[slot.kind] }} #{{ slot.id }}</div>
            <template v-if="fac">
              <div class="fac-name">{{ fac.def.icon }} {{ fac.def.name }} <span class="tag tag-gold">Lv.{{ fac.level }}</span></div>
              <p class="subtitle">{{ fac.def.desc }}</p>
              <div class="kv" v-if="fac.range"><span>作用范围</span><b>{{ fac.range }} m</b></div>
              <div class="kv"><span>耐久</span><b>{{ Math.max(0, Math.round(fac.hp)) }} / {{ fac.maxHp }}</b></div>
              <div class="row" style="margin-top: 8px">
                <button v-if="fac.level < 3" class="btn btn-gold btn-sm" :disabled="!affordable(fac.def.upgrade[fac.level - 1])" @click="upgrade">
                  升级 Lv.{{ fac.level + 1 }}（💰{{ fac.def.upgrade[fac.level - 1].funds }} 🧱{{ fac.def.upgrade[fac.level - 1].materials }}）
                </button>
                <span v-else class="tag tag-green">已满级</span>
                <button class="btn btn-sm" @click="sell">拆除</button>
              </div>
            </template>
            <template v-else>
              <div v-for="t in options" :key="t" class="opt card" :class="{ locked: !affordable(DEFENSES[t].cost) }">
                <div class="row">
                  <b>{{ DEFENSES[t].icon }} {{ DEFENSES[t].name }}</b>
                  <span class="spacer"></span>
                  <small class="muted">已有 {{ counts.get(t) ?? 0 }}</small>
                </div>
                <p class="subtitle">{{ DEFENSES[t].desc }}</p>
                <button class="btn btn-green btn-sm" :disabled="!affordable(DEFENSES[t].cost)" @click="build(t)">建造（💰{{ DEFENSES[t].cost.funds }} 🧱{{ DEFENSES[t].cost.materials }}）</button>
              </div>
            </template>
          </template>
          <div class="sec" style="margin-top: 14px">城防修复</div>
          <div v-for="r in repairs" :key="r.k" class="kv rep">
            <span>{{ r.name }}</span>
            <button class="btn btn-sm" :disabled="r.cost.materials <= 0 || !affordable(r.cost)" @click="repair(r.k)">
              {{ r.cost.materials <= 0 ? '完好' : `💰${r.cost.funds} 🧱${r.cost.materials}` }}
            </button>
          </div>
          <div v-if="msg" class="msg">{{ msg }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shop-wrap {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}
.shop {
  width: min(1100px, 96vw);
  height: min(680px, 92vh);
  display: flex;
  flex-direction: column;
}
.head {
  flex-wrap: wrap;
}
.head .panel-title {
  margin: 0;
}
.res {
  font-size: 15px;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 14px;
  margin-top: 10px;
}
.map {
  position: relative;
  min-height: 0;
  box-shadow: 0 0 0 3px #0a0705;
}
.map canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}
.legend {
  position: absolute;
  bottom: 6px;
  left: 8px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.6);
  padding: 2px 6px;
}
.side {
  overflow: auto;
  min-height: 0;
  padding-right: 4px;
}
.sec {
  color: var(--gold);
  font-weight: 900;
  letter-spacing: 2px;
  font-size: 13px;
  margin-bottom: 8px;
}
.fac-name {
  font-size: 20px;
  font-weight: 900;
  margin-bottom: 6px;
}
.opt {
  margin-bottom: 8px;
  cursor: default;
}
.opt p {
  margin: 4px 0 8px;
}
.rep {
  align-items: center;
}
.msg {
  margin-top: 10px;
  color: #ffe27a;
  font-weight: 700;
}
@media (max-width: 760px), (max-height: 520px) {
  .body {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
