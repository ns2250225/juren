<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { STATS, statCost, EQUIPMENT, type EquipSlot, type StatDef, type EquipDef } from '../data/upgrades'
import { useProfile } from '../stores/profile'
import { audio } from '../game/core/Audio'

const emit = defineEmits<{ back: [] }>()
const profile = useProfile()

const SLOTS: { id: EquipSlot; name: string }[] = [
  { id: 'odm', name: '立体机动装置' },
  { id: 'hook', name: '钩索' },
  { id: 'gas', name: '瓦斯' },
  { id: 'blade', name: '刀刃' },
]
const itemsOf = (slot: EquipSlot) => EQUIPMENT.filter((e) => e.slot === slot)

const flash = ref<{ text: string; ok: boolean } | null>(null)
let flashTimer = 0
function showFlash(text: string, ok: boolean) {
  flash.value = { text, ok }
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (flash.value = null), 1800)
}
onBeforeUnmount(() => clearTimeout(flashTimer))

const level = (s: StatDef) => profile.upgrades[s.id] ?? 0
const maxed = (s: StatDef) => level(s) >= Math.min(5, s.max)

function buyStat(s: StatDef) {
  audio.play('uiClick')
  const lv = level(s)
  if (profile.buyStat(s.id)) showFlash(`${s.name} 升至 Lv.${lv + 1}`, true)
  else showFlash(maxed(s) ? '已达到最高等级' : '战功点数不足', false)
}
function buyEquip(e: EquipDef) {
  audio.play('uiClick')
  if (profile.buyEquip(e.id)) showFlash(`已购买并装备：${e.name}`, true)
  else showFlash('战功点数不足', false)
}
function equip(e: EquipDef) {
  audio.play('uiClick')
  profile.equip(e.id)
  showFlash(`已装备：${e.name}`, true)
}
function back() {
  audio.play('uiClick')
  emit('back')
}
</script>

<template>
  <div class="screen">
    <div class="screen-head">
      <h2 class="panel-title">装备与升级</h2>
      <span class="spacer" />
      <div class="merit">战功点数 <b class="gold">{{ profile.merit }}</b></div>
      <button class="btn" @click="back">返回</button>
    </div>
    <div class="screen-body scroll">
      <transition name="fl">
        <div v-if="flash" class="flash" :class="flash.ok ? 'ok' : 'bad'">{{ flash.text }}</div>
      </transition>

      <div class="sec-title">角色升级</div>
      <div class="stats">
        <div v-for="s in STATS" :key="s.id" class="card st">
          <div class="row">
            <b>{{ s.name }}</b>
            <span class="spacer" />
            <span class="green bonus">+{{ level(s) * s.per }}{{ s.unit }}</span>
          </div>
          <div class="muted desc">{{ s.desc }}（每级 +{{ s.per }}{{ s.unit }}）</div>
          <div class="row">
            <div class="pips">
              <i v-for="n in 5" :key="n" :class="{ on: n <= level(s) }" />
            </div>
            <span class="spacer" />
            <button
              class="btn btn-sm"
              :class="maxed(s) ? 'btn-ghost' : 'btn-gold'"
              :disabled="maxed(s) || profile.merit < statCost(level(s))"
              @click="buyStat(s)"
            >{{ maxed(s) ? '已满级' : `升级 ${statCost(level(s))}` }}</button>
          </div>
        </div>
      </div>

      <div class="sec-title">装备</div>
      <div class="slots">
        <div v-for="sl in SLOTS" :key="sl.id" class="panel slot">
          <div class="slot-name">{{ sl.name }}</div>
          <div
            v-for="e in itemsOf(sl.id)"
            :key="e.id"
            class="item"
            :class="{ eq: profile.equipped[sl.id] === e.id }"
          >
            <div class="it-txt">
              <b>{{ e.name }}</b>
              <div class="muted desc">{{ e.desc }}</div>
            </div>
            <template v-if="profile.owned.includes(e.id)">
              <button
                class="btn btn-sm"
                :class="profile.equipped[sl.id] === e.id ? 'btn-green' : 'btn-ghost'"
                :disabled="profile.equipped[sl.id] === e.id"
                @click="equip(e)"
              >{{ profile.equipped[sl.id] === e.id ? '已装备' : '装备' }}</button>
            </template>
            <button
              v-else
              class="btn btn-sm btn-gold"
              :disabled="profile.merit < e.cost"
              @click="buyEquip(e)"
            >购买 {{ e.cost }} 战功</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen-head .panel-title { margin: 0; }
.merit { font-size: 15px; color: var(--text-dim); background: rgba(0, 0, 0, 0.35); padding: 6px 12px; box-shadow: 0 0 0 2px var(--line); }
.merit b { font-size: 20px; font-family: var(--font-title); margin-left: 4px; }
.screen-body { position: relative; }
.sec-title { font-family: var(--font-title); font-size: 18px; letter-spacing: 2px; color: var(--gold); margin: 4px 0 8px; }
.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-bottom: 16px; }
.st { cursor: default; display: flex; flex-direction: column; gap: 6px; }
.desc { font-size: 12px; }
.bonus { font-weight: 700; }
.pips { display: flex; gap: 4px; }
.pips i { width: 16px; height: 10px; background: #0d0907; box-shadow: 0 0 0 2px #0a0705; }
.pips i.on { background: var(--gold); }
.slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.slot { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.slot-name { font-weight: 900; color: var(--parchment); letter-spacing: 1px; }
.item { display: flex; align-items: center; gap: 10px; padding: 8px; background: rgba(0, 0, 0, 0.25); border: 2px solid var(--line); }
.item.eq { border-color: var(--green); }
.it-txt { flex: 1; min-width: 0; }
.it-txt b { font-size: 14px; }
.flash {
  position: sticky; top: 0; z-index: 5; margin: 0 auto 8px; width: fit-content; max-width: 90%;
  padding: 8px 16px; font-weight: 700; box-shadow: 0 0 0 2px #0a0705, 0 6px 20px rgba(0, 0, 0, 0.5);
}
.flash.ok { background: #234a30; color: #d0ffd8; }
.flash.bad { background: #6e1f19; color: #ffd8d0; }
.fl-enter-active, .fl-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fl-enter-from, .fl-leave-to { opacity: 0; transform: translateY(-6px); }
@media (max-height: 520px) {
  .stats { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .st { padding: 8px; gap: 4px; }
  .slots { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
}
</style>
