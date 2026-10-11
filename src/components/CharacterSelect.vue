<script setup lang="ts">
import { computed, ref } from 'vue'
import { CHARACTERS, COMMON_SKILLS, type CharacterId } from '../data/characters'
import { useProfile } from '../stores/profile'
import { audio } from '../game/core/Audio'
import ModelPreview from './ModelPreview.vue'

const emit = defineEmits<{ back: [] }>()
const profile = useProfile()

const viewing = ref<CharacterId>(profile.selectedChar)
const char = computed(() => CHARACTERS.find((c) => c.id === viewing.value) ?? CHARACTERS[0])
const isSelected = computed(() => profile.selectedChar === char.value.id)
const ANIMS = ['idle', 'run', 'fly', 'slash', 'spin']

const statRows = computed(() => {
  const s = char.value.stats
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return [
    { label: '生命值', value: String(s.hp), ratio: s.hp / 140 },
    { label: '机动速度', value: pct(s.speed), ratio: s.speed / 1.3 },
    { label: '瓦斯效率', value: pct(1 / s.gasEff), ratio: 1 / s.gasEff / 1.4 },
    { label: '斩击伤害', value: pct(s.damage), ratio: s.damage / 1.6 },
    { label: '刀刃耐久', value: pct(s.bladeDur), ratio: s.bladeDur / 1.5 },
    { label: '钩索射程加成', value: s.hookRange ? `+${s.hookRange}m` : '—', ratio: s.hookRange / 15 },
  ]
})

function view(id: CharacterId) {
  audio.play('uiClick')
  viewing.value = id
}
function select() {
  audio.play('uiClick')
  profile.selectedChar = char.value.id
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
      <h2 class="panel-title">选择角色 <small>调查兵团精英</small></h2>
      <button class="btn" @click="back">返回</button>
    </div>
    <div class="screen-body scroll">
      <div class="layout">
        <div class="list">
          <div
            v-for="c in CHARACTERS"
            :key="c.id"
            class="card ch"
            :class="{ active: viewing === c.id }"
            :style="{ '--accent': c.accent }"
            @click="view(c.id)"
          >
            <i class="stripe" />
            <div class="ch-txt">
              <div class="ch-name">{{ c.name }}</div>
              <div class="muted ch-role">{{ c.role }}</div>
            </div>
            <span v-if="profile.selectedChar === c.id" class="tag tag-green">出战</span>
          </div>
        </div>

        <div class="panel main">
          <div class="preview">
            <ModelPreview kind="character" :look="char.look" :anims="ANIMS" :export-name="char.name" />
          </div>
          <div class="info">
            <div class="row">
              <h3 class="nm" :style="{ color: char.accent }">{{ char.name }}</h3>
              <span class="tag">{{ char.role }}</span>
            </div>
            <p class="subtitle">{{ char.desc }}</p>
            <div class="stats">
              <div v-for="r in statRows" :key="r.label" class="stat">
                <div class="kv"><span>{{ r.label }}</span><b>{{ r.value }}</b></div>
                <div class="bar"><i :style="{ width: Math.min(100, Math.max(0, r.ratio * 100)) + '%', background: char.accent }" /></div>
              </div>
            </div>
            <div class="skill sig">
              <div class="row">
                <kbd>1</kbd><b class="gold">{{ char.skillName }}</b>
                <span class="spacer" />
                <span class="tag">冷却 {{ char.skillCooldown }} 秒</span>
              </div>
              <div class="subtitle">{{ char.skillDesc }}</div>
            </div>
            <div v-for="s in COMMON_SKILLS" :key="s.id" class="skill">
              <div class="row">
                <kbd>{{ s.key }}</kbd><b>{{ s.name }}</b>
                <span class="spacer" />
                <span class="tag">冷却 {{ s.cooldown }} 秒</span>
              </div>
              <div class="subtitle">{{ s.desc }}</div>
            </div>
            <button
              class="btn btn-block"
              :class="isSelected ? 'btn-green' : 'btn-primary'"
              :disabled="isSelected"
              @click="select"
            >{{ isSelected ? '✔ 已选择' : '选择该角色' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(180px, 240px) 1fr; gap: 14px; min-height: 100%; }
.list { display: flex; flex-direction: column; gap: 10px; }
.ch { position: relative; display: flex; align-items: center; gap: 10px; padding-left: 18px; }
.stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--accent); }
.ch-txt { flex: 1; min-width: 0; }
.ch-name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ch-role { font-size: 12px; }
.main { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(260px, 1fr); gap: 16px; align-items: start; }
.preview { height: 420px; }
.info { display: flex; flex-direction: column; gap: 10px; }
.nm { margin: 0; font-family: var(--font-title); font-size: 24px; letter-spacing: 2px; font-weight: 400; }
.subtitle { margin: 0; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
.stat .bar { height: 8px; }
.skill { background: rgba(0, 0, 0, 0.25); border: 1px solid var(--line); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.skill.sig { border-color: var(--gold); }
@media (max-width: 900px) {
  .main { grid-template-columns: 1fr; }
  .preview { height: 300px; }
}
@media (max-height: 520px) {
  .layout { grid-template-columns: 170px 1fr; gap: 10px; }
  .list { gap: 6px; }
  .ch { padding: 6px 8px 6px 14px; }
  .main { grid-template-columns: minmax(200px, 1fr) minmax(220px, 1fr); gap: 10px; }
  .preview { height: 260px; }
  .nm { font-size: 19px; }
}
@media (max-width: 600px) and (min-height: 521px) {
  .layout { grid-template-columns: 1fr; }
  .list { flex-direction: row; overflow-x: auto; }
  .ch { flex: 0 0 auto; }
}
</style>
