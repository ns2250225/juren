export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'slash' | 'hookR' | 'hookL' | 'boost' | 'retract'
  | 'reload' | 'interact' | 'skill1' | 'skill2' | 'skill3' | 'map' | 'pause' | 'lock' | 'rally'
  | 'attackOrder' | 'defendOrder' | 'hud' | 'shop' | 'dualHook' | 'nextWave'

const KEYMAP: Record<string, Action> = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right', Space: 'jump', KeyQ: 'hookL', ShiftLeft: 'boost', ShiftRight: 'boost',
  KeyE: 'retract', KeyR: 'reload', KeyF: 'interact', Digit1: 'skill1', Digit2: 'skill2', Digit3: 'skill3',
  Tab: 'map', Escape: 'pause', KeyT: 'lock', KeyZ: 'rally', KeyX: 'attackOrder', KeyC: 'defendOrder',
  KeyH: 'hud', KeyB: 'shop', KeyG: 'dualHook', KeyN: 'nextWave',
}
const MOUSEMAP: Record<number, Action> = { 0: 'slash', 2: 'hookR', 1: 'lock' }

export class InputManager {
  private down = new Set<Action>()
  private edge = new Set<Action>()
  private virtualDown = new Set<Action>()
  mouseDX = 0
  mouseDY = 0
  wheel = 0
  /** analog stick from touch, -1..1 */
  stickX = 0
  stickY = 0
  locked = false
  enabled = true
  private el: HTMLElement | null = null
  onPointerLockChange: ((locked: boolean) => void) | null = null

  attach(el: HTMLElement) {
    this.el = el
    window.addEventListener('keydown', this.kd)
    window.addEventListener('keyup', this.ku)
    el.addEventListener('mousedown', this.md)
    window.addEventListener('mouseup', this.mu)
    window.addEventListener('mousemove', this.mm)
    el.addEventListener('wheel', this.wh, { passive: true })
    el.addEventListener('contextmenu', this.cm)
    document.addEventListener('pointerlockchange', this.plc)
    window.addEventListener('blur', this.blur)
  }

  detach() {
    window.removeEventListener('keydown', this.kd)
    window.removeEventListener('keyup', this.ku)
    this.el?.removeEventListener('mousedown', this.md)
    window.removeEventListener('mouseup', this.mu)
    window.removeEventListener('mousemove', this.mm)
    this.el?.removeEventListener('wheel', this.wh)
    this.el?.removeEventListener('contextmenu', this.cm)
    document.removeEventListener('pointerlockchange', this.plc)
    window.removeEventListener('blur', this.blur)
    if (document.pointerLockElement) document.exitPointerLock()
  }

  requestLock() {
    if (!this.el || document.pointerLockElement === this.el) return
    try {
      const r = this.el.requestPointerLock() as unknown as Promise<void> | undefined
      r?.catch?.(() => {})
    } catch {
      /* ignore */
    }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  private kd = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code]
    if (!a) return
    if (a === 'map' || a === 'jump' || (a === 'pause' && this.locked)) e.preventDefault()
    if (!this.down.has(a)) this.edge.add(a)
    this.down.add(a)
  }
  private ku = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code]
    if (a) this.down.delete(a)
  }
  private md = (e: MouseEvent) => {
    const a = MOUSEMAP[e.button]
    if (!a) return
    if (!this.locked && this.enabled) this.requestLock()
    if (!this.down.has(a)) this.edge.add(a)
    this.down.add(a)
  }
  private mu = (e: MouseEvent) => {
    const a = MOUSEMAP[e.button]
    if (a) this.down.delete(a)
  }
  private mm = (e: MouseEvent) => {
    if (!this.locked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }
  private wh = (e: WheelEvent) => {
    this.wheel += Math.sign(e.deltaY)
  }
  private cm = (e: Event) => e.preventDefault()
  private plc = () => {
    this.locked = document.pointerLockElement === this.el
    this.onPointerLockChange?.(this.locked)
  }
  private blur = () => {
    this.down.clear()
  }

  // ---- virtual (touch) controls
  press(a: Action) {
    if (!this.virtualDown.has(a)) this.edge.add(a)
    this.virtualDown.add(a)
  }
  release(a: Action) {
    this.virtualDown.delete(a)
  }
  tap(a: Action) {
    this.edge.add(a)
  }
  look(dx: number, dy: number) {
    this.mouseDX += dx
    this.mouseDY += dy
  }

  isDown(a: Action) {
    return this.enabled && (this.down.has(a) || this.virtualDown.has(a))
  }
  pressed(a: Action) {
    return this.enabled && this.edge.has(a)
  }
  /** call at end of every frame */
  endFrame() {
    this.edge.clear()
    this.mouseDX = this.mouseDY = 0
    this.wheel = 0
  }
  clearAll() {
    this.down.clear()
    this.virtualDown.clear()
    this.edge.clear()
    this.stickX = this.stickY = 0
  }
}
