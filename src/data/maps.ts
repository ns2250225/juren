export type MapId = 'shiganshina' | 'trost' | 'maria' | 'forest'
export type SpawnDir = 'front' | 'left' | 'right' | 'forest' | 'breach'

export interface MapDef {
  id: MapId
  name: string
  subtitle: string
  desc: string
  layout: 'district' | 'line'
  seed: number
  /** district: outer wall radius; line: half length of breakable wall */
  radius: number
  wallHeight: number
  wallThickness: number
  segments: number
  /** street grid */
  block: number
  street: number
  density: number // probability a lot gets a house
  floors: [number, number]
  roofPalette: string[]
  wallPalette: string[]
  innerTown: boolean
  forest: { trees: number; giant: boolean; zMin: number; zMax: number }
  freeCannons: number
  coreName: string
  coreHP: number
  spawnDirs: SpawnDir[]
  preview: { sky: string; ground: string }
}

export const MAPS: MapDef[] = [
  {
    id: 'shiganshina', name: '希干希纳区', subtitle: '玛利亚之墙南端突出城区',
    desc: '主要守城地图。环形外墙、红色屋顶、石板街道、外城门与钟楼。巨人从南方原野逼近外城门，最终目标是通往玛利亚之墙内部的内城门。',
    layout: 'district', seed: 845, radius: 150, wallHeight: 50, wallThickness: 9, segments: 22,
    block: 24, street: 6, density: 0.9, floors: [2, 3],
    roofPalette: ['#b4432c', '#c0532f', '#a33a28', '#c96a3a', '#9c4030'],
    wallPalette: ['#e8dcc0', '#dcd0b0', '#efe6d0', '#d8c8a8'],
    innerTown: true, forest: { trees: 70, giant: false, zMin: 200, zMax: 360 },
    freeCannons: 2, coreName: '内城门', coreHP: 3000, spawnDirs: ['front', 'left', 'right', 'forest'],
    preview: { sky: '#e9b27a', ground: '#7a9a4a' },
  },
  {
    id: 'trost', name: '托洛斯特区', subtitle: '罗塞之墙南部突出城区',
    desc: '复杂街区守城地图。建筑密集、街道狭窄，多层高楼林立，适合高速穿梭与城市巷战。',
    layout: 'district', seed: 1337, radius: 170, wallHeight: 50, wallThickness: 9, segments: 24,
    block: 20, street: 4, density: 0.97, floors: [3, 4],
    roofPalette: ['#8a3a2a', '#6f5a4a', '#a0482e', '#7a3326', '#5d4b40'],
    wallPalette: ['#d9cdb4', '#cfc2a6', '#e4dac6', '#bfb39a'],
    innerTown: true, forest: { trees: 30, giant: false, zMin: 230, zMax: 380 },
    freeCannons: 2, coreName: '内城门', coreHP: 3200, spawnDirs: ['front', 'left', 'right'],
    preview: { sky: '#c7a98a', ground: '#7d8f52' },
  },
  {
    id: 'maria', name: '玛利亚之墙', subtitle: '巨型城墙防线',
    desc: '巨型城墙防御地图。笔直延伸的 50 米城墙，墙顶预置驻屯兵团火炮。依靠炮台、立体机动与驻军抵御巨人破门。',
    layout: 'line', seed: 2024, radius: 230, wallHeight: 50, wallThickness: 10, segments: 16,
    block: 24, street: 7, density: 0.7, floors: [2, 3],
    roofPalette: ['#b4432c', '#8e4a2e', '#c26a3a'],
    wallPalette: ['#e8dcc0', '#ddd0b2', '#cdbd9c'],
    innerTown: true, forest: { trees: 40, giant: false, zMin: 120, zMax: 330 },
    freeCannons: 6, coreName: '驻屯兵团要塞', coreHP: 3500, spawnDirs: ['front', 'left', 'right'],
    preview: { sky: '#9fb8d0', ground: '#86a35a' },
  },
  {
    id: 'forest', name: '巨大树森林', subtitle: '城外拦截战',
    desc: '城外拦截地图。高达 80 米的巨木林立，利用巨树高速机动，在巨人抵达罗塞之墙前将其截杀。',
    layout: 'line', seed: 777, radius: 200, wallHeight: 50, wallThickness: 10, segments: 14,
    block: 24, street: 7, density: 0.55, floors: [2, 3],
    roofPalette: ['#7a4a30', '#8a3a2a', '#6a5a40'],
    wallPalette: ['#d9cdb4', '#cbbd9e'],
    innerTown: true, forest: { trees: 46, giant: true, zMin: 60, zMax: 330 },
    freeCannons: 2, coreName: '罗塞之墙城门要塞', coreHP: 3000, spawnDirs: ['front', 'forest', 'left', 'right'],
    preview: { sky: '#a8c49a', ground: '#4f6e34' },
  },
]
export const getMap = (id: string) => MAPS.find((m) => m.id === id) ?? MAPS[0]

export type GameMode = 'standard' | 'short' | 'endless'
export const MODES: { id: GameMode; name: string; desc: string; waves: number }[] = [
  { id: 'short', name: '速战守城', desc: '守住 5 波巨人进攻（含铠之巨人）', waves: 5 },
  { id: 'standard', name: '标准守城', desc: '守住 10 波进攻，最终迎战超大型巨人', waves: 10 },
  { id: 'endless', name: '无限生存', desc: '巨人无限增长，挑战最高波次', waves: 9999 },
]
