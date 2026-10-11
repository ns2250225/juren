export type CharacterId = 'eren' | 'mikasa' | 'armin' | 'levi' | 'hange' | 'erwin'
export type SkillId = 'titan' | 'combo' | 'spin' | 'command' | 'charge' | 'research'

export interface CharacterLook {
  skin: string
  hair: string
  hairStyle: 'eren' | 'mikasa' | 'armin' | 'levi' | 'hange' | 'erwin' | 'buzz' | 'bald' | 'bun' | 'short' | 'long'
  eyes: string
  scarf?: string
  cravat?: boolean
  goggles?: boolean
  bolo?: boolean
  height: number // model scale multiplier
  build?: number // shoulder width multiplier
}

export interface CharacterDef {
  id: CharacterId
  name: string
  role: string
  desc: string
  skill: SkillId
  skillName: string
  skillDesc: string
  skillCooldown: number
  accent: string
  stats: { hp: number; speed: number; gasEff: number; damage: number; hookRange: number; bladeDur: number }
  look: CharacterLook
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'eren',
    name: '艾伦·耶格尔',
    role: '全能型战士',
    desc: '渴望自由的少年，拥有进击的巨人之力。各项能力均衡，斩杀积累怒气后可巨人化。',
    skill: 'titan',
    skillName: '巨人之力',
    skillDesc: '怒气满值时化身 15 米进击的巨人 25 秒：重拳击碎巨人后颈，咆哮嘲讽周围巨人，短时间阻挡大量巨人。',
    skillCooldown: 90,
    accent: '#3fae6a',
    stats: { hp: 110, speed: 1.0, gasEff: 1.0, damage: 1.05, hookRange: 0, bladeDur: 1 },
    look: { skin: '#e8b98f', hair: '#3a2416', hairStyle: 'eren', eyes: '#2f9a6a', height: 1.0 },
  },
  {
    id: 'mikasa',
    name: '三笠·阿克曼',
    role: '高速突击',
    desc: '阿克曼一族的精英，身手矫健，飞行与连斩能力出众。',
    skill: 'combo',
    skillName: '连续斩击',
    skillDesc: '12 秒内机动速度 +40%、斩击间隔减半、空中连击伤害 +80%。',
    skillCooldown: 35,
    accent: '#c43a3a',
    stats: { hp: 100, speed: 1.15, gasEff: 0.95, damage: 1.2, hookRange: 0, bladeDur: 1 },
    look: { skin: '#f0cfae', hair: '#141418', hairStyle: 'mikasa', eyes: '#2b2b33', scarf: '#b82828', height: 0.97 },
  },
  {
    id: 'levi',
    name: '利威尔·阿克曼',
    role: '精英斩杀',
    desc: '人类最强士兵。斩击伤害极高，刀刃保养得当、耐久更好。',
    skill: 'spin',
    skillName: '旋风斩',
    skillDesc: '锁定前方巨人，高速旋转突进至其后颈并连续斩击：普通巨人必杀，对 Boss 造成多段重创。',
    skillCooldown: 22,
    accent: '#8fa3b8',
    stats: { hp: 100, speed: 1.1, gasEff: 0.9, damage: 1.45, hookRange: 0, bladeDur: 1.3 },
    look: { skin: '#f1d3b5', hair: '#101012', hairStyle: 'levi', eyes: '#4a5560', cravat: true, height: 0.9 },
  },
  {
    id: 'armin',
    name: '阿尔敏·亚鲁雷特',
    role: '战术辅助',
    desc: '洞察战局的智将。标记威胁目标，提升兵团作战效率。',
    skill: 'command',
    skillName: '战场指挥',
    skillDesc: '标记 150 米内全部巨人 15 秒：被标记巨人受伤 +35%，透视显示，NPC 兵团斩杀成功率 +50%。',
    skillCooldown: 30,
    accent: '#e6c25a',
    stats: { hp: 90, speed: 1.0, gasEff: 0.8, damage: 0.9, hookRange: 10, bladeDur: 1 },
    look: { skin: '#f4d6b8', hair: '#e8c96a', hairStyle: 'armin', eyes: '#3a6fd0', height: 0.95 },
  },
  {
    id: 'erwin',
    name: '艾尔文·史密斯',
    role: '军团指挥',
    desc: '调查兵团第十三代团长。号令全军，召唤增援。',
    skill: 'charge',
    skillName: '全军突击',
    skillDesc: '召唤 6 名调查兵团增援，并令 100 米内士兵 20 秒内伤害与速度大幅提升。',
    skillCooldown: 45,
    accent: '#3a73c4',
    stats: { hp: 130, speed: 0.95, gasEff: 1.0, damage: 1.0, hookRange: 5, bladeDur: 1 },
    look: { skin: '#eec7a2', hair: '#e2c46c', hairStyle: 'erwin', eyes: '#3d7ad6', bolo: true, height: 1.08, build: 1.1 },
  },
  {
    id: 'hange',
    name: '韩吉·佐耶',
    role: '科研与控制',
    desc: '热爱巨人研究的分队长。部署捕获陷阱，暴露巨人弱点。',
    skill: 'research',
    skillName: '巨人研究',
    skillDesc: '向准星位置投放捕获装置：范围内巨人被束缚 8 秒，后颈伤害翻倍且无视硬质化与装甲。',
    skillCooldown: 28,
    accent: '#a0663a',
    stats: { hp: 100, speed: 1.0, gasEff: 1.0, damage: 1.0, hookRange: 5, bladeDur: 1 },
    look: { skin: '#e9c19c', hair: '#5a3a22', hairStyle: 'hange', eyes: '#6b4a2a', goggles: true, height: 1.0 },
  },
]

export const getCharacter = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]

export const COMMON_SKILLS = [
  { key: '2', id: 'flare', name: '信号弹', desc: '向准星方向发射信号弹，附近士兵集中攻击该区域巨人。', cooldown: 25 },
  { key: '3', id: 'dash', name: '空中冲刺', desc: '瓦斯爆发冲刺，短暂无敌，紧急回避巨人攻击。', cooldown: 4 },
] as const
