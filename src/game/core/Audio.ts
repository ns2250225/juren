/**
 * Procedural audio for Titan Defense.
 * Everything is synthesized with the Web Audio API — no external assets.
 * All public methods are defensive: if audio is unavailable they are no-ops and never throw.
 */

export type SfxName =
  | 'hookFire' | 'hookAttach' | 'hookRetract' | 'gasBurst' | 'bladeSwing' | 'bladeHit' | 'napeHit'
  | 'bladeBreak' | 'bladeReplace' | 'titanStep' | 'titanRoar' | 'titanFall' | 'steam' | 'wallCrack'
  | 'collapse' | 'cannon' | 'ballista' | 'soldierShout' | 'bell' | 'alarm' | 'uiClick' | 'uiHover'
  | 'refill' | 'hurt' | 'death' | 'transform' | 'punch' | 'rockThrow' | 'rockImpact' | 'waveStart'
  | 'waveClear' | 'kill' | 'combo' | 'warning' | 'grab' | 'trap' | 'build' | 'flare' | 'dash' | 'scream'
export type MusicTrack = 'none' | 'menu' | 'battle' | 'breach' | 'boss' | 'victory' | 'defeat' | 'intermission'
export interface V3 { x: number; y: number; z: number }

type LoopName = 'gas' | 'wind' | 'fire' | 'steam'

const MAX_VOICES = 12
const DEFAULT_MAX_DIST = 400
const FAR_MAX_DIST = 1000
const CROSSFADE = 1.5

/** Sounds that carry far (titans, artillery, bells). */
const FAR_SOUNDS: ReadonlySet<SfxName> = new Set<SfxName>([
  'titanStep', 'titanRoar', 'titanFall', 'collapse', 'cannon', 'transform', 'bell', 'alarm',
  'punch', 'rockImpact', 'wallCrack', 'waveStart', 'steam', 'scream',
])
/** Reverb send amount per sound (default 0.12). */
const REVERB_SEND: Partial<Record<SfxName, number>> = {
  titanStep: 0.3, titanRoar: 0.4, titanFall: 0.45, collapse: 0.4, cannon: 0.45, transform: 0.5,
  bell: 0.5, alarm: 0.4, waveStart: 0.5, waveClear: 0.35, punch: 0.3, rockImpact: 0.3,
  scream: 0.35, soldierShout: 0.25, uiClick: 0, uiHover: 0, kill: 0.2, combo: 0.2,
}

const BPM: Record<MusicTrack, number> = {
  none: 60, menu: 70, battle: 140, breach: 164, boss: 100, victory: 92, defeat: 56, intermission: 80,
}

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)
const rnd = (a: number, b: number): number => a + Math.random() * (b - a)
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
const finite = (v: number, d: number): number => (Number.isFinite(v) ? v : d)

interface ActiveTrack {
  name: MusicTrack
  gain: GainNode
  step: number
  next: number
  stopAt: number // 0 = playing
}

interface LoopNodes {
  gain: GainNode
  filter: BiquadFilterNode
  intensity: number
}

/** Low-level synth helpers bound to a context and shared noise buffer. */
class Synth {
  constructor(public ctx: AudioContext, public noiseBuf: AudioBuffer) {}

  private cf(f: number): number {
    return clamp(finite(f, 440), 20, this.ctx.sampleRate * 0.45)
  }

  /** Percussive envelope: quick attack, exponential decay. */
  env(g: AudioParam, t: number, a: number, dur: number, vol: number): void {
    const v = Math.max(vol, 0.0002)
    g.setValueAtTime(0.0001, t)
    g.linearRampToValueAtTime(v, t + Math.max(0.001, a))
    g.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.005, dur))
  }

  /** Attack / sustain / release envelope. */
  envASR(g: AudioParam, t: number, a: number, dur: number, r: number, vol: number): void {
    const v = Math.max(vol, 0.0002)
    const rel = Math.min(r, dur * 0.8)
    const att = Math.min(a, dur - rel)
    g.setValueAtTime(0.0001, t)
    g.linearRampToValueAtTime(v, t + Math.max(0.002, att))
    g.setValueAtTime(v, t + Math.max(0.003, dur - rel))
    g.exponentialRampToValueAtTime(0.0001, t + dur)
  }

  filter(type: BiquadFilterType, f0: number, f1: number, q: number, t: number, dur: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(this.cf(f0), t)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(this.cf(f1), t + dur)
    return f
  }

  noiseSrc(t: number, dur: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = true
    s.start(t, Math.random() * (this.noiseBuf.duration - 0.1))
    s.stop(t + dur + 0.05)
    return s
  }

  /** Filtered noise burst. */
  noise(out: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1, a = 0.004): void {
    const s = this.noiseSrc(t, dur)
    const f = this.filter(type, f0, f1, q, t, dur)
    const g = this.ctx.createGain()
    this.env(g.gain, t, a, dur, vol)
    s.connect(f).connect(g).connect(out)
  }

  /** Oscillator with exponential pitch glide and percussive envelope. */
  tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, a = 0.004, lp = 0, detune = 0): void {
    const o = this.ctx.createOscillator()
    o.type = type
    o.detune.value = detune
    o.frequency.setValueAtTime(this.cf(f0), t)
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(this.cf(f1), t + dur)
    const g = this.ctx.createGain()
    this.env(g.gain, t, a, dur, vol)
    if (lp > 0) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = this.cf(lp)
      o.connect(f).connect(g)
    } else {
      o.connect(g)
    }
    g.connect(out)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  click(out: AudioNode, t: number, f: number, vol: number): void {
    this.noise(out, t, 0.018, vol, 'bandpass', f, f, 3, 0.001)
  }

  /** Metallic ring of inharmonic partials. */
  metal(out: AudioNode, t: number, base: number, dur: number, vol: number, ratios: readonly number[] = [1, 1.47, 2.09, 2.76]): void {
    ratios.forEach((r, i) => this.tone(out, 'sine', base * r, base * r * 0.995, t, dur * (1 - i * 0.15), vol / (1 + i * 0.6), 0.001))
  }

  crackles(out: AudioNode, t: number, span: number, n: number, vol: number, fLo = 900, fHi = 3500): void {
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * span
      this.noise(out, tt, rnd(0.01, 0.05), vol * rnd(0.3, 1), 'bandpass', rnd(fLo, fHi), rnd(fLo, fHi) * 0.7, 2, 0.001)
    }
  }

  /**
   * Buzzy source through parallel formant bandpasses (vocal-like).
   * pts: pitch points [timeOffset, freq].
   */
  vocal(out: AudioNode, t: number, dur: number, pts: ReadonlyArray<readonly [number, number]>, formants: ReadonlyArray<readonly [number, number, number]>, vol: number, vibHz = 0, vibDepth = 0, a = 0.02, detuneVoice = 0): void {
    const ctx = this.ctx
    const env = ctx.createGain()
    this.envASR(env.gain, t, a, dur, dur * 0.4, vol)
    const voices = detuneVoice > 0 ? 2 : 1
    for (let v = 0; v < voices; v++) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = v === 0 ? 0 : detuneVoice
      o.frequency.setValueAtTime(this.cf(pts[0][1]), t)
      for (let i = 1; i < pts.length; i++) o.frequency.exponentialRampToValueAtTime(this.cf(pts[i][1]), t + pts[i][0])
      if (vibHz > 0) {
        const lfo = ctx.createOscillator()
        lfo.frequency.value = vibHz
        const lg = ctx.createGain()
        lg.gain.value = vibDepth
        lfo.connect(lg).connect(o.frequency)
        lfo.start(t)
        lfo.stop(t + dur + 0.05)
      }
      o.connect(env)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    for (const [f, q, g] of formants) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = this.cf(f)
      bp.Q.value = q
      const fg = ctx.createGain()
      fg.gain.value = g
      env.connect(bp).connect(fg).connect(out)
    }
  }

  // ---------- music instruments ----------

  strings(out: AudioNode, midi: number, t: number, dur: number, vol: number, cutoff = 1800, staccato = false): void {
    const ctx = this.ctx
    const f = mtof(midi)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = this.cf(cutoff)
    lp.Q.value = 0.7
    const g = ctx.createGain()
    if (staccato) this.env(g.gain, t, 0.008, dur, vol)
    else this.envASR(g.gain, t, Math.min(0.25, dur * 0.3), dur, Math.min(0.4, dur * 0.3), vol)
    for (const d of [-9, 8]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = d
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    lp.connect(g).connect(out)
  }

  brass(out: AudioNode, midi: number, t: number, dur: number, vol: number, bright = 2200): void {
    const ctx = this.ctx
    const f = mtof(midi)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 1.2
    lp.frequency.setValueAtTime(this.cf(f * 1.5), t)
    lp.frequency.linearRampToValueAtTime(this.cf(f * 1.5 + bright), t + 0.08)
    lp.frequency.exponentialRampToValueAtTime(this.cf(f * 1.5 + bright * 0.35), t + Math.max(0.1, dur))
    const g = ctx.createGain()
    this.envASR(g.gain, t, 0.05, dur, Math.min(0.3, dur * 0.4), vol)
    for (const d of [-12, 0, 11]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = d
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    lp.connect(g).connect(out)
  }

  /** Choir-like pad: detuned triangles + formant bandpasses. */
  pad(out: AudioNode, midis: readonly number[], t: number, dur: number, vol: number, vowel: 'ah' | 'oh' = 'ah'): void {
    const ctx = this.ctx
    const mix = ctx.createGain()
    this.envASR(mix.gain, t, dur * 0.3, dur, dur * 0.35, vol / Math.sqrt(midis.length))
    for (const m of midis) {
      for (const d of [-11, 10]) {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = mtof(m)
        o.detune.value = d
        o.connect(mix)
        o.start(t)
        o.stop(t + dur + 0.05)
      }
    }
    const fm: ReadonlyArray<readonly [number, number, number]> = vowel === 'ah'
      ? [[750, 3, 1.6], [1180, 4, 1.0]]
      : [[480, 3, 1.6], [850, 4, 0.9]]
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    mix.connect(lp).connect(out)
    for (const [f, q, gg] of fm) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f
      bp.Q.value = q
      const fg = ctx.createGain()
      fg.gain.value = gg
      mix.connect(bp).connect(fg).connect(out)
    }
  }

  timpani(out: AudioNode, midi: number, t: number, vol: number, decay = 1.1): void {
    const f = mtof(midi)
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f * 1.6, t)
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06)
    o.frequency.exponentialRampToValueAtTime(f * 0.94, t + decay)
    const g = ctx.createGain()
    this.env(g.gain, t, 0.003, decay, vol)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + decay + 0.05)
    this.noise(out, t, 0.12, vol * 0.35, 'lowpass', 600, 200, 1, 0.002)
  }

  snare(out: AudioNode, t: number, vol: number): void {
    this.noise(out, t, 0.18, vol, 'bandpass', 2200, 1500, 0.8, 0.002)
    this.noise(out, t, 0.09, vol * 0.5, 'highpass', 5000, 5000, 0.7, 0.001)
    this.tone(out, 'triangle', 210, 150, t, 0.08, vol * 0.5)
  }

  pluck(out: AudioNode, midi: number, t: number, vol: number, dur = 1.6): void {
    const f = mtof(midi)
    this.tone(out, 'sine', f, f, t, dur, vol, 0.003)
    this.tone(out, 'triangle', f * 2, f * 2, t, dur * 0.5, vol * 0.3, 0.003, 3000)
    this.tone(out, 'sine', f * 3.01, f * 3.01, t, dur * 0.25, vol * 0.12, 0.002)
  }
}

export class AudioManager {
  private ctx: AudioContext | null = null
  private synth: Synth | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private sfxBus: GainNode | null = null
  private reverbIn: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private failed = false
  private paused = false

  private vol = { master: 0.8, music: 0.6, sfx: 0.9 }
  private listenerPos: V3 = { x: 0, y: 0, z: 0 }
  private listenerFwd: V3 = { x: 0, y: 0, z: -1 }
  private voices = new Map<SfxName, number>()
  private loops = new Map<LoopName, LoopNodes>()
  private loopIntensity: Record<LoopName, number> = { gas: 0, wind: 0, fire: 0, steam: 0 }
  private tracks: ActiveTrack[] = []
  private track: MusicTrack = 'none'

  /** Lazily creates AudioContext; safe to call many times; call from a user gesture. */
  init(): void {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended' && !this.paused) void this.ctx.resume().catch(() => undefined)
        return
      }
      if (this.failed || typeof window === 'undefined') return
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
      const AC = w.AudioContext || w.webkitAudioContext
      if (!AC) { this.failed = true; return }
      const ctx = new AC()
      this.ctx = ctx

      // Shared 2s white noise buffer
      const len = Math.floor(ctx.sampleRate * 2)
      const nb = ctx.createBuffer(1, len, ctx.sampleRate)
      const nd = nb.getChannelData(0)
      for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1
      this.synth = new Synth(ctx, nb)

      // Master chain
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.knee.value = 12
      comp.ratio.value = 5
      comp.attack.value = 0.004
      comp.release.value = 0.22
      comp.connect(ctx.destination)
      this.compressor = comp

      const master = ctx.createGain()
      master.gain.value = this.vol.master
      master.connect(comp)
      this.master = master

      const music = ctx.createGain()
      music.gain.value = this.vol.music * 0.7
      music.connect(master)
      this.musicBus = music

      const sfx = ctx.createGain()
      sfx.gain.value = this.vol.sfx
      sfx.connect(master)
      this.sfxBus = sfx

      // Reverb send: convolver with generated decaying-noise impulse
      const irLen = Math.floor(ctx.sampleRate * 2.6)
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate)
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c)
        for (let i = 0; i < irLen; i++) {
          const x = i / irLen
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 3.2) * (i < 80 ? i / 80 : 1)
        }
      }
      const conv = ctx.createConvolver()
      conv.buffer = ir
      const revIn = ctx.createGain()
      revIn.gain.value = 1
      const revOut = ctx.createGain()
      revOut.gain.value = 0.55
      revIn.connect(conv).connect(revOut).connect(master)
      this.reverbIn = revIn
      const musicSend = ctx.createGain()
      musicSend.gain.value = 0.35
      music.connect(musicSend).connect(revIn)

      this.createLoops()
      this.timer = setInterval(this.tick, 25)

      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)

      // If a track was requested before init, start it now.
      if (this.track !== 'none') {
        const tr = this.track
        this.track = 'none'
        this.playMusic(tr)
      }
    } catch {
      this.failed = true
      this.safeTeardown()
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state !== 'closed'
  }

  get currentTrack(): MusicTrack {
    return this.track
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol.master = clamp(finite(master, 0.8), 0, 1)
    this.vol.music = clamp(finite(music, 0.6), 0, 1)
    this.vol.sfx = clamp(finite(sfx, 0.9), 0, 1)
    try {
      const ctx = this.ctx
      if (!ctx) return
      const t = ctx.currentTime
      this.master?.gain.setTargetAtTime(this.vol.master, t, 0.05)
      this.musicBus?.gain.setTargetAtTime(this.vol.music * 0.7, t, 0.05)
      this.sfxBus?.gain.setTargetAtTime(this.vol.sfx, t, 0.05)
    } catch { /* ignore */ }
  }

  setListener(pos: V3, forward: V3): void {
    if (!pos || !forward) return
    this.listenerPos = { x: finite(pos.x, 0), y: finite(pos.y, 0), z: finite(pos.z, 0) }
    this.listenerFwd = { x: finite(forward.x, 0), y: finite(forward.y, 0), z: finite(forward.z, -1) }
  }

  play(name: SfxName, opts?: { volume?: number; pitch?: number; pos?: V3; maxDist?: number }): void {
    try {
      const ctx = this.ctx
      const synth = this.synth
      const bus = this.sfxBus
      if (!ctx || !synth || !bus || ctx.state !== 'running') return
      const count = this.voices.get(name) ?? 0
      if (count >= MAX_VOICES) return

      let vol = clamp(finite(opts?.volume ?? 1, 1), 0, 4)
      const pitch = clamp(finite(opts?.pitch ?? 1, 1), 0.1, 4)
      let pan = 0
      let cutoff = 0
      if (opts?.pos) {
        const maxDist = Math.max(1, finite(opts.maxDist ?? (FAR_SOUNDS.has(name) ? FAR_MAX_DIST : DEFAULT_MAX_DIST), DEFAULT_MAX_DIST))
        const lp = this.listenerPos
        const dx = finite(opts.pos.x, 0) - lp.x
        const dy = finite(opts.pos.y, 0) - lp.y
        const dz = finite(opts.pos.z, 0) - lp.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist >= maxDist) return
        const r = dist / maxDist
        const att = (1 - r) * (1 - r) / (1 + dist / (maxDist * 0.15))
        vol *= att
        if (vol < 0.003) return
        const fx = this.listenerFwd.x
        const fz = this.listenerFwd.z
        const fl = Math.hypot(fx, fz) || 1
        const rx = -fz / fl
        const rz = fx / fl
        const hd = Math.hypot(dx, dz)
        if (hd > 0.001) pan = clamp(((dx * rx + dz * rz) / hd) * Math.min(1, hd / 6), -1, 1) * 0.85
        cutoff = 700 + 19000 * Math.pow(1 - r, 3)
      }
      if (vol <= 0.0005) return

      const t = ctx.currentTime + 0.005
      const out = ctx.createGain()
      out.gain.value = vol
      let tail: AudioNode = out
      const nodes: AudioNode[] = [out]
      if (cutoff > 0 && cutoff < 18000) {
        const f = ctx.createBiquadFilter()
        f.type = 'lowpass'
        f.frequency.value = cutoff
        tail.connect(f)
        tail = f
        nodes.push(f)
      }
      if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner()
        p.pan.value = pan
        tail.connect(p)
        tail = p
        nodes.push(p)
      }
      tail.connect(bus)
      const sendAmt = REVERB_SEND[name] ?? 0.12
      if (sendAmt > 0 && this.reverbIn) {
        const s = ctx.createGain()
        s.gain.value = sendAmt
        out.connect(s).connect(this.reverbIn)
        nodes.push(s)
      }

      const dur = this.renderSfx(synth, name, out, t, pitch)
      this.voices.set(name, count + 1)
      setTimeout(() => {
        this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1))
        for (const n of nodes) { try { n.disconnect() } catch { /* ignore */ } }
      }, (dur + 0.3) * 1000)
    } catch { /* never throw */ }
  }

  setLoop(name: 'gas' | 'wind' | 'fire' | 'steam', intensity: number): void {
    const i = clamp(finite(intensity, 0), 0, 1)
    if (!(name in this.loopIntensity)) return
    this.loopIntensity[name] = i
    this.applyLoop(name)
  }

  playMusic(track: MusicTrack): void {
    try {
      if (track === this.track) return
      const ctx = this.ctx
      const bus = this.musicBus
      this.track = track
      if (!ctx || !bus) return
      const now = ctx.currentTime
      for (const tr of this.tracks) {
        if (tr.stopAt === 0) {
          tr.stopAt = now + CROSSFADE
          tr.gain.gain.cancelScheduledValues(now)
          tr.gain.gain.setValueAtTime(tr.gain.gain.value, now)
          tr.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE)
        }
      }
      if (track === 'none') return
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(1, now + CROSSFADE)
      g.connect(bus)
      this.tracks.push({ name: track, gain: g, step: 0, next: now + 0.08, stopAt: 0 })
    } catch { /* ignore */ }
  }

  setPaused(p: boolean): void {
    this.paused = p
    try {
      const ctx = this.ctx
      if (!ctx || ctx.state === 'closed') return
      if (p) void ctx.suspend().catch(() => undefined)
      else void ctx.resume().catch(() => undefined)
    } catch { /* ignore */ }
  }

  dispose(): void {
    this.safeTeardown()
    this.track = 'none'
  }

  // ------------------------------------------------------------------ internals

  private safeTeardown(): void {
    try { if (this.timer !== null) clearInterval(this.timer) } catch { /* ignore */ }
    this.timer = null
    const ctx = this.ctx
    this.ctx = null
    this.synth = null
    this.master = this.musicBus = this.sfxBus = this.reverbIn = null
    this.compressor = null
    this.loops.clear()
    this.tracks = []
    this.voices.clear()
    try { if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined) } catch { /* ignore */ }
  }

  private createLoops(): void {
    const ctx = this.ctx
    const synth = this.synth
    const bus = this.sfxBus
    if (!ctx || !synth || !bus) return
    const mk = (name: LoopName, chain: (src: AudioNode) => { filter: BiquadFilterNode; outNode: AudioNode }): void => {
      const src = ctx.createBufferSource()
      src.buffer = synth.noiseBuf
      src.loop = true
      src.loopStart = 0
      src.loopEnd = synth.noiseBuf.duration
      const { filter, outNode } = chain(src)
      const g = ctx.createGain()
      g.gain.value = 0
      outNode.connect(g).connect(bus)
      src.start(ctx.currentTime, Math.random())
      this.loops.set(name, { gain: g, filter, intensity: 0 })
    }
    mk('gas', (src) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.8
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200
      src.connect(bp).connect(hp)
      return { filter: bp, outNode: hp }
    })
    mk('wind', (src) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 1.3
      // slow gusting modulation of the band
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.27
      const lg = ctx.createGain(); lg.gain.value = 80
      lfo.connect(lg).connect(bp.frequency); lfo.start()
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000
      src.connect(bp).connect(lp)
      return { filter: bp, outNode: lp }
    })
    mk('fire', (src) => {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5
      src.connect(lp)
      return { filter: lp, outNode: lp }
    })
    mk('steam', (src) => {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4500; bp.Q.value = 0.4
      src.connect(hp).connect(bp)
      return { filter: bp, outNode: bp }
    })
    ;(Object.keys(this.loopIntensity) as LoopName[]).forEach((n) => this.applyLoop(n))
  }

  private applyLoop(name: LoopName): void {
    try {
      const ctx = this.ctx
      const l = this.loops.get(name)
      if (!ctx || !l) return
      const i = this.loopIntensity[name]
      l.intensity = i
      const t = ctx.currentTime
      let g = 0
      switch (name) {
        case 'gas':
          g = i * 0.35
          l.filter.frequency.setTargetAtTime(2200 + 2600 * i, t, 0.08)
          break
        case 'wind':
          g = Math.pow(i, 1.4) * 0.55
          l.filter.frequency.setTargetAtTime(250 + 1700 * i, t, 0.15)
          l.filter.Q.setTargetAtTime(1.5 - i * 0.8, t, 0.2)
          break
        case 'fire':
          g = i * 0.3
          l.filter.frequency.setTargetAtTime(500 + 600 * i, t, 0.2)
          break
        case 'steam':
          g = i * 0.4
          l.filter.frequency.setTargetAtTime(3500 + 2000 * i, t, 0.2)
          break
      }
      l.gain.gain.setTargetAtTime(g, t, name === 'gas' ? 0.04 : 0.12)
    } catch { /* ignore */ }
  }

  private tick = (): void => {
    try {
      const ctx = this.ctx
      const synth = this.synth
      if (!ctx || !synth || ctx.state !== 'running') return
      const now = ctx.currentTime
      // music
      for (const tr of this.tracks) {
        const sd = 60 / BPM[tr.name] / 4
        if (tr.next < now - 0.25) tr.next = now + 0.03
        let guard = 0
        while (tr.next < now + 0.1 && guard++ < 16) {
          if (tr.stopAt === 0 || tr.next < tr.stopAt) this.musicStep(synth, tr.name, tr.gain, tr.step, tr.next, sd)
          tr.step++
          tr.next += sd
        }
      }
      const keep: ActiveTrack[] = []
      for (const tr of this.tracks) {
        if (tr.stopAt > 0 && now > tr.stopAt + 0.5) {
          try { tr.gain.disconnect() } catch { /* ignore */ }
        } else keep.push(tr)
      }
      this.tracks = keep
      // fire crackles
      const fi = this.loopIntensity.fire
      const fireLoop = this.loops.get('fire')
      if (fi > 0.01 && fireLoop && Math.random() < fi * 0.6) {
        const tt = now + 0.02 + Math.random() * 0.04
        synth.noise(fireLoop.gain, tt, rnd(0.005, 0.03), rnd(0.5, 2.2), 'bandpass', rnd(1200, 5000), rnd(800, 3000), 2, 0.001)
        if (Math.random() < 0.15) synth.noise(fireLoop.gain, tt, rnd(0.05, 0.12), 1.2, 'lowpass', 400, 150, 1, 0.002)
      }
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ SFX

  /** Schedules a sound into `o` at time `t`; returns its duration in seconds. */
  private renderSfx(s: Synth, name: SfxName, o: AudioNode, t: number, p: number): number {
    switch (name) {
      case 'hookFire':
        s.click(o, t, 3200 * p, 0.9)
        s.tone(o, 'square', 1800 * p, 500 * p, t, 0.035, 0.12)
        s.noise(o, t + 0.01, 0.28, 0.45, 'bandpass', 2600 * p, 600 * p, 1.2, 0.01)
        return 0.32
      case 'hookAttach':
        s.noise(o, t, 0.07, 0.7, 'lowpass', 1200, 400)
        s.tone(o, 'triangle', 240 * p, 170 * p, t, 0.22, 0.5)
        s.metal(o, t, 920 * p, 0.22, 0.12)
        return 0.3
      case 'hookRetract':
        for (let i = 0; i < 11; i++) s.click(o, t + i * 0.034, (3400 - i * 190) * p, 0.55)
        s.tone(o, 'sawtooth', 140 * p, 80 * p, t, 0.42, 0.08, 0.02, 700)
        return 0.45
      case 'gasBurst':
        s.noise(o, t, 0.24, 0.6, 'bandpass', 2800 * p, 1200 * p, 0.7, 0.008)
        s.noise(o, t, 0.12, 0.25, 'highpass', 5000, 5000, 0.7, 0.004)
        return 0.26
      case 'bladeSwing':
        s.noise(o, t, 0.18, 0.55, 'bandpass', 1800 * p, 8000 * p, 2.2, 0.035)
        s.tone(o, 'sine', 5200 * p, 6300 * p, t + 0.03, 0.16, 0.04, 0.02)
        return 0.22
      case 'bladeHit':
        s.noise(o, t, 0.13, 0.8, 'lowpass', 900, 300)
        s.tone(o, 'sine', 150 * p, 60 * p, t, 0.16, 0.6)
        s.metal(o, t, 2300 * p, 0.12, 0.08)
        return 0.2
      case 'napeHit':
        s.noise(o, t, 0.26, 0.75, 'bandpass', 3400 * p, 800 * p, 1.4, 0.006)
        s.tone(o, 'sine', 95 * p, 32 * p, t + 0.02, 0.55, 1.0)
        s.noise(o, t + 0.02, 0.4, 0.65, 'lowpass', 400, 120)
        s.metal(o, t, 1750 * p, 0.3, 0.1)
        return 0.6
      case 'bladeBreak':
        s.noise(o, t, 0.05, 0.8, 'highpass', 4000, 4000, 0.8, 0.001)
        s.metal(o, t, 3100 * p, 0.35, 0.2, [1, 1.52, 2.23])
        s.tone(o, 'triangle', 1500 * p, 380 * p, t, 0.09, 0.2)
        return 0.4
      case 'bladeReplace':
        s.click(o, t, 4200 * p, 0.6)
        s.tone(o, 'sine', 2800 * p, 2800 * p, t, 0.06, 0.12)
        s.click(o, t + 0.13, 3600 * p, 0.7)
        s.tone(o, 'sine', 3300 * p, 3300 * p, t + 0.13, 0.08, 0.12)
        return 0.25
      case 'titanStep':
        s.tone(o, 'sine', 62 * p, 36 * p, t, 0.55, 1.0, 0.006)
        s.tone(o, 'sine', 120 * p, 48 * p, t, 0.16, 0.35, 0.003)
        s.noise(o, t, 0.45, 0.7, 'lowpass', 220 * p, 90 * p, 1, 0.006)
        s.crackles(o, t + 0.03, 0.15, 3, 0.08, 600, 1800)
        return 0.6
      case 'titanRoar': {
        const b = 92 * p
        s.vocal(o, t, 1.6, [[0, b * 0.85], [0.3, b * 1.15], [1.0, b * 1.05], [1.6, b * 0.7]],
          [[520, 4, 1.4], [900, 5, 0.9], [2300, 8, 0.35]], 0.75, 6, b * 0.05, 0.12, 23)
        s.noise(o, t, 1.5, 0.3, 'bandpass', 600, 300, 0.8, 0.15)
        s.tone(o, 'sawtooth', b * 0.5, b * 0.4, t, 1.5, 0.25, 0.15, 260)
        return 1.7
      }
      case 'titanFall':
        s.tone(o, 'sine', 48 * p, 20 * p, t, 2.6, 1.0, 0.02)
        s.noise(o, t, 2.6, 0.95, 'lowpass', 300 * p, 70, 0.8, 0.04)
        s.noise(o, t + 0.05, 0.4, 0.5, 'lowpass', 1500, 300, 1, 0.005)
        s.crackles(o, t + 0.1, 1.6, 14, 0.18, 600, 2500)
        return 2.7
      case 'steam':
        s.noise(o, t, 1.3, 0.5, 'highpass', 1800 * p, 3000 * p, 0.6, 0.02)
        s.noise(o, t, 0.9, 0.25, 'bandpass', 5000 * p, 3500 * p, 0.5, 0.02)
        return 1.35
      case 'wallCrack':
        s.crackles(o, t, 0.25, 9, 0.5, 1200, 3800)
        s.noise(o, t, 0.32, 0.6, 'lowpass', 1400 * p, 300 * p, 1, 0.003)
        s.tone(o, 'sine', 85 * p, 40 * p, t, 0.32, 0.5)
        return 0.4
      case 'collapse':
        s.noise(o, t, 2.3, 0.9, 'lowpass', 450 * p, 110 * p, 0.8, 0.1)
        s.tone(o, 'sine', 52 * p, 24 * p, t, 2.1, 0.8, 0.05)
        s.crackles(o, t, 2.0, 22, 0.35, 700, 3200)
        s.noise(o, t + 0.4, 1.4, 0.2, 'bandpass', 1800, 900, 1, 0.2)
        return 2.4
      case 'cannon':
        s.noise(o, t, 0.6, 1.0, 'lowpass', 2500 * p, 180 * p, 0.8, 0.002)
        s.tone(o, 'sine', 115 * p, 34 * p, t, 0.8, 1.0, 0.002)
        s.noise(o, t + 0.05, 1.6, 0.4, 'lowpass', 320, 90, 0.7, 0.06)
        return 1.7
      case 'ballista':
        s.tone(o, 'triangle', 230 * p, 175 * p, t, 0.45, 0.45, 0.002)
        s.tone(o, 'sawtooth', 460 * p, 350 * p, t, 0.3, 0.12, 0.002, 1600)
        s.click(o, t, 2500, 0.6)
        s.noise(o, t + 0.05, 0.4, 0.4, 'bandpass', 1600 * p, 400 * p, 1.2, 0.03)
        return 0.5
      case 'soldierShout': {
        const b = rnd(125, 160) * p
        s.vocal(o, t, 0.26, [[0, b * 1.1], [0.08, b * 1.2], [0.26, b * 0.85]],
          [[rnd(650, 760), 6, 1.6], [rnd(1100, 1300), 7, 1.0], [2600, 9, 0.3]], 0.55, 0, 0, 0.012)
        s.noise(o, t, 0.06, 0.12, 'highpass', 2500, 2500, 0.7, 0.003)
        return 0.3
      }
      case 'scream': {
        const b = 420 * p
        s.vocal(o, t, 0.85, [[0, b * 0.9], [0.15, b * 1.5], [0.6, b * 1.35], [0.85, b * 1.0]],
          [[900, 6, 1.4], [1500, 7, 1.0], [2900, 9, 0.5]], 0.45, 7, b * 0.04, 0.03, 12)
        return 0.9
      }
      case 'bell':
        this.bell(s, o, t, 330 * p, 3.8, 0.4)
        return 3.9
      case 'alarm':
        for (let i = 0; i < 4; i++) this.bell(s, o, t + i * 0.37, (i % 2 === 0 ? 660 : 523) * p, 0.8, 0.3)
        s.tone(o, 'square', 220 * p, 220 * p, t, 1.5, 0.06, 0.05, 900)
        s.tone(o, 'square', 233 * p, 233 * p, t, 1.5, 0.04, 0.05, 900)
        return 2.3
      case 'uiClick':
        s.tone(o, 'sine', 1300 * p, 800 * p, t, 0.05, 0.18)
        s.click(o, t, 4000, 0.08)
        return 0.07
      case 'uiHover':
        s.tone(o, 'sine', 1900 * p, 1900 * p, t, 0.04, 0.05, 0.004)
        return 0.05
      case 'refill':
        s.noise(o, t, 0.62, 0.4, 'bandpass', 700 * p, 4200 * p, 1.2, 0.4)
        s.click(o, t + 0.64, 3000 * p, 0.7)
        s.tone(o, 'sine', 2000 * p, 2000 * p, t + 0.64, 0.06, 0.08)
        return 0.75
      case 'hurt':
        s.tone(o, 'sine', 190 * p, 65 * p, t, 0.22, 0.75)
        s.noise(o, t, 0.13, 0.5, 'lowpass', 700, 250)
        return 0.25
      case 'death':
        s.tone(o, 'sawtooth', 220 * p, 52 * p, t, 1.6, 0.25, 0.02, 800)
        s.tone(o, 'sine', 110 * p, 38 * p, t, 1.6, 0.4, 0.02)
        return 1.65
      case 'transform':
        s.noise(o, t, 0.12, 1.0, 'highpass', 1200, 800, 0.7, 0.001)
        s.crackles(o, t, 0.35, 12, 0.7, 1500, 6000)
        s.tone(o, 'sine', 65 * p, 22 * p, t + 0.05, 2.6, 1.0, 0.01)
        s.noise(o, t + 0.05, 3.0, 0.9, 'lowpass', 400 * p, 60, 0.7, 0.05)
        s.tone(o, 'sawtooth', 55 * p, 30 * p, t + 0.05, 1.8, 0.25, 0.02, 300)
        return 3.1
      case 'punch':
        s.tone(o, 'sine', 95 * p, 30 * p, t, 0.42, 1.0, 0.002)
        s.noise(o, t, 0.2, 0.8, 'lowpass', 900, 250, 1, 0.002)
        s.noise(o, t + 0.02, 0.5, 0.45, 'lowpass', 250, 90, 0.8, 0.02)
        return 0.55
      case 'rockThrow':
        s.noise(o, t, 0.65, 0.5, 'bandpass', 300 * p, 1100 * p, 1.5, 0.25)
        s.tone(o, 'sine', 85 * p, 60 * p, t, 0.3, 0.35, 0.01)
        return 0.7
      case 'rockImpact':
        s.noise(o, t, 0.5, 0.95, 'lowpass', 1800 * p, 300 * p, 0.8, 0.002)
        s.tone(o, 'sine', 75 * p, 30 * p, t, 0.5, 0.9, 0.002)
        s.crackles(o, t, 0.5, 12, 0.4, 900, 3500)
        return 0.65
      case 'waveStart': {
        const f = 110 * p
        const ctx = s.ctx
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.Q.value = 2
        lp.frequency.setValueAtTime(260, t)
        lp.frequency.exponentialRampToValueAtTime(1300, t + 1.1)
        lp.frequency.exponentialRampToValueAtTime(400, t + 2.4)
        const g = ctx.createGain()
        s.envASR(g.gain, t, 0.7, 2.5, 0.8, 0.45)
        for (const [mul, det] of [[1, -14], [1, 0], [1, 13], [0.5, 6], [1.5, -5]] as const) {
          const osc = ctx.createOscillator()
          osc.type = 'sawtooth'
          osc.detune.value = det
          osc.frequency.setValueAtTime(f * mul * 0.94, t)
          osc.frequency.exponentialRampToValueAtTime(f * mul, t + 0.35)
          osc.connect(lp)
          osc.start(t)
          osc.stop(t + 2.55)
        }
        lp.connect(g).connect(o)
        return 2.6
      }
      case 'waveClear': {
        const notes = [72, 76, 79, 84]
        notes.forEach((m, i) => s.brass(o, m + 12 * Math.log2(p), t + i * 0.13, i === 3 ? 0.9 : 0.16, 0.22, 2600))
        s.brass(o, 60 + 12 * Math.log2(p), t + 0.39, 0.9, 0.15, 1500)
        return 1.4
      }
      case 'kill':
        s.tone(o, 'sine', 1320 * p, 1320 * p, t, 0.35, 0.22, 0.002)
        s.tone(o, 'triangle', 1980 * p, 1980 * p, t + 0.04, 0.3, 0.12, 0.002)
        s.click(o, t, 5000, 0.2)
        return 0.4
      case 'combo':
        s.tone(o, 'sine', 880 * p, 880 * p, t, 0.18, 0.2, 0.002)
        s.tone(o, 'sine', 1320 * p, 1320 * p, t + 0.07, 0.3, 0.2, 0.002)
        s.tone(o, 'triangle', 1760 * p, 1760 * p, t + 0.14, 0.35, 0.12, 0.002)
        return 0.5
      case 'warning':
        for (let i = 0; i < 4; i++) s.tone(o, 'square', (i % 2 === 0 ? 880 : 660) * p, (i % 2 === 0 ? 880 : 660) * p, t + i * 0.16, 0.14, 0.12, 0.005, 2200)
        return 0.7
      case 'grab': {
        const ctx = s.ctx
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(95 * p, t)
        osc.frequency.exponentialRampToValueAtTime(58 * p, t + 0.38)
        const bp = s.filter('bandpass', 250, 700, 4, t, 0.38)
        const g = ctx.createGain()
        s.env(g.gain, t, 0.03, 0.4, 0.8)
        osc.connect(bp).connect(g).connect(o)
        osc.start(t)
        osc.stop(t + 0.45)
        s.noise(o, t, 0.3, 0.35, 'lowpass', 300, 900, 4, 0.02)
        return 0.45
      }
      case 'trap':
        s.noise(o, t, 0.05, 0.8, 'highpass', 2500, 2500, 0.7, 0.001)
        s.tone(o, 'triangle', 650 * p, 140 * p, t, 0.22, 0.3, 0.002)
        s.noise(o, t + 0.03, 0.35, 0.3, 'bandpass', 1100, 600, 1, 0.01)
        return 0.4
      case 'build':
        for (let i = 0; i < 3; i++) {
          const tt = t + i * 0.18
          s.tone(o, 'sine', 320 * p, 150 * p, tt, 0.09, 0.5, 0.001)
          s.noise(o, tt, 0.035, 0.4, 'bandpass', 1900 * p, 1200 * p, 1.5, 0.001)
        }
        return 0.5
      case 'flare':
        s.noise(o, t, 0.035, 0.8, 'bandpass', 1500, 900, 1, 0.001)
        s.tone(o, 'sine', 420 * p, 190 * p, t, 0.06, 0.4)
        s.noise(o, t + 0.05, 1.2, 0.25, 'highpass', 4000, 6000, 0.7, 0.05)
        s.tone(o, 'sine', 1200 * p, 2400 * p, t + 0.05, 0.6, 0.04, 0.05)
        return 1.3
      case 'dash':
        s.noise(o, t, 0.3, 0.6, 'bandpass', 1500 * p, 4200 * p, 1.1, 0.025)
        s.noise(o, t, 0.22, 0.2, 'highpass', 6000, 6000, 0.7, 0.01)
        return 0.32
      default:
        return 0.1
    }
  }

  private bell(s: Synth, o: AudioNode, t: number, f: number, decay: number, vol: number): void {
    const ratios = [1, 2.0, 2.4, 3.0, 4.2, 5.4]
    const gains = [1, 0.6, 0.5, 0.4, 0.25, 0.2]
    ratios.forEach((r, i) => s.tone(o, 'sine', f * r, f * r, t, decay * (1 - i * 0.12), vol * gains[i], 0.002))
    s.tone(o, 'sine', f * 0.5, f * 0.5, t, decay * 1.1, vol * 0.35, 0.01) // hum
    s.click(o, t, f * 6, vol * 0.8)
  }

  // ------------------------------------------------------------------ music

  private musicStep(s: Synth, track: MusicTrack, out: GainNode, step: number, t: number, sd: number): void {
    const bar = Math.floor(step / 16)
    const st = step % 16
    const barDur = sd * 16
    switch (track) {
      case 'menu': {
        // D minor: i – VI – III – VII
        const chords = [[50, 53, 57], [46, 50, 53], [48, 53, 57], [48, 52, 55]]
        const bass = [38, 34, 41, 36]
        const ci = bar % 4
        if (st === 0) {
          s.pad(out, chords[ci], t, barDur * 1.05, 0.14, ci % 2 === 0 ? 'ah' : 'oh')
          s.strings(out, bass[ci], t, barDur, 0.09, 600)
          s.strings(out, bass[ci] + 12, t, barDur, 0.05, 900)
          s.timpani(out, bass[ci] + 12, t, 0.5, 1.6)
        }
        if (st === 8) s.timpani(out, bass[ci] + 12, t, 0.28, 1.2)
        if (st === 14 && bar % 2 === 1) s.timpani(out, bass[ci] + 12, t, 0.18, 0.8)
        if (st === 8 && Math.random() < 0.55) {
          const m = pick(chords[ci]) + 12
          s.brass(out, m, t, barDur * 0.5, 0.05, 900)
        }
        break
      }
      case 'battle': {
        // E minor: i – VI – VII – V
        const bass = [40, 36, 38, 35]
        const thirds = [3, 4, 4, 4]
        const ci = bar % 4
        const root = bass[ci] + 12
        const third = root + thirds[ci]
        const fifth = root + 7
        const pat = [root, root + 12, fifth, root + 12, third + 12, root + 12, fifth, root + 12]
        const accent = st % 4 === 0
        s.strings(out, pat[st % 8], t, sd * 0.85, accent ? 0.075 : 0.045, 2400, true)
        if ([0, 3, 6, 8, 11, 14].includes(st)) s.strings(out, bass[ci], t, sd * 1.6, 0.08, 700, true)
        if (st % 4 === 0) s.timpani(out, bass[ci] + 12, t, st === 0 ? 0.5 : 0.32, 0.6)
        if (st === 4 || st === 12) s.snare(out, t, 0.22)
        else if (st % 2 === 1 && Math.random() < 0.18) s.snare(out, t, 0.06)
        if (ci === 3 && st >= 12) s.snare(out, t, 0.1 + (st - 12) * 0.04)
        if (st === 0) {
          s.pad(out, [root, third, fifth], t, barDur, 0.06)
          if (bar % 2 === 0) for (const m of [root, third, fifth]) s.brass(out, m, t, sd * 3, 0.05, 1600)
        }
        if (st === 8 && bar % 4 === 2) s.brass(out, fifth + 12, t, sd * 6, 0.05, 1400)
        break
      }
      case 'breach': {
        const bass = [38, 37, 39, 36]
        const ci = bar % 4
        const r = bass[ci] + 12
        // siren-like alternating semitone
        if (st % 2 === 0) s.strings(out, (st % 4 === 0 ? 74 : 75) + (ci === 2 ? 1 : 0), t, sd * 1.8, 0.035, 3000, true)
        s.strings(out, bass[ci], t, sd * 0.8, 0.07, 800, true)
        if (st % 2 === 0) s.timpani(out, r, t, st % 8 === 0 ? 0.45 : 0.25, 0.4)
        if (st === 4 || st === 12) s.snare(out, t, 0.25)
        if (st >= 13) s.snare(out, t, 0.12)
        if (st === 0) {
          s.pad(out, [r, r + 1, r + 6], t, barDur, 0.07)
          s.brass(out, r, t, sd * 4, 0.06, 1200)
          s.brass(out, r + 6, t, sd * 4, 0.05, 1200)
        }
        break
      }
      case 'boss': {
        // C minor, half-time: i – VI – iv – V
        const bass = [36, 32, 41, 31]
        const thirds = [3, 4, 3, 4]
        const ci = bar % 4
        const r = bass[ci]
        if (st === 0) {
          for (const m of [r, r + 7, r + 12]) s.brass(out, m, t, sd * 6, 0.1, 900)
          s.pad(out, [r + 12, r + 12 + thirds[ci], r + 19], t, barDur, 0.08, 'oh')
          s.strings(out, r - 12 < 24 ? r : r - 12, t, barDur, 0.08, 300)
        }
        if (st === 6 || st === 10) for (const m of [r, r + 7]) s.brass(out, m, t, sd * 1.5, 0.08, 700)
        if (st === 0 || st === 3 || st === 10) s.timpani(out, r + 12, t, st === 0 ? 0.75 : 0.5, 1.2)
        if (st === 14 && ci === 3) s.timpani(out, r + 12, t, 0.5, 0.6)
        if (st === 8) s.snare(out, t, 0.3)
        if (st % 4 === 2 && bar % 2 === 1) s.strings(out, r + 24 + thirds[ci], t, sd * 1.5, 0.03, 1800, true)
        break
      }
      case 'intermission': {
        // A minor: i – VI – III – VII (hopeful-melancholic)
        const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]]
        const bass = [45, 41, 48, 43]
        const penta = [69, 72, 74, 76, 79, 81]
        const ci = bar % 4
        if (st === 0) {
          s.pad(out, chords[ci], t, barDur * 1.1, 0.07, 'oh')
          s.tone(out, 'sine', mtof(bass[ci] - 12), mtof(bass[ci] - 12), t, barDur, 0.12, 0.3)
        }
        if ((st === 0 || st === 6 || st === 10) && Math.random() < 0.6) s.pluck(out, pick(penta), t, 0.06, 2)
        if (st === 12 && Math.random() < 0.3) s.pluck(out, pick(chords[ci]) + 12, t, 0.04, 2)
        break
      }
      case 'victory': {
        // D major fanfare (~4 bars ≈ 10.4s) then soft pad
        if (bar < 4) {
          const chords = [[62, 66, 69], [62, 67, 71], [61, 64, 69], [62, 66, 69, 74]]
          const bass = [38, 43, 45, 38]
          const mel: Record<number, number>[] = [{ 0: 74, 8: 78 }, { 0: 79, 6: 78, 8: 76 }, { 0: 76, 8: 73 }, { 0: 74 }]
          const c = chords[bar]
          if (st === 0 || (st === 8 && bar < 3)) for (const m of c) s.brass(out, m - 12, t, sd * 7, 0.05, 1400)
          const mn = mel[bar][st]
          if (mn !== undefined) s.brass(out, mn, t, bar === 3 ? barDur : sd * (st === 6 ? 2 : 6), 0.08, 2600)
          if (st === 0) {
            s.strings(out, bass[bar], t, barDur, 0.09, 700)
            s.pad(out, c, t, barDur, 0.07)
            s.timpani(out, bass[bar] + 12, t, 0.55, 1.2)
          }
          if (st === 8) s.timpani(out, bass[bar] + 12, t, 0.35, 0.8)
          if (bar === 2 && st >= 12) s.timpani(out, 45, t, 0.2 + (st - 12) * 0.07, 0.4)
          if (bar === 3 && st === 0) s.snare(out, t, 0.3)
        } else if ((bar - 4) % 2 === 0 && st === 0) {
          s.pad(out, [62, 66, 69], t, barDur * 2.1, 0.04, 'oh')
          s.tone(out, 'sine', mtof(38), mtof(38), t, barDur * 2, 0.06, 0.5)
        }
        break
      }
      case 'defeat': {
        const line = [50, 48, 46, 45, 43, 41, 40, 38]
        const li = bar % 8
        if (st === 0) {
          s.strings(out, line[li], t, barDur * 0.95, 0.08, 700)
          s.strings(out, line[li] - 12, t, barDur * 0.95, 0.05, 400)
          if (bar % 2 === 0) {
            s.pad(out, [50, 53, 57], t, barDur * 2, 0.05, 'oh')
            s.timpani(out, 38, t, 0.3, 2)
          }
        }
        if (st === 8 && Math.random() < 0.4) s.pluck(out, pick([62, 65, 69]), t, 0.03, 2.5)
        break
      }
      default:
        break
    }
  }
}

export const audio: AudioManager = new AudioManager()
