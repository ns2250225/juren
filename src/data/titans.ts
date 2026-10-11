export type TitanType = 'normal' | 'abnormal' | 'armored' | 'colossal' | 'female' | 'beast' | 'attack'

export interface TitanDef {
  id: TitanType
  name: string
  height: [number, number]
  hp: number // body HP (limbs/head damage pool; reaching 0 knocks down)
  napeHits: number // nape hits required (after armour/hardening)
  speed: number // m/s walking
  boss: boolean
  attackDamage: number // structure damage per strike
  attackInterval: number
  playerDamage: number
  attack: string
  weakness: string
  desc: string
  reward: { funds: number; materials: number; score: number }
  threat: number // used for targeting priority & alerts
}

export const TITANS: Record<TitanType, TitanDef> = {
  normal: {
    id: 'normal', name: '普通巨人', height: [3, 15], hp: 260, napeHits: 1, speed: 4.2, boss: false,
    attackDamage: 30, attackInterval: 2.6, playerDamage: 25,
    attack: '抓取、拍击、啃咬建筑', weakness: '后颈（一击必杀）',
    desc: '面带诡异笑容、缓慢向城墙推进的巨人。会抓取士兵与居民，也会捶打城门与房屋。数量最多的基础敌人。',
    reward: { funds: 60, materials: 20, score: 100 }, threat: 1,
  },
  abnormal: {
    id: 'abnormal', name: '奇行种', height: [6, 14], hp: 220, napeHits: 1, speed: 8.5, boss: false,
    attackDamage: 40, attackInterval: 1.8, playerDamage: 30,
    attack: '高速冲刺、跳扑、四肢奔跑', weakness: '后颈（一击必杀）',
    desc: '行为无法预测的巨人。会突然加速、跳跃或改变方向，优先绕过炮台防线，从薄弱处侵入城市。',
    reward: { funds: 100, materials: 30, score: 180 }, threat: 2,
  },
  armored: {
    id: 'armored', name: '铠之巨人', height: [15, 15], hp: 2400, napeHits: 3, speed: 5.5, boss: true,
    attackDamage: 220, attackInterval: 2.0, playerDamage: 40,
    attack: '硬质装甲冲锋，撞毁城门与城墙', weakness: '后颈装甲需先击破（强化刀刃 / 炮击有效）；关节缝隙',
    desc: '全身覆盖硬质化装甲板的巨人。普通刀刃难以伤及，冲锋可以一次性撞穿城门。',
    reward: { funds: 800, materials: 300, score: 3000 }, threat: 8,
  },
  colossal: {
    id: 'colossal', name: '超大型巨人', height: [60, 60], hp: 6000, napeHits: 4, speed: 1.4, boss: true,
    attackDamage: 600, attackInterval: 4.5, playerDamage: 50,
    attack: '踢破城门、横扫城墙、释放高温蒸汽', weakness: '后颈（蒸汽间歇期可接近）',
    desc: '身高约 60 米、没有皮肤的巨人。从城墙后探出头颅的身影是人类的噩梦。周期性释放高温蒸汽，吹飞并灼伤靠近者。',
    reward: { funds: 1500, materials: 600, score: 6000 }, threat: 10,
  },
  female: {
    id: 'female', name: '女巨人', height: [14, 14], hp: 1800, napeHits: 3, speed: 9, boss: true,
    attackDamage: 120, attackInterval: 1.4, playerDamage: 45,
    attack: '格斗、踢击、闪避、局部硬质化', weakness: '后颈（硬质化结晶时无效）',
    desc: '敏捷而聪明的巨人，擅长格斗与闪避，能在被攻击的瞬间硬质化后颈与拳头。',
    reward: { funds: 1000, materials: 300, score: 4000 }, threat: 8,
  },
  beast: {
    id: 'beast', name: '兽之巨人', height: [17, 17], hp: 2200, napeHits: 3, speed: 3, boss: true,
    attackDamage: 160, attackInterval: 3.2, playerDamage: 55,
    attack: '远程投掷碎石群，摧毁城墙、炮台与房屋', weakness: '后颈（需突破投石火力接近）',
    desc: '浑身毛发、手臂修长的猿形巨人。在远处投掷大量石块，可以在远距离造成毁灭性破坏。',
    reward: { funds: 1200, materials: 400, score: 4500 }, threat: 9,
  },
  attack: {
    id: 'attack', name: '进击的巨人', height: [15, 15], hp: 1500, napeHits: 1, speed: 9, boss: false,
    attackDamage: 0, attackInterval: 1, playerDamage: 0,
    attack: '重拳、咆哮', weakness: '后颈',
    desc: '艾伦·耶格尔巨人化后的形态。长发、尖耳、裸露牙床，以重拳粉碎敌方巨人。',
    reward: { funds: 0, materials: 0, score: 0 }, threat: 0,
  },
}

export const BESTIARY_ORDER: TitanType[] = ['normal', 'abnormal', 'armored', 'female', 'beast', 'colossal', 'attack']
