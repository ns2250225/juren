<script setup lang="ts">
import { watch } from 'vue'
import { useSettings } from '../stores/settings'
import { useProfile } from '../stores/profile'
import { audio } from '../game/core/Audio'

const props = withDefaults(defineProps<{ inGame?: boolean }>(), { inGame: false })
const emit = defineEmits<{ back: []; changed: []; editLayout: [] }>()
const s = useSettings()

// Any field change (v-model, reset, layout reset) → persist + notify.
watch(
  () => s.$state,
  () => {
    s.save()
    audio.setVolumes(s.master, s.music, s.sfx)
    emit('changed')
  },
  { deep: true },
)

const pct = (v: number) => `${Math.round(v * 100)}%`

function click() {
  audio.play('uiClick')
}
function back() {
  click()
  emit('back')
}
function editLayout() {
  click()
  emit('editLayout')
}
function resetLayout() {
  click()
  s.mobileLayout = {}
}
function resetDefaults() {
  click()
  s.reset()
}
async function wipe() {
  click()
  if (!window.confirm('确定要清除全部存档吗？战功、升级、装备、图鉴与战绩都将被重置，且无法恢复。')) return
  await useProfile().resetAll()
  window.alert('存档已清除。')
}
</script>

<template>
  <div class="screen">
    <div class="screen-head">
      <h2 class="panel-title">设置</h2>
      <button class="btn" @click="back">返回</button>
    </div>
    <div class="screen-body scroll">
      <div class="groups">
        <!-- 画面 -->
        <section class="panel grp">
          <h3 class="g-title">画面</h3>
          <label class="opt">
            <span class="lb">画质</span>
            <select v-model="s.quality">
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <div class="note muted">修改画质将在下次进入战斗时生效</div>
          <label class="opt">
            <span class="lb">阴影</span>
            <span class="sw"><input v-model="s.shadows" type="checkbox" /><i /></span>
          </label>
          <label class="opt">
            <span class="lb">动态分辨率</span>
            <span class="sw"><input v-model="s.dynamicRes" type="checkbox" /><i /></span>
          </label>
          <label class="opt col">
            <span class="lb">视野范围（FOV） <b>{{ s.fov }}°</b></span>
            <input v-model.number="s.fov" type="range" min="60" max="100" step="1" />
          </label>
          <label class="opt">
            <span class="lb">显示帧率</span>
            <span class="sw"><input v-model="s.showFps" type="checkbox" /><i /></span>
          </label>
        </section>

        <!-- 操作 -->
        <section class="panel grp">
          <h3 class="g-title">操作</h3>
          <label class="opt col">
            <span class="lb">视角灵敏度 <b>{{ s.sensitivity.toFixed(2) }}</b></span>
            <input v-model.number="s.sensitivity" type="range" min="0.2" max="3" step="0.05" />
          </label>
          <label class="opt">
            <span class="lb">反转 Y 轴</span>
            <span class="sw"><input v-model="s.invertY" type="checkbox" /><i /></span>
          </label>
          <label class="opt">
            <span class="lb">镜头震动</span>
            <span class="sw"><input v-model="s.cameraShake" type="checkbox" /><i /></span>
          </label>
        </section>

        <!-- 辅助 -->
        <section class="panel grp">
          <h3 class="g-title">辅助</h3>
          <label class="opt">
            <span class="lb">自动瞄准 / 后颈吸附</span>
            <span class="sw"><input v-model="s.autoAim" type="checkbox" /><i /></span>
          </label>
          <label class="opt">
            <span class="lb">钩索辅助吸附</span>
            <span class="sw"><input v-model="s.hookAssist" type="checkbox" /><i /></span>
          </label>
          <label class="opt">
            <span class="lb">移动端自动保持飞行高度</span>
            <span class="sw"><input v-model="s.autoAltitude" type="checkbox" /><i /></span>
          </label>
        </section>

        <!-- 音频 -->
        <section class="panel grp">
          <h3 class="g-title">音频</h3>
          <label class="opt col">
            <span class="lb">主音量 <b>{{ pct(s.master) }}</b></span>
            <input v-model.number="s.master" type="range" min="0" max="1" step="0.01" />
          </label>
          <label class="opt col">
            <span class="lb">音乐 <b>{{ pct(s.music) }}</b></span>
            <input v-model.number="s.music" type="range" min="0" max="1" step="0.01" />
          </label>
          <label class="opt col">
            <span class="lb">音效 <b>{{ pct(s.sfx) }}</b></span>
            <input v-model.number="s.sfx" type="range" min="0" max="1" step="0.01" />
          </label>
        </section>

        <!-- 界面 -->
        <section class="panel grp">
          <h3 class="g-title">界面</h3>
          <label class="opt">
            <span class="lb">显示 HUD</span>
            <span class="sw"><input v-model="s.hudVisible" type="checkbox" /><i /></span>
          </label>
          <label class="opt col">
            <span class="lb">HUD 缩放 <b>{{ pct(s.hudScale) }}</b></span>
            <input v-model.number="s.hudScale" type="range" min="0.7" max="1.4" step="0.05" />
          </label>
        </section>

        <!-- 移动端 -->
        <section class="panel grp">
          <h3 class="g-title">移动端</h3>
          <label class="opt">
            <span class="lb">触屏操作模式</span>
            <select v-model="s.mobileMode">
              <option value="auto">自动</option>
              <option value="on">开启</option>
              <option value="off">关闭</option>
            </select>
          </label>
          <div class="note muted">当前：{{ s.mobile ? '触屏操作已启用' : '键鼠操作' }}</div>
          <label class="opt col">
            <span class="lb">按钮不透明度 <b>{{ pct(s.mobileOpacity) }}</b></span>
            <input v-model.number="s.mobileOpacity" type="range" min="0.2" max="1" step="0.05" />
          </label>
          <div class="row btns">
            <button class="btn btn-sm btn-gold" @click="editLayout">调整按钮布局</button>
            <button class="btn btn-sm btn-ghost" @click="resetLayout">重置按钮布局</button>
          </div>
        </section>
      </div>

      <div class="foot row">
        <button class="btn btn-ghost" @click="resetDefaults">恢复默认设置</button>
        <span class="spacer" />
        <button v-if="!props.inGame" class="btn danger" @click="wipe">清除全部存档</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; align-items: start; }
.grp { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; }
.g-title { margin: 0 0 2px; font-family: var(--font-title); font-weight: 400; font-size: 19px; letter-spacing: 2px; color: var(--gold); }
.opt { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; cursor: pointer; }
.opt.col { flex-direction: column; align-items: stretch; gap: 4px; }
.opt.col .lb { display: flex; justify-content: space-between; }
.lb b { color: var(--gold); font-weight: 700; }
.note { font-size: 11px; margin-top: -6px; }
.btns { flex-wrap: wrap; }
.foot { margin-top: 16px; padding-bottom: 4px; flex-wrap: wrap; }
.danger { background: linear-gradient(180deg, #7a1a14, #4e100c); color: #ffd8d0; }

/* toggle switch */
.sw { position: relative; display: inline-block; width: 46px; height: 24px; flex: 0 0 auto; }
.sw input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.sw i {
  position: absolute; inset: 0; background: #0d0907; pointer-events: none;
  box-shadow: 0 0 0 2px #0a0705, inset 0 0 0 2px var(--line); transition: background 0.15s;
}
.sw i::after {
  content: ''; position: absolute; top: 4px; left: 4px; width: 16px; height: 16px;
  background: var(--text-faint); transition: transform 0.15s, background 0.15s;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.4);
}
.sw input:checked + i { background: #234a30; box-shadow: 0 0 0 2px #0a0705, inset 0 0 0 2px var(--green); }
.sw input:checked + i::after { transform: translateX(22px); background: var(--green-hi); }
.sw input:focus-visible + i { outline: 2px solid var(--gold); outline-offset: 2px; }

@media (max-height: 520px) {
  .groups { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
  .grp { gap: 7px; padding: 10px 12px; }
  .opt { font-size: 13px; }
  .g-title { font-size: 16px; }
}
</style>
