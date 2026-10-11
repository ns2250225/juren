<script setup lang="ts">
import { audio } from '../game/core/Audio'

const emit = defineEmits<{ back: [] }>()

const KEYS: { k: string[]; d: string }[] = [
  { k: ['W', 'A', 'S', 'D'], d: '移动' },
  { k: ['鼠标'], d: '视角' },
  { k: ['空格'], d: '跳跃 / 空中推进' },
  { k: ['左键'], d: '斩击' },
  { k: ['右键'], d: '右钩索（再次按下释放，按住收卷）' },
  { k: ['Q'], d: '左钩索' },
  { k: ['Shift'], d: '瓦斯加速' },
  { k: ['E'], d: '回收双钩索' },
  { k: ['G'], d: '一键双钩索' },
  { k: ['R'], d: '更换刀刃' },
  { k: ['F'], d: '互动 / 补给 / 操炮' },
  { k: ['1', '2', '3'], d: '技能' },
  { k: ['T', '中键'], d: '锁定目标' },
  { k: ['Tab'], d: '战场地图' },
  { k: ['B'], d: '防御建设（波次间隙）' },
  { k: ['N'], d: '立即开始下一波' },
  { k: ['Z', 'X', 'C'], d: '兵团指令：集结 / 进攻 / 防守' },
  { k: ['H'], d: '隐藏 HUD' },
  { k: ['滚轮'], d: '镜头距离' },
  { k: ['Esc'], d: '暂停' },
]

function back() {
  audio.play('uiClick')
  emit('back')
}
</script>

<template>
  <div class="screen">
    <div class="screen-head">
      <h2 class="panel-title">作战手册 <small>操作与机制说明</small></h2>
      <button class="btn" @click="back">返回</button>
    </div>
    <div class="screen-body scroll">
      <div class="cols">
        <section class="panel sec">
          <h3>游戏目标</h3>
          <p>守护城市免遭巨人吞噬。巨人将依次冲击城市各层防线：</p>
          <div class="chain">
            <span class="tag">外城墙</span>→<span class="tag">城门</span>→<span class="tag">居民区</span>→<span class="tag">补给站</span>→<span class="tag">驻军据点</span>→<span class="tag tag-gold">内城核心</span>
          </div>
          <ul>
            <li><b class="red">失败条件：</b>内城核心生命值归零，或城市完整度低于 <b>15%</b>。</li>
            <li><b class="green">胜利条件：</b>守住全部波次的巨人进攻。</li>
          </ul>
        </section>

        <section class="panel sec">
          <h3>PC 键位</h3>
          <table class="keys">
            <tbody>
              <tr v-for="r in KEYS" :key="r.d">
                <td class="kc"><template v-for="(k, i) in r.k" :key="k"><span v-if="i" class="sep">/</span><kbd>{{ k }}</kbd></template></td>
                <td>{{ r.d }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel sec">
          <h3>移动端操作</h3>
          <ul>
            <li><b>左侧：</b>虚拟摇杆移动，旁边为 跳跃 / 推进 按钮。</li>
            <li><b>右侧：</b>拖动屏幕转动视角；按钮包括 左钩 / 右钩、斩击、技能、锁定。</li>
          </ul>
          <p class="muted">辅助功能（可在设置中开关）：</p>
          <ul>
            <li>自动锁定最近的巨人后颈</li>
            <li>钩索自动吸附到附近建筑 / 巨人</li>
            <li>自动保持飞行高度</li>
            <li>一键发射双钩索</li>
            <li>简化斩击：靠近后颈时轻点即可斩杀</li>
          </ul>
        </section>

        <section class="panel sec">
          <h3>立体机动技巧</h3>
          <ol>
            <li>发射钩索后<b>按住</b>收卷，将自己拉向锚点。</li>
            <li><b>松开</b>后借助惯性摆荡，保持速度飞越街区。</li>
            <li>朝绳索方向使用瓦斯加速 <kbd>Shift</kbd>，可大幅提升速度。</li>
            <li><b class="gold">速度越快，斩击伤害越高。</b></li>
            <li>从巨人背后接近，避开其视线与抓取。</li>
            <li>锁定后，巨人后颈会发出<b style="color:#ff9a3a">橙色光芒</b>。</li>
          </ol>
        </section>

        <section class="panel sec">
          <h3>巨人弱点</h3>
          <table class="keys">
            <tbody>
              <tr><td class="kc"><span class="tag">头部</span></td><td>造成硬直</td></tr>
              <tr><td class="kc"><span class="tag">手臂</span></td><td>断臂后无法抓取</td></tr>
              <tr><td class="kc"><span class="tag">腿部</span></td><td>减速，累积伤害后倒地</td></tr>
              <tr><td class="kc"><span class="tag tag-red">后颈</span></td><td>致命弱点，斩击即可击杀</td></tr>
              <tr><td class="kc"><span class="tag tag-gold">装甲</span></td><td>需先破甲，或使用强化刀刃</td></tr>
            </tbody>
          </table>
        </section>

        <section class="panel sec">
          <h3>Boss 机制</h3>
          <ul>
            <li><b class="gold">铠之巨人：</b>全身装甲，需先用炮击或强化刀刃击破后颈装甲，冲锋可撞穿城门。</li>
            <li><b class="gold">超大型巨人：</b>周期性释放高温蒸汽吹飞靠近者，在蒸汽间歇期接近后颈。</li>
            <li><b class="gold">女巨人：</b>会局部硬质化后颈与拳头并闪避攻击，等待硬质化结束再出手。</li>
            <li><b class="gold">兽之巨人：</b>远程投掷碎石群，应迅速突破投石火力、贴身斩杀。</li>
          </ul>
        </section>

        <section class="panel sec">
          <h3>防御设施</h3>
          <p>波次间隙按 <kbd>B</kbd> 使用资金与材料建设或升级：</p>
          <ul>
            <li>城墙炮台：自动炮击射程内巨人（靠近按 F 手动操炮）</li>
            <li>固定弩炮：高伤害单体攻击，钉住巨人、击破装甲</li>
            <li>补给站：按 F 免费补满瓦斯与刀刃</li>
            <li>维修站：消耗建筑材料持续修复城墙、城门与建筑</li>
            <li>警戒塔：扩大小地图巨人侦察范围</li>
            <li>巨人陷阱：束缚 / 减速经过的巨人</li>
            <li>驻军营地：持续派出调查兵团士兵</li>
            <li>内城防线：城墙突破后保护内城核心的第二道防御</li>
          </ul>
        </section>

        <section class="panel sec copy">
          <h3>版权说明</h3>
          <p>本作为同人原型，角色/巨人设定致敬《进击的巨人》；全部模型、贴图、音乐与音效均为程序化原创生成，未使用任何官方素材；公开发布或商业化前需取得相应授权。</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cols { columns: 2 340px; column-gap: 14px; }
.sec { break-inside: avoid; margin-bottom: 14px; padding: 14px 16px; font-size: 13px; line-height: 1.7; color: var(--text-dim); }
.sec h3 { margin: 0 0 8px; font-family: var(--font-title); font-weight: 400; font-size: 19px; letter-spacing: 2px; color: var(--gold); }
.sec p { margin: 4px 0; }
.sec ul, .sec ol { margin: 4px 0; padding-left: 20px; }
.sec b { color: var(--text); }
.chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0; color: var(--text-faint); }
.keys { width: 100%; border-collapse: collapse; }
.keys td { padding: 4px 6px; border-bottom: 1px dashed rgba(90, 67, 48, 0.6); vertical-align: middle; }
.kc { white-space: nowrap; width: 1%; }
.kc kbd { margin: 2px 0; }
.sep { margin: 0 3px; color: var(--text-faint); }
.copy { border-color: var(--red); }
.copy p { color: var(--text-faint); font-size: 12px; }
@media (max-height: 520px) {
  .sec { padding: 10px 12px; margin-bottom: 10px; font-size: 12px; }
  .sec h3 { font-size: 16px; }
  .cols { columns: 2 300px; column-gap: 10px; }
}
</style>
