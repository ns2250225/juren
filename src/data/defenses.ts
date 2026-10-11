export type DefenseType = 'cannon' | 'ballista' | 'supply' | 'repair' | 'watchtower' | 'trap' | 'barracks' | 'innerline'
export type SlotKind = 'wall' | 'ground' | 'trap' | 'core'

export interface DefenseDef {
  id: DefenseType
  name: string
  desc: string
  slot: SlotKind
  cost: { funds: number; materials: number }
  upgrade: { funds: number; materials: number }[] // cost to reach level 2, 3
  /** per level stats */
  range: number[]
  power: number[]
  interval: number[]
  icon: string
}

export const DEFENSES: Record<DefenseType, DefenseDef> = {
  cannon: {
    id: 'cannon', name: '城墙炮台', desc: '驻屯兵团固定炮。自动炮击射程内巨人，造成范围伤害与硬直；靠近按 F 可手动操炮。',
    slot: 'wall', cost: { funds: 300, materials: 120 }, upgrade: [{ funds: 250, materials: 100 }, { funds: 400, materials: 160 }],
    range: [130, 150, 175], power: [90, 130, 180], interval: [4.2, 3.4, 2.6], icon: '💣',
  },
  ballista: {
    id: 'ballista', name: '固定弩炮', desc: '发射巨型钢枪的单体重击武器，可钉住巨人、击破装甲。',
    slot: 'wall', cost: { funds: 420, materials: 160 }, upgrade: [{ funds: 320, materials: 140 }, { funds: 500, materials: 200 }],
    range: [150, 170, 200], power: [260, 380, 520], interval: [6, 5, 4], icon: '🏹',
  },
  supply: {
    id: 'supply', name: '补给站', desc: '按 F 免费补满瓦斯与刀刃；士兵也会在此补给。',
    slot: 'ground', cost: { funds: 250, materials: 100 }, upgrade: [{ funds: 200, materials: 80 }, { funds: 300, materials: 120 }],
    range: [9, 11, 13], power: [1, 1, 1], interval: [0, 0, 0], icon: '⛽',
  },
  repair: {
    id: 'repair', name: '维修站', desc: '持续修复附近城墙、城门与建筑（消耗建筑材料）。',
    slot: 'ground', cost: { funds: 300, materials: 150 }, upgrade: [{ funds: 250, materials: 120 }, { funds: 350, materials: 160 }],
    range: [80, 100, 130], power: [12, 20, 32], interval: [1, 1, 1], icon: '🔧',
  },
  watchtower: {
    id: 'watchtower', name: '警戒塔', desc: '扩大巨人侦察范围，在小地图上提前发现巨人；塔上哨兵会鸣钟预警。',
    slot: 'ground', cost: { funds: 180, materials: 80 }, upgrade: [{ funds: 150, materials: 60 }, { funds: 220, materials: 90 }],
    range: [220, 300, 400], power: [1, 1, 1], interval: [0, 0, 0], icon: '🗼',
  },
  trap: {
    id: 'trap', name: '巨人陷阱', desc: '韩吉式捕获装置：钢索与钉枪束缚经过的巨人，使其减速或无法移动。',
    slot: 'trap', cost: { funds: 200, materials: 90 }, upgrade: [{ funds: 160, materials: 70 }, { funds: 240, materials: 100 }],
    range: [14, 17, 20], power: [5, 7, 9], interval: [22, 18, 14], icon: '🪤',
  },
  barracks: {
    id: 'barracks', name: '驻军营地', desc: '持续派出调查兵团士兵（使用立体机动装置自动迎击巨人）。',
    slot: 'ground', cost: { funds: 400, materials: 150 }, upgrade: [{ funds: 300, materials: 120 }, { funds: 450, materials: 180 }],
    range: [4, 6, 8], power: [1, 1, 1], interval: [30, 24, 18], icon: '⛺',
  },
  innerline: {
    id: 'innerline', name: '内城防线', desc: '城墙突破后的第二道防御：拒马与石垒环绕内城核心，巨人必须先摧毁它。',
    slot: 'core', cost: { funds: 350, materials: 250 }, upgrade: [{ funds: 250, materials: 200 }, { funds: 350, materials: 260 }],
    range: [0, 0, 0], power: [1500, 2500, 3800], interval: [0, 0, 0], icon: '🧱',
  },
}
export const DEFENSE_ORDER: DefenseType[] = ['cannon', 'ballista', 'supply', 'repair', 'watchtower', 'trap', 'barracks', 'innerline']
