import type { TitanType } from './titans'
import type { SpawnDir, MapDef } from './maps'

export type WaveEventType =
  | 'breach' | 'supplyFire' | 'abnormalRaid' | 'civilianSOS' | 'reinforce' | 'steam' | 'evacuate' | 'gateAssault' | 'colossal'

export interface WaveGroup { type: TitanType; count: number; dir: SpawnDir; delay: number; interval: number }
export interface WaveEvent { at: number; type: WaveEventType }
export interface WaveDef {
  n: number
  name: string
  groups: WaveGroup[]
  events: WaveEvent[]
  boss?: TitanType
  tutorial?: boolean
  hpScale: number
  reward: { funds: number; materials: number }
}

const BOSSES: TitanType[] = ['armored', 'female', 'beast', 'colossal']

export const EVENT_TEXT: Record<WaveEventType, string> = {
  breach: '城墙突破',
  supplyFire: '补给站失火',
  abnormalRaid: '奇行种突袭',
  civilianSOS: '居民求救',
  reinforce: '兵团增援',
  steam: '巨人蒸汽',
  evacuate: '居民疏散',
  gateAssault: '城门遭袭',
  colossal: '超大型巨人出现',
}

export function buildWave(n: number, map: MapDef, rnd: () => number = Math.random): WaveDef {
  const dirs = map.spawnDirs
  const d = (want: SpawnDir): SpawnDir => (dirs.includes(want) ? want : 'front')
  const anyDir = (): SpawnDir => dirs[Math.floor(rnd() * dirs.length)]
  const g = (type: TitanType, count: number, dir: SpawnDir, delay = 0, interval = 3): WaveGroup => ({ type, count, dir, delay, interval })
  const base = { n, hpScale: 1, events: [] as WaveEvent[], reward: { funds: 300 + n * 80, materials: 150 + n * 40 } }
  switch (n) {
    case 1:
      return { ...base, name: '教学波次', tutorial: true, groups: [g('normal', 5, d('front'), 4, 6)] }
    case 2:
      return { ...base, name: '双方向入侵', groups: [g('normal', 4, d('left'), 2, 4), g('normal', 4, d('right'), 6, 4)] }
    case 3:
      return {
        ...base, name: '城门遭袭', groups: [g('normal', 8, d('front'), 2, 3), g('abnormal', 4, anyDir(), 20, 6)],
        events: [{ at: 8, type: 'gateAssault' }],
      }
    case 4:
      return {
        ...base, name: '居民疏散',
        groups: [g('normal', 6, d('front'), 2, 3), g('normal', 4, d('left'), 15, 4), g('abnormal', 6, d('right'), 25, 5)],
        events: [{ at: 5, type: 'evacuate' }, { at: 40, type: 'civilianSOS' }, { at: 60, type: 'reinforce' }],
      }
    case 5:
      return {
        ...base, name: '城墙防卫战', boss: 'armored',
        groups: [g('normal', 8, d('front'), 2, 3), g('abnormal', 4, anyDir(), 18, 5), g('armored', 1, d('front'), 30, 1)],
        events: [{ at: 25, type: 'reinforce' }],
      }
    case 10:
      return {
        ...base, name: '城墙决战', boss: 'colossal',
        groups: [
          g('normal', 10, d('front'), 2, 2.5), g('normal', 5, d('left'), 12, 3), g('abnormal', 5, d('right'), 20, 4),
          g('colossal', 1, d('front'), 35, 1),
        ],
        events: [{ at: 34, type: 'colossal' }, { at: 50, type: 'steam' }, { at: 70, type: 'reinforce' }],
      }
  }
  if (n < 10) {
    const total = 12 + (n - 5) * 4
    const abn = Math.round(total * (0.25 + (n - 6) * 0.04))
    const boss: TitanType | undefined = n === 7 ? 'female' : n === 9 ? 'beast' : undefined
    const groups = [
      g('normal', Math.ceil((total - abn) / 2), d('front'), 2, 2.8),
      g('normal', Math.floor((total - abn) / 2), anyDir(), 14, 3.2),
      g('abnormal', abn, anyDir(), 24, 4),
    ]
    if (boss) groups.push(g(boss, 1, boss === 'beast' ? d('front') : anyDir(), 28, 1))
    const pool: WaveEventType[] = ['breach', 'supplyFire', 'abnormalRaid', 'civilianSOS', 'reinforce', 'steam']
    const events: WaveEvent[] = [{ at: 30 + rnd() * 20, type: 'breach' }]
    for (let i = 0; i < 2; i++) events.push({ at: 15 + rnd() * 60, type: pool[Math.floor(rnd() * pool.length)] })
    return { ...base, name: boss ? (boss === 'female' ? '女巨人来袭' : '兽之巨人的投石') : '混合巨人潮', boss, groups, events }
  }
  // endless 11+
  const k = n - 10
  const total = 20 + k * 3
  const boss: TitanType | undefined = k % 2 === 0 ? BOSSES[Math.floor(rnd() * BOSSES.length)] : undefined
  const groups = [
    g('normal', Math.round(total * 0.45), d('front'), 2, 2.2),
    g('normal', Math.round(total * 0.2), anyDir(), 10, 2.6),
    g('abnormal', Math.round(total * 0.35), anyDir(), 18, 3),
  ]
  if (boss) groups.push(g(boss, 1, d('front'), 25, 1))
  const pool: WaveEventType[] = ['breach', 'supplyFire', 'abnormalRaid', 'civilianSOS', 'reinforce', 'steam']
  const events: WaveEvent[] = []
  for (let i = 0; i < 3; i++) events.push({ at: 10 + rnd() * 70, type: pool[Math.floor(rnd() * pool.length)] })
  if (boss === 'colossal') events.push({ at: 24, type: 'colossal' })
  return { ...base, name: `无限生存 · 第 ${k} 轮`, boss, groups, events, hpScale: 1 + k * 0.07 }
}
