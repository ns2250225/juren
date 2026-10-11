import * as THREE from 'three'
import type { Titan } from './TitanManager'
import type { TitanPart } from '../models/TitanModel'

/**
 * Weak point rules (PRD §5.2):
 *  头部: stagger/stun · 手臂: lose grab ability · 腿部: slow / fall · 后颈: fatal · 装甲: needs armour break first.
 * Normal titans die from any sharp nape hit; bosses have a nape pool + phase mechanics.
 */
export type DamageSource = 'player' | 'npc' | 'cannon' | 'ballista' | 'eren' | 'rock' | 'trap' | 'skill'

export interface HitOpts {
  armorPierce?: number
  napeMult?: number
  ignoreHarden?: boolean
  point?: THREE.Vector3
  speed?: number
  stun?: number
}

export interface HitResult {
  killed: boolean
  nape: boolean
  deflected: boolean
  damage: number
  text: string
  armorBroken?: boolean
  bladeWear: number
}

export function applyHit(t: Titan, part: TitanPart, dmg: number, src: DamageSource, o: HitOpts = {}): HitResult {
  const r: HitResult = { killed: false, nape: false, deflected: false, damage: 0, text: '', bladeWear: 1 }
  if (!t.alive) return r
  const pierce = o.armorPierce ?? 1
  if (t.markedT > 0) dmg *= 1.35
  if (t.exposedT > 0 && part === 'nape') dmg *= 2
  t.lastDamage = t.age
  t.alerted = Math.max(t.alerted, 6)

  if (part === 'nape') {
    r.nape = true
    // female titan crystal hardening deflects nape hits
    if (t.hardenT > 0 && !o.ignoreHarden && t.exposedT <= 0) {
      r.deflected = true
      r.text = '硬质化！'
      r.bladeWear = 5
      return r
    }
    // armoured titan: nape armour must break first
    if (t.armor > 0 && t.exposedT <= 0) {
      const ap = src === 'player' || src === 'skill' ? (pierce > 1 ? 36 : 13) : src === 'ballista' ? 22 : src === 'cannon' ? 7 : src === 'eren' ? 30 : 5
      t.armor -= ap * Math.max(1, dmg / 120)
      r.deflected = true
      r.bladeWear = pierce > 1 ? 1.5 : 3
      r.damage = Math.round(ap)
      if (t.armor <= 0) {
        t.armor = 0
        t.model.setNapeArmor(false)
        r.armorBroken = true
        r.text = '装甲碎裂！'
      } else r.text = '装甲'
      return r
    }
    if (t.colossalSteam > 0 && src === 'player') {
      r.deflected = true
      r.text = '蒸汽阻挡！'
      return r
    }
    if (!t.def.boss) {
      // any decent cut through the nape kills a regular titan
      if (dmg >= 25 || src === 'eren' || src === 'skill') {
        r.killed = true
        r.damage = Math.round(dmg)
        t.kill(src)
        return r
      }
      r.damage = Math.round(dmg)
      t.hp -= dmg
      return r
    }
    const nd = dmg * (o.napeMult ?? 1)
    t.napeHP -= nd
    r.damage = Math.round(nd)
    if (t.napeHP <= 0) {
      r.killed = true
      t.kill(src)
    } else {
      // being cut hurts: bosses flinch
      t.stun(t.type === 'colossal' ? 0.6 : 1.1)
      if (t.type === 'female' && Math.random() < 0.5) t.hardenCD = Math.min(t.hardenCD, 0.5)
    }
    return r
  }

  // body parts
  let mult = 1
  if (t.type === 'armored' && part !== 'legL' && part !== 'legR' && t.exposedT <= 0) mult = pierce > 1 ? 0.6 : 0.15
  if (t.type === 'colossal') mult *= 0.6
  const d = dmg * mult
  t.hp -= d
  r.damage = Math.round(d)
  if (mult < 0.5) {
    r.deflected = true
    r.bladeWear = 2.5
  }
  switch (part) {
    case 'head':
      if (src === 'player' || src === 'skill' || src === 'npc') {
        t.stun(t.def.boss ? 0.5 : 1.6)
        r.text = '致盲'
      } else t.stun(o.stun ?? 0.8)
      break
    case 'armL':
      t.armDisabled = Math.max(t.armDisabled, t.def.boss ? 3 : 10)
      r.text = '断臂'
      break
    case 'armR':
      t.armDisabled = Math.max(t.armDisabled, t.def.boss ? 3 : 10)
      r.text = '断臂'
      // releasing a held victim when the grabbing arm is cut
      t.releaseVictim(true)
      break
    case 'legL':
    case 'legR':
      t.slowT = Math.max(t.slowT, 8)
      t.legHits++
      t.legHitT = 4
      if (t.legHits >= 2 && !t.def.boss) {
        t.knockdown(5)
        r.text = '倒地！'
        t.legHits = 0
      } else r.text = '腿伤'
      break
    default:
      if (o.stun) t.stun(o.stun)
  }
  if (t.hp <= 0) {
    t.hp = t.maxHp * 0.45
    if (t.def.boss) {
      t.stun(t.type === 'colossal' ? 6 : 4)
      r.text = '巨人硬直！'
      if (t.type === 'armored') t.exposedT = Math.max(t.exposedT, 5)
    } else {
      t.knockdown(5)
      r.text = '倒地！'
    }
  }
  return r
}
