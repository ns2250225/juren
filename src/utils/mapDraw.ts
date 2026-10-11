import type { GameEngine } from '../game/core/GameEngine'
import type { Slot } from '../game/world/CityManager'

export type MapData = ReturnType<GameEngine['mapData']>
export interface View {
  cx: number
  cz: number
  scale: number // px per metre
  w: number
  h: number
}

const FAC_COL: Record<string, string> = {
  cannon: '#ffcf6a', ballista: '#ffa040', supply: '#7fd0ff', repair: '#b0ff8a', watchtower: '#e0e0e0', trap: '#d9a46a', barracks: '#6fd08a', innerline: '#c9bea6',
}

export function worldToMap(v: View, x: number, z: number): [number, number] {
  // north (−z) is up
  return [v.w / 2 + (x - v.cx) * v.scale, v.h / 2 + (z - v.cz) * v.scale]
}
export function mapToWorld(v: View, px: number, py: number): [number, number] {
  return [(px - v.w / 2) / v.scale + v.cx, (py - v.h / 2) / v.scale + v.cz]
}

function hpColor(f: number) {
  if (f > 0.66) return '#7fd08a'
  if (f > 0.33) return '#e8c45a'
  return '#ff5a4a'
}

export function drawMap(ctx: CanvasRenderingContext2D, d: MapData, v: View, o: { slots?: Slot[]; selected?: number; occupied?: Set<number>; t?: number; detectAll?: boolean } = {}) {
  const t = o.t ?? 0
  ctx.clearRect(0, 0, v.w, v.h)
  ctx.fillStyle = '#2a3320'
  ctx.fillRect(0, 0, v.w, v.h)
  ctx.imageSmoothingEnabled = false
  // defended area
  ctx.fillStyle = '#4a4438'
  ctx.beginPath()
  if (d.layout === 'district') {
    const [cx, cy] = worldToMap(v, 0, 0)
    ctx.arc(cx, cy, d.radius * v.scale, 0, Math.PI, false)
  } else {
    const [x0, y0] = worldToMap(v, -d.radius - 30, -260)
    ctx.rect(x0, y0, (d.radius * 2 + 60) * v.scale, 260 * v.scale)
  }
  ctx.fill()
  // giant trees
  ctx.fillStyle = '#2f5a2a'
  for (const tr of d.trees) {
    const [x, y] = worldToMap(v, tr.x, tr.z)
    ctx.fillRect(x - 3, y - 3, 6, 6)
  }
  // buildings
  for (const b of d.buildings) {
    const [x, y] = worldToMap(v, b.x, b.z)
    const rot = Math.abs(Math.sin(b.yaw)) > 0.5
    const w = (rot ? b.d : b.w) * v.scale, h = (rot ? b.w : b.d) * v.scale
    ctx.fillStyle = b.kind === 'core' ? '#e8dcc0' : b.kind === 'supply' ? '#5aa0d0' : b.kind === 'hq' ? '#b04a3a' : b.state === 0 ? '#9a8a74' : b.state === 1 ? '#6e5e4a' : '#3e3328'
    ctx.fillRect(x - w / 2, y - h / 2, Math.max(1.5, w), Math.max(1.5, h))
    if (b.fire) {
      ctx.fillStyle = (t * 4) % 1 > 0.5 ? '#ff8a2a' : '#ffcf4a'
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
    }
  }
  // walls
  for (const s of d.segments) {
    const [ax, ay] = worldToMap(v, s.ax, s.az)
    const [bx, by] = worldToMap(v, s.bx, s.bz)
    ctx.lineWidth = Math.max(3, 9 * v.scale)
    ctx.strokeStyle = !s.breakable ? '#b8ac94' : s.open ? '#ff3a2a' : hpColor(s.hp)
    if (s.open) ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    ctx.setLineDash([])
    if (s.gate) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      ctx.fillStyle = s.open ? '#ff3a2a' : '#ffe8b0'
      ctx.fillRect(mx - 4, my - 4, 8, 8)
    }
  }
  // core
  {
    const [x, y] = worldToMap(v, d.core.x, d.core.z)
    ctx.fillStyle = '#ffd25a'
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 ? 4 : 9
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  // facilities
  for (const f of d.facilities) {
    const [x, y] = worldToMap(v, f.x, f.z)
    ctx.fillStyle = FAC_COL[f.type] ?? '#fff'
    ctx.fillRect(x - 3, y - 3, 6, 6)
    ctx.strokeStyle = '#000'
    ctx.strokeRect(x - 3, y - 3, 6, 6)
  }
  // build slots (shop)
  if (o.slots) {
    for (const s of o.slots) {
      const [x, y] = worldToMap(v, s.pos.x, s.pos.z)
      const occ = o.occupied?.has(s.id)
      ctx.strokeStyle = s.id === o.selected ? '#ffffff' : occ ? '#e0b45a' : '#9fd0ff'
      ctx.lineWidth = s.id === o.selected ? 3 : 2
      ctx.beginPath()
      if (s.kind === 'wall') ctx.rect(x - 6, y - 6, 12, 12)
      else if (s.kind === 'trap') ctx.arc(x, y, 6, 0, Math.PI * 2)
      else if (s.kind === 'core') ctx.arc(x, y, 9, 0, Math.PI * 2)
      else {
        ctx.moveTo(x, y - 7)
        ctx.lineTo(x + 7, y)
        ctx.lineTo(x, y + 7)
        ctx.lineTo(x - 7, y)
        ctx.closePath()
      }
      ctx.stroke()
      if (s.id === o.selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fill()
      }
    }
  }
  // civilians & soldiers
  ctx.fillStyle = '#f4efe0'
  for (const c of d.civilians) {
    const [x, y] = worldToMap(v, c.x, c.z)
    ctx.fillRect(x - 1, y - 1, 2, 2)
  }
  for (const s of d.soldiers) {
    const [x, y] = worldToMap(v, s.x, s.z)
    ctx.fillStyle = s.kind === 'survey' ? '#6fd08a' : s.kind === 'garrison' ? '#e07a5a' : '#8ad0ff'
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
  }
  // titans — only those inside a detection radius (walls, watchtowers, bell tower, player)
  for (const ti of d.titans) {
    const seen = o.detectAll || ti.marked || ti.inside || d.detection.some(([x, z, r]) => (ti.x - x) ** 2 + (ti.z - z) ** 2 < r * r)
    if (!seen) continue
    const [x, y] = worldToMap(v, ti.x, ti.z)
    const r = ti.boss ? 6 + Math.sin(t * 6) * 1.5 : ti.type === 'abnormal' ? 3.5 : 3
    ctx.fillStyle = ti.boss ? '#ff2a2a' : ti.type === 'abnormal' ? '#ff8a3a' : '#e04a3a'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = ti.marked ? '#d07aff' : '#000'
    ctx.lineWidth = ti.marked ? 2 : 1
    ctx.stroke()
  }
  // player arrow
  {
    const [x, y] = worldToMap(v, d.player.x, d.player.z)
    const a = d.player.yaw
    // forward (sin yaw, cos yaw) in world → map dir (sin yaw, cos yaw)
    const fx = Math.sin(a), fy = Math.cos(a)
    ctx.fillStyle = '#ffe27a'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x + fx * 9, y + fy * 9)
    ctx.lineTo(x - fx * 5 + fy * 5, y - fy * 5 - fx * 5)
    ctx.lineTo(x - fx * 2, y - fy * 2)
    ctx.lineTo(x - fx * 5 - fy * 5, y - fy * 5 + fx * 5)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}
