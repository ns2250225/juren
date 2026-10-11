<script setup lang="ts">
import { computed, ref } from 'vue'
import { TITANS, BESTIARY_ORDER, type TitanType } from '../data/titans'
import { useProfile } from '../stores/profile'
import { audio } from '../game/core/Audio'
import ModelPreview from './ModelPreview.vue'

const emit = defineEmits<{ back: [] }>()
const profile = useProfile()

const ANIMS: Record<TitanType, string[]> = {
  normal: ['idle', 'walk', 'smash', 'grab', 'bite'],
  abnormal: ['idle', 'run', 'crawl', 'roar', 'swipe'],
  armored: ['idle', 'walk', 'charge', 'smash', 'roar'],
  colossal: ['idle', 'walk', 'kick', 'swipe', 'steam'],
  female: ['idle', 'run', 'punch', 'kick', 'harden', 'dodge'],
  beast: ['idle', 'walk', 'throw', 'swipe', 'roar'],
  attack: ['idle', 'walk', 'punch', 'roar'],
}

const unlocked = (t: TitanType) => t === 'attack' || !!profile.bestiary[t]
const unlockedCount = computed(() => BESTIARY_ORDER.filter(unlocked).length)
const selected = ref<TitanType>(BESTIARY_ORDER.find(unlocked) ?? 'attack')
const def = computed(() => TITANS[selected.value])
const entry = computed(() => profile.bestiary[selected.value])
const isOpen = computed(() => unlocked(selected.value))
const heightText = computed(() => {
  const [a, b] = def.value.height
  return a === b ? `${a} 米` : `${a}–${b} 米`
})
const firstKill = computed(() => (entry.value ? new Date(entry.value.firstKill).toLocaleString() : '—'))

function pick(t: TitanType) {
  audio.play('uiClick')
  selected.value = t
}
function back() {
  audio.play('uiClick')
  emit('back')
}
</script>

<template>
  <div class="screen">
    <div class="screen-head">
      <h2 class="panel-title">巨人图鉴 <small>已解锁 {{ unlockedCount }} / {{ BESTIARY_ORDER.length }}</small></h2>
      <button class="btn" @click="back">返回</button>
    </div>
    <div class="screen-body scroll">
      <div class="layout">
        <div class="list">
          <div
            v-for="t in BESTIARY_ORDER"
            :key="t"
            class="card ent"
            :class="{ active: selected === t, locked: !unlocked(t) }"
            @click="pick(t)"
          >
            <template v-if="unlocked(t)">
              <b>{{ TITANS[t].name }}</b>
              <span v-if="TITANS[t].boss" class="tag tag-red">Boss</span>
            </template>
            <template v-else>
              <b class="muted">？？？</b>
              <span class="muted lock-hint">首次击杀后解锁</span>
            </template>
          </div>
        </div>

        <div class="panel detail">
          <div class="preview">
            <ModelPreview
              v-if="isOpen"
              kind="titan"
              :titan-type="selected"
              :anims="ANIMS[selected]"
              :export-name="def.name"
            />
            <div v-else class="locked-ph">
              <div class="sil" />
              <div class="muted">？？？ · 首次击杀后解锁</div>
            </div>
          </div>
          <div class="info">
            <template v-if="isOpen">
              <div class="row">
                <h3 class="nm">{{ def.name }}</h3>
                <span v-if="def.boss" class="tag tag-red">Boss</span>
              </div>
              <div class="kv"><span>类型</span><b>{{ def.name }}</b></div>
              <div class="kv"><span>身高</span><b>{{ heightText }}</b></div>
              <div class="kv"><span>攻击方式</span><b>{{ def.attack }}</b></div>
              <div class="kv"><span>移动速度</span><b>{{ def.speed }} m/s</b></div>
              <div class="kv"><span>弱点</span><b class="gold">{{ def.weakness }}</b></div>
              <p class="subtitle">{{ def.desc }}</p>
              <div class="kv"><span>首次击杀时间</span><b>{{ firstKill }}</b></div>
              <div class="kv"><span>累计击杀</span><b>{{ entry?.kills ?? 0 }}</b></div>
            </template>
            <template v-else>
              <h3 class="nm muted">？？？</h3>
              <p class="subtitle">尚未遭遇此类巨人。首次击杀后解锁详细情报与 3D 模型。</p>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(160px, 220px) 1fr; gap: 14px; min-height: 100%; }
.list { display: flex; flex-direction: column; gap: 8px; }
.ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ent.locked { background: rgba(10, 7, 5, 0.8); filter: grayscale(1); }
.lock-hint { font-size: 11px; }
.detail { display: grid; grid-template-columns: minmax(240px, 1.1fr) minmax(240px, 1fr); gap: 16px; align-items: start; }
.preview { height: 420px; }
.locked-ph {
  height: 100%; min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background: radial-gradient(ellipse at 50% 40%, rgba(40, 30, 22, 0.6), rgba(5, 4, 3, 0.95));
  border: 2px solid var(--line);
}
.sil {
  width: 90px; height: 170px; background: #050403; opacity: 0.85;
  clip-path: polygon(38% 0, 62% 0, 66% 14%, 92% 22%, 100% 58%, 86% 60%, 78% 34%, 72% 52%, 74% 100%, 56% 100%, 50% 64%, 44% 100%, 26% 100%, 28% 52%, 22% 34%, 14% 60%, 0 58%, 8% 22%, 34% 14%);
  box-shadow: 0 0 30px rgba(224, 180, 90, 0.2);
}
.info { display: flex; flex-direction: column; gap: 4px; }
.info .kv b { text-align: right; max-width: 70%; }
.nm { margin: 0 0 6px; font-family: var(--font-title); font-size: 24px; letter-spacing: 2px; font-weight: 400; color: var(--parchment); }
.subtitle { margin: 6px 0; }
@media (max-width: 900px) {
  .detail { grid-template-columns: 1fr; }
  .preview { height: 300px; }
}
@media (max-height: 520px) {
  .layout { grid-template-columns: 150px 1fr; gap: 10px; }
  .list { gap: 5px; }
  .ent { padding: 6px 8px; flex-wrap: wrap; }
  .detail { grid-template-columns: minmax(200px, 1fr) minmax(220px, 1fr); gap: 10px; }
  .preview { height: 250px; }
  .nm { font-size: 19px; }
}
@media (max-width: 600px) and (min-height: 521px) {
  .layout { grid-template-columns: 1fr; }
  .list { flex-direction: row; overflow-x: auto; }
  .ent { flex: 0 0 auto; }
}
</style>
