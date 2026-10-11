import * as THREE from 'three'
import type { Titan } from './TitanManager'
import type { WallSegment } from '../world/WallSystem'
import { rand, clamp } from '../../utils/math'

/**
 * Titan finite-state machine (PRD §5.3):
 *   spawn → march to city → found target? → chase & grab (player / NPC) | attack building | attack gate
 *   → nape fatal hit → death & steam dissipation.
 * Also: entry selection (gate / weakest wall / breach) with re-planning on breaches, type-specific
 * targeting, abnormal randomness, boss attack phases. LOD is handled by the caller (dt accumulates).
 */
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

function strikeDamage(t: Titan) {
  return t.def.attackDamage * (t.def.boss ? 1 : 0.4 + t.height / 15)
}

export function chooseEntry(t: Titan): WallSegment {
  const w = t.game.walls
  const segs = w.breakable
  const open = segs.filter((s) => s.open)
  const gate = w.gate.seg
  const dist = (s: WallSegment) => s.outside.distanceTo(t.pos)
  const nearestOf = (list: WallSegment[]) => list.reduce((a, b) => (dist(a) < dist(b) ? a : b))
  if (t.type === 'armored' || t.type === 'colossal') return gate
  if (open.length) {
    const no = nearestOf(open)
    if (t.type === 'abnormal' || dist(no) < dist(gate) * 1.6 || Math.random() < 0.7) return no
  }
  if (t.type === 'abnormal') {
    // bypass defences: weakest / least covered segment
    const scored = segs.map((s) => ({ s, v: s.hpFrac + t.game.defense.coverage(s.mid) * 0.35 + Math.random() * 0.3 + dist(s) / 900 }))
    scored.sort((a, b) => a.v - b.v)
    return scored[0].s
  }
  if (Math.random() < 0.7) return gate
  const close = [...segs].sort((a, b) => dist(a) - dist(b)).slice(0, 3)
  return close[Math.floor(Math.random() * close.length)]
}

function perceivePlayer(t: Titan): boolean {
  const p = t.game.player
  if (!p.alive || p.titanForm || p.grabbedBy) return false
  const d = Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z)
  const range = t.type === 'female' ? 150 : 22 + t.height * 1.4 + (t.alerted > 0 ? 25 : 0)
  if (d > range) return false
  if (p.pos.y > t.height * 1.25 + 6) return false
  if (t.type === 'abnormal' && t.erraticT > 1.5 && Math.random() < 0.6) return false
  return true
}

function nearEntryOrAttack(t: Titan) {
  const e = t.entry!
  if (e.open) {
    t.setState('enter')
  } else {
    t.setState('attackWall')
    e.attackers++
  }
}

function attackCycle(t: Titan, dt: number, onHit: () => void, kinds: ('smash' | 'swipe')[] = ['smash', 'swipe']) {
  const action = t.pose === 'smash' || t.pose === 'swipe'
  if (!action || t.poseT >= t.poseDur) {
    if (t.attackCD > 0) {
      if (t.pose !== 'idle') t.setPose('idle')
      return
    }
    t.setPose(kinds[Math.floor(Math.random() * kinds.length)], 1.3 + t.height / 40)
    t.attackCD = t.def.attackInterval * rand(0.8, 1.2)
  } else if (!t.actionFired && t.poseT / t.poseDur > 0.6) {
    t.actionFired = true
    onHit()
  }
}

function startChase(t: Titan) {
  t.setState('chase')
}

function victimNear(t: Titan) {
  // NPC victims inside the city (civilians first)
  if (!t.inside && t.state !== 'march') return null
  return t.game.npcs.findVictim(t.pos, t.inside ? 32 + t.height : 14 + t.height)
}

function reach(t: Titan) {
  return t.height * 0.55 + 2.5
}

function updateErenAggro(t: Titan, dt: number): boolean {
  const p = t.game.player
  if (!p.titanForm || !p.titanModel) return false
  const d = p.pos.distanceTo(t.pos)
  if (d > 80 && t.aggroT <= 0) return false
  if (t.type === 'colossal' || t.type === 'beast') return false
  if (t.state !== 'aggroEren' && t.state !== 'swipe') t.setState('aggroEren')
  if (t.state === 'aggroEren') {
    if (d > reach(t) + 3) {
      t.setPose(t.type === 'abnormal' ? 'run' : 'walk')
      t.moveTo(p.pos, dt, 1.2, 2.5)
    } else if (t.attackCD <= 0) {
      t.setState('swipe')
      t.setPose('swipe', 1)
      t.attackCD = t.def.attackInterval
    } else {
      t.faceTo(p.pos, dt)
      if (t.pose !== 'idle') t.setPose('idle')
    }
  }
  return true
}

export function updateTitanAI(t: Titan, dt: number) {
  const g = t.game
  t.stateT += dt
  if (!t.alive) return
  if (t.stunT > 0 || t.knockT > 0 || t.boundT > 0) return
  if (t.state === 'hold') return holdState(t, dt)
  if (t.state === 'grab') return grabState(t, dt)
  if (t.state === 'swipe') return swipeState(t, dt)
  if (t.state === 'kick') return kickState(t, dt)
  if (t.state === 'jump') return jumpState(t, dt)

  if (t.type === 'colossal') return colossalAI(t, dt)
  if (t.type === 'beast' && !t.inside) return beastAI(t, dt)
  if (updateErenAggro(t, dt)) return
  if (t.type === 'female' && femaleAI(t, dt)) return
  if (t.type === 'armored' && armoredAI(t, dt)) return

  // abnormal randomness: sudden sprints, leaps, direction changes, crawling
  if (t.type === 'abnormal') {
    t.erraticT -= dt
    if (t.erraticT <= 0) {
      t.erraticT = rand(2.5, 6)
      const r = Math.random()
      if (r < 0.3 && t.lod === 0) {
        t.setState('jump')
        t.vy = rand(10, 16)
        t.setPose('roar', 0.8)
        return
      }
      t.speedMul = r < 0.65 ? rand(1.4, 2.0) : rand(0.6, 1.1)
      t.wanderYaw = rand(-0.9, 0.9)
    }
  }

  // perception: player then NPC victims
  if (t.state !== 'chase' && t.state !== 'attackCore' && t.armDisabled <= 0 && perceivePlayer(t) && t.stateT > 0.5) startChase(t)

  switch (t.state) {
    case 'march': {
      if (!t.entry || (t.stateT > 6 && Math.random() < 0.02)) t.entry = chooseEntry(t)
      const e = t.entry
      tmp.copy(e.outside)
      if (t.type === 'abnormal' && t.wanderYaw) {
        const d = t.pos.distanceTo(tmp)
        if (d > 50) tmp.addScaledVector(e.dir, Math.sin(t.age * 0.7) * 30 * t.wanderYaw)
      }
      t.setPose(t.type === 'abnormal' ? (t.speedMul > 1.3 ? (t.height < 9 && Math.random() < 0.002 ? 'crawl' : 'run') : 'walk') : 'walk')
      if (t.pose === 'crawl') t.pose = 'run'
      const d = t.moveTo(tmp, dt, 1, t.type === 'abnormal' ? 3 : 1.4)
      if (d < t.radius + 3) nearEntryOrAttack(t)
      const v = victimNear(t)
      if (v && t.armDisabled <= 0) {
        t.targetP.copy(v.pos)
        t.setState('chase')
      }
      break
    }
    case 'attackWall': {
      const e = t.entry!
      if (e.open) {
        e.attackers = Math.max(0, e.attackers - 1)
        t.setState('enter')
        break
      }
      if (t.stateT > 8 && Math.random() < 0.01) {
        // re-plan towards a fresh breach
        const ne = chooseEntry(t)
        if (ne !== e && ne.open) {
          e.attackers = Math.max(0, e.attackers - 1)
          t.entry = ne
          t.setState('march')
          break
        }
      }
      t.moveTo(e.outside, dt * 0.3, 0.5)
      t.faceTo(e.mid, dt)
      attackCycle(t, dt, () => {
        const dmg = strikeDamage(t)
        tmp.copy(e.mid).addScaledVector(e.out, e.thick / 2).setY(Math.min(t.height * 0.7, e.height - 2))
        if (e.gate && !e.gate.open) g.destruction.damageGate(dmg, tmp)
        else g.destruction.damageSegment(e, dmg, tmp)
      })
      break
    }
    case 'enter': {
      const e = t.entry!
      t.setPose(t.type === 'abnormal' ? 'run' : 'walk')
      const d = t.moveTo(e.inside, dt, 1, 2)
      if (d < 4 || (t.inside && t.stateT > 12)) {
        t.inside = true
        t.wantCore = t.type === 'abnormal' ? Math.random() < 0.7 : Math.random() < 0.4
        t.setState('roam')
      } else if (t.stateT > 20 && !e.open) t.setState('march')
      break
    }
    case 'roam': {
      roam(t, dt)
      break
    }
    case 'attackBuilding': {
      const b = t.targetB
      if (!b || !b.alive) {
        if (b) b.attackers = Math.max(0, b.attackers - 1)
        t.targetB = null
        t.setState('roam')
        break
      }
      t.faceTo(b.pos, dt)
      attackCycle(t, dt, () => {
        tmp.set(b.x, Math.min(b.h, t.height * 0.7), b.z)
        g.destruction.damageBuilding(b, strikeDamage(t), tmp)
      })
      const v = victimNear(t)
      if (v && t.armDisabled <= 0 && t.stateT > 2) {
        b.attackers = Math.max(0, b.attackers - 1)
        t.setState('chase')
      }
      break
    }
    case 'attackCore': {
      const c = g.city.core
      const il = g.defense.innerLine
      if (il && il.hp > 0) {
        t.faceTo(il.pos, dt)
        if (t.pos.distanceTo(il.pos) > 28 + t.radius) {
          t.setPose('walk')
          t.moveTo(il.pos, dt)
          break
        }
        attackCycle(t, dt, () => g.defense.damageInnerLine(strikeDamage(t)))
        break
      }
      t.faceTo(c.pos, dt)
      attackCycle(t, dt, () => {
        tmp.set(c.x, Math.min(20, t.height * 0.7), c.z + 6)
        g.destruction.damageCore(strikeDamage(t), tmp)
      })
      break
    }
    case 'chase': {
      chase(t, dt)
      break
    }
    case 'aggroEren':
      t.setState(t.inside ? 'roam' : 'march')
      break
    default:
      t.setState(t.inside ? 'roam' : 'march')
  }
}

function roam(t: Titan, dt: number) {
  const g = t.game
  const core = g.city.core
  const corePos = tmp2.set(core.x, 0, core.z + (g.map.layout === 'district' ? 12 : 14))
  const il = g.defense.innerLine
  const ilR = il && il.hp > 0 ? 24 : 0
  if (t.pos.distanceTo(corePos) < t.radius + 10 + ilR) {
    t.setState('attackCore')
    return
  }
  const v = victimNear(t)
  if (v && t.armDisabled <= 0) {
    t.setState('chase')
    return
  }
  if (!t.wantCore && (!t.targetB || !t.targetB.alive)) {
    const near = g.city.buildingsNear(t.pos.x, t.pos.z, 70).filter((b) => b.kind !== 'core' && b.attackers < 2)
    t.targetB = near.length ? near[Math.floor(Math.random() * near.length)] : null
    if (!t.targetB) t.wantCore = true
  }
  const goal = t.wantCore || !t.targetB ? corePos : t.targetB.pos
  t.setPose(t.type === 'abnormal' || t.type === 'armored' ? 'run' : 'walk')
  // obstacle: a building directly ahead gets smashed
  const f = t.forward
  tmp.copy(t.pos).addScaledVector(f, t.radius + 2)
  const blocking = g.city.buildingsNear(tmp.x, tmp.z, t.radius * 0.6).find((b) => b.kind !== 'core')
  if (blocking) {
    if (t.type === 'armored') {
      g.destruction.damageBuilding(blocking, 9999, tmp.clone().setY(4))
    } else {
      t.targetB = blocking
      blocking.attackers++
      t.setState('attackBuilding')
      return
    }
  }
  const d = t.moveTo(goal, dt, 1, 2)
  if (!t.wantCore && t.targetB && d < t.targetB.radius + t.radius + 2) {
    t.targetB.attackers++
    t.setState('attackBuilding')
  }
}

function chase(t: Titan, dt: number) {
  const g = t.game
  const p = g.player
  let target: THREE.Vector3 | null = null
  let isPlayer = false
  if (perceivePlayer(t)) {
    target = p.pos
    isPlayer = true
  } else {
    const v = victimNear(t)
    if (v) target = v.pos
  }
  if (!target || t.stateT > 14 || t.armDisabled > 0) {
    t.setState(t.inside ? 'roam' : t.entry ? 'march' : 'march')
    return
  }
  const dxz = Math.hypot(target.x - t.pos.x, target.z - t.pos.z)
  const r = reach(t)
  if (dxz > r) {
    t.setPose(t.type === 'abnormal' || t.type === 'female' ? 'run' : 'walk')
    t.moveTo(target, dt, t.type === 'female' ? 1.1 : 1.25, 3)
    return
  }
  if (t.faceTo(target, dt, 4) > 0.6 || t.attackCD > 0) return
  const airborne = isPlayer && target.y > t.height * 0.35
  if (airborne || (isPlayer && Math.random() < 0.35)) {
    t.setState('swipe')
    t.setPose('swipe', 0.95 + t.height / 60)
  } else {
    t.setState('grab')
    t.setPose('grab', 1.4 + t.height / 50)
  }
  t.attackCD = t.def.attackInterval
}

function grabState(t: Titan, dt: number) {
  const g = t.game
  const p = t.poseT / t.poseDur
  if (!t.actionFired && p > 0.42) {
    t.actionFired = true
    const hand = t.model.handR.getWorldPosition(new THREE.Vector3())
    const rr = 2.6 + t.height * 0.12
    const pl = g.player
    if (pl.alive && !pl.titanForm && pl.canBeGrabbed() && pl.pos.clone().setY(pl.pos.y + 0.9).distanceTo(hand) < rr) {
      t.victim = { kind: 'player' }
      pl.grabbedByTitan(t)
      t.setState('hold')
      t.holdT = 0
      t.setPose('grab', 1.4)
      t.poseT = t.poseDur * 0.6
      return
    }
    const npc = g.npcs.grabAt(hand, rr, t)
    if (npc) {
      t.victim = { kind: 'npc', npc }
      t.setState('hold')
      t.holdT = 0
      return
    }
  }
  if (p >= 1) t.setState(t.inside ? 'roam' : 'march')
}

function holdState(t: Titan, dt: number) {
  t.holdT += dt
  if (!t.victim) {
    t.setState(t.inside ? 'roam' : 'march')
    return
  }
  if (t.holdT > 1.2 && t.pose !== 'bite') t.setPose('bite', 2)
  if (t.victim.kind === 'npc' && t.holdT > 2.4) {
    const npc = t.victim.npc!
    t.victim = null
    t.game.npcs.eaten(npc.id, t)
    t.setState(t.inside ? 'roam' : 'march')
  }
  if (t.victim?.kind === 'player' && t.holdT > 4.5) {
    t.game.player.eatenBy(t)
    t.victim = null
    t.setState(t.inside ? 'roam' : 'march')
  }
}

function swipeState(t: Titan, dt: number) {
  const g = t.game
  const p = t.poseT / t.poseDur
  if (!t.actionFired && p > 0.5) {
    t.actionFired = true
    const hand = t.model.handR.getWorldPosition(new THREE.Vector3())
    const rr = 3 + t.height * 0.16
    const pl = g.player
    if (pl.titanForm && pl.titanModel) {
      if (pl.pos.distanceTo(t.pos) < reach(t) + 4) pl.titanHurt(t.def.playerDamage * 3, t)
    } else if (pl.alive && pl.pos.clone().setY(pl.pos.y + 0.9).distanceTo(hand) < rr) {
      pl.hurt(t.def.playerDamage, hand.clone().sub(t.pos).setY(0).normalize().multiplyScalar(18).setY(6), t)
    }
    g.npcs.swatAt(hand, rr)
  }
  if (p >= 1) t.setState(t.inside ? 'roam' : 'march')
}

function kickState(t: Titan, dt: number) {
  const g = t.game
  const p = t.poseT / t.poseDur
  if (!t.actionFired && p > 0.5) {
    t.actionFired = true
    const foot = t.model.kneeR.getWorldPosition(new THREE.Vector3())
    const pl = g.player
    if (pl.alive && !pl.titanForm && pl.pos.distanceTo(foot) < 4 + t.height * 0.2) pl.hurt(t.def.playerDamage, t.forward.multiplyScalar(22).setY(8), t)
    if (pl.titanForm && pl.pos.distanceTo(t.pos) < reach(t) + 5) pl.titanHurt(t.def.playerDamage * 3, t)
  }
  if (p >= 1) t.setState(t.inside ? 'roam' : 'march')
}

function jumpState(t: Titan, dt: number) {
  const g = t.game
  t.pos.y += t.vy * dt
  t.vy -= 18 * dt
  const e = t.entry
  if (e) t.moveTo(e.open ? e.inside : e.outside, dt, 2.2, 2)
  if (t.pos.y <= 0) {
    t.pos.y = 0
    t.vy = 0
    g.shake(t.pos, 0.6)
    g.particles.emit('dust', t.pos.x, 0.5, t.pos.z, 14, { size: t.height / 7, spread: t.radius * 1.2, speed: 4 })
    g.audio.play('titanFall', { pos: t.pos, pitch: 1.4 })
    // crush anything underneath
    g.npcs.swatAt(t.pos.clone().setY(1), t.radius + 2)
    for (const b of g.city.buildingsNear(t.pos.x, t.pos.z, t.radius)) g.destruction.damageBuilding(b, 120, t.pos.clone().setY(3))
    t.setState(t.inside ? 'roam' : 'march')
  }
}

// ------------------------------------------------------------------ bosses

function armoredAI(t: Titan, dt: number): boolean {
  const g = t.game
  const gate = g.walls.gate
  t.bossPhase = t.armor > 0 ? '硬质装甲' : '装甲破碎'
  if (t.state === 'boss') {
    // charging run
    const target = t.targetP
    t.setPose('charge')
    const d = t.moveTo(target, dt, 3.0, 0.8)
    if (!t.inside && g.walls.isInside(t.pos.x, t.pos.z)) t.inside = true
    if (!gate.open && t.pos.distanceTo(gate.seg.mid) < t.radius + gate.seg.thick / 2 + 3) {
      g.destruction.damageGate(1500, gate.seg.mid.clone().setY(10))
      g.shake(t.pos, 1.2)
      g.banner('铠之巨人撞破城门！', 'danger')
      t.stun(0.8)
      t.entry = gate.seg
      t.setState('enter')
      return true
    }
    if (d < 3 || t.stateT > 18) {
      if (t.inside) {
        // slammed into the core
        const c = g.city.core
        if (t.pos.distanceTo(c.pos) < 40) g.destruction.damageCore(450, c.pos.clone().setY(10).setZ(c.z + 8))
        g.shake(t.pos, 1)
        t.stun(1.2)
        t.wantCore = true
        t.setState('roam')
      } else t.setState('march')
    }
    return true
  }
  if (!t.inside && !gate.open && t.state === 'march') {
    t.entry = gate.seg
    if (t.pos.distanceTo(gate.seg.outside) < 140 && t.stateT > 2) {
      t.targetP.copy(gate.seg.inside)
      t.setState('boss')
      g.banner('铠之巨人开始冲锋！', 'danger')
      g.audio.play('titanRoar', { pos: t.pos, pitch: 0.7, volume: 1.5 })
      return true
    }
  }
  if (t.inside && t.state === 'roam' && t.pos.distanceTo(g.city.core.pos) < 90 && t.pos.distanceTo(g.city.core.pos) > 30 && t.attackCD <= 0 && Math.random() < 0.01) {
    t.targetP.copy(g.city.core.pos).setZ(g.city.core.z + 14)
    t.setState('boss')
    t.attackCD = 10
    return true
  }
  return false
}

function colossalAI(t: Titan, dt: number) {
  const g = t.game
  const gate = g.walls.gate
  const seg = gate.seg
  const stand = tmp.copy(seg.mid).addScaledVector(seg.out, seg.thick / 2 + t.radius + 2)
  // steam phases
  if (t.colossalSteam > 0) {
    t.colossalSteam -= dt
    t.bossPhase = '高温蒸汽'
    if (t.pose !== 'steam') t.setPose('steam', 6)
    if (Math.random() < 0.9) {
      const h = t.height
      for (let i = 0; i < 3; i++) g.particles.emit('steam', t.pos.x + rand(-12, 12), rand(h * 0.3, h * 0.95), t.pos.z + rand(-12, 12), 2, { size: 6, spread: 6, up: 6, speed: 8 })
    }
    g.audio.setLoop('steam', clamp(1 - t.pos.distanceTo(g.player.pos) / 160, 0, 1))
    g.player.steamBlast(t.pos, t.height, dt)
    if (t.colossalSteam <= 0) {
      g.audio.setLoop('steam', 0)
      t.steamCD = rand(14, 20)
      t.setPose('idle')
    }
    return
  }
  t.bossPhase = '城墙攻击'
  t.steamCD -= dt
  if (t.state === 'march') {
    t.setPose('walk')
    const d = t.moveTo(stand, dt, 1, 0.5)
    if (d < 4) {
      t.setState('boss')
      t.stateT = 0
    }
    return
  }
  // at the wall
  t.faceTo(seg.mid.clone().addScaledVector(seg.out, -50), dt, 0.6)
  if (!gate.open && (t.pose !== 'kick' || t.poseT > t.poseDur)) {
    if (t.pose !== 'kick') {
      t.setPose('kick', 2.4)
      g.audio.play('titanRoar', { pos: t.pos, pitch: 0.45, volume: 1.6 })
    }
  }
  if (t.pose === 'kick' && !t.actionFired && t.poseT / t.poseDur > 0.55) {
    t.actionFired = true
    g.destruction.damageGate(99999, seg.mid.clone().setY(10))
    g.shake(t.pos, 1.5)
    g.banner('超大型巨人踢破了城门！', 'danger')
    for (let i = 0; i < 40; i++) g.particles.chunks(seg.mid.x + rand(-8, 8), rand(2, 20), seg.mid.z + rand(-6, 6), 1, '#5a3a22', 22, 2)
  }
  if (t.pose === 'kick' && t.poseT < t.poseDur) return
  if (t.steamCD <= 0) {
    t.colossalSteam = 6
    g.banner('超大型巨人释放高温蒸汽！', 'warn')
    g.audio.play('steam', { pos: t.pos, volume: 1.6 })
    return
  }
  // sweep the wall top: destroy adjacent segments and cannons
  attackCycle(t, dt, () => {
    const segs = g.walls.breakable
    const idx = segs.indexOf(seg)
    const pickIdx = clamp(idx + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2)), 0, segs.length - 1)
    const s = segs[pickIdx]
    g.destruction.damageSegment(s, strikeDamage(t), s.top.clone())
    g.defense.smashOnSegment(s.index)
    const pl = g.player
    if (pl.alive && pl.pos.distanceTo(s.top) < 20) pl.hurt(t.def.playerDamage, s.out.clone().multiplyScalar(-20).setY(10), t)
    g.npcs.swatAt(s.top, 18)
  }, ['swipe', 'smash'])
}

function beastAI(t: Titan, dt: number) {
  const g = t.game
  const pl = g.player
  const gate = g.walls.gate.seg
  if (!t.entry) {
    t.entry = gate
    t.targetP.copy(gate.mid).addScaledVector(gate.out, rand(150, 190)).addScaledVector(gate.dir, rand(-60, 60)).setY(0)
  }
  // melee if the player gets close
  const dPl = pl.alive && !pl.titanForm ? Math.hypot(pl.pos.x - t.pos.x, pl.pos.z - t.pos.z) : 999
  if (dPl < reach(t) + 4 && t.attackCD <= 0 && pl.pos.y < t.height * 1.3) {
    t.setState('swipe')
    t.setPose('swipe', 1.1)
    t.attackCD = 2.2
    return
  }
  if (t.state === 'march') {
    t.bossPhase = '接近中'
    t.setPose('walk')
    const d = t.moveTo(t.targetP, dt, 1, 1)
    if (d < 5) t.setState('boss')
    return
  }
  t.bossPhase = '远程投石'
  t.faceTo(gate.mid, dt, 1)
  t.throwCD -= dt
  if (t.stateT > 35) {
    t.targetP.copy(gate.mid).addScaledVector(gate.out, rand(140, 190)).addScaledVector(gate.dir, rand(-80, 80)).setY(0)
    t.setState('march')
    return
  }
  if (t.pose === 'throw') {
    if (!t.actionFired && t.poseT / t.poseDur > 0.55) {
      t.actionFired = true
      const hand = t.model.handR.getWorldPosition(new THREE.Vector3())
      g.projectiles.rockVolley(hand, t, dPl < 140)
      g.audio.play('rockThrow', { pos: hand, volume: 1.4 })
    }
    if (t.poseT >= t.poseDur) t.setPose('idle')
    return
  }
  if (t.throwCD <= 0) {
    t.throwCD = rand(5, 7)
    t.setPose('throw', 1.8)
    return
  }
  if (t.pose !== 'idle') t.setPose('idle')
}

function femaleAI(t: Titan, dt: number): boolean {
  const g = t.game
  const pl = g.player
  t.bossPhase = t.hardenT > 0 ? '硬质化' : '格斗'
  if (!pl.alive || pl.titanForm) return false
  const d = pl.pos.distanceTo(t.pos)
  if (d > 160) return false
  // defensive reactions when the player approaches the nape
  const nape = t.model.napeWorld(new THREE.Vector3())
  const dn = pl.pos.distanceTo(nape)
  if (dn < 22 && pl.speed > 12) {
    if (t.dodgeCD <= 0 && Math.random() < 0.35) {
      t.dodgeCD = rand(5, 8)
      t.setPose('dodge', 0.6)
      const side = Math.random() < 0.5 ? -1 : 1
      const right = new THREE.Vector3(Math.cos(t.yaw), 0, -Math.sin(t.yaw)).multiplyScalar(side * 9)
      t.tryMove(t.pos.x + right.x, t.pos.z + right.z)
      return true
    }
    if (t.hardenCD <= 0 && Math.random() < 0.5) {
      t.hardenCD = rand(9, 13)
      t.hardenT = 3.2
      t.model.setCrystal(true)
      t.setPose('harden', 1)
      g.audio.play('trap', { pos: nape, pitch: 1.6 })
      return true
    }
  }
  if (t.pose === 'dodge' || t.pose === 'harden') {
    if (t.poseT < t.poseDur) return true
  }
  // pursue & fight
  const dxz = Math.hypot(pl.pos.x - t.pos.x, pl.pos.z - t.pos.z)
  if (dxz > reach(t)) {
    t.setPose('run')
    t.moveTo(pl.pos, dt, 1, 3.5)
    return true
  }
  t.faceTo(pl.pos, dt, 5)
  if (t.attackCD <= 0) {
    t.attackCD = t.def.attackInterval
    if (pl.pos.y < t.height * 0.4) {
      t.setState('kick')
      t.setPose('kick', 0.8)
    } else {
      t.setState('swipe')
      t.setPose('punch', 0.7)
    }
  }
  return true
}
