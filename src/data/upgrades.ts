export type StatId = 'maxHp' | 'hookRange' | 'gasEff' | 'flySpeed' | 'bladeDur' | 'napeDmg' | 'dodge' | 'cooldown'
export interface StatDef { id: StatId; name: string; desc: string; per: number; unit: string; max: number }

export const STATS: StatDef[] = [
  { id: 'maxHp', name: '最大生命值', desc: '提升生命上限', per: 15, unit: '', max: 5 },
  { id: 'hookRange', name: '钩索最大距离', desc: '钩索射程增加', per: 8, unit: 'm', max: 5 },
  { id: 'gasEff', name: '瓦斯推进效率', desc: '瓦斯消耗降低', per: 8, unit: '%', max: 5 },
  { id: 'flySpeed', name: '飞行速度', desc: '推进力与最高速度提升', per: 6, unit: '%', max: 5 },
  { id: 'bladeDur', name: '刀刃耐久', desc: '每组刀刃可斩击更多次', per: 15, unit: '%', max: 5 },
  { id: 'napeDmg', name: '后颈斩击伤害', desc: '提升对后颈的伤害（对 Boss 尤其重要）', per: 12, unit: '%', max: 5 },
  { id: 'dodge', name: '空中闪避能力', desc: '空中冲刺冷却缩短、无敌时间延长', per: 12, unit: '%', max: 5 },
  { id: 'cooldown', name: '技能冷却效率', desc: '角色技能冷却缩短', per: 8, unit: '%', max: 5 },
]
export const statCost = (lv: number) => [20, 40, 70, 110, 160][lv] ?? Infinity

export type EquipSlot = 'odm' | 'hook' | 'gas' | 'blade'
export interface EquipDef { id: string; slot: EquipSlot; name: string; desc: string; cost: number }
export const EQUIPMENT: EquipDef[] = [
  { id: 'odm_basic', slot: 'odm', name: '初级立体机动装置', desc: '基础钩索与推进', cost: 0 },
  { id: 'odm_adv', slot: 'odm', name: '高级机动装置', desc: '瓦斯消耗 -25%，空中转向更灵活', cost: 260 },
  { id: 'hook_basic', slot: 'hook', name: '标准钩索', desc: '射程 80 米', cost: 0 },
  { id: 'hook_long', slot: 'hook', name: '强化钩索', desc: '射程 +25 米，收卷速度 +20%', cost: 150 },
  { id: 'gas_basic', slot: 'gas', name: '标准瓦斯罐', desc: '常规推进', cost: 0 },
  { id: 'gas_hp', slot: 'gas', name: '高压瓦斯装置', desc: '推进速度 +22%', cost: 200 },
  { id: 'blade_basic', slot: 'blade', name: '标准超硬质钢刀刃', desc: '常规斩击', cost: 0 },
  { id: 'blade_light', slot: 'blade', name: '轻量刀刃', desc: '攻击速度 +35%', cost: 160 },
  { id: 'blade_hard', slot: 'blade', name: '强化刀刃', desc: '破甲伤害 ×2.5，耐久 +20%', cost: 240 },
]
