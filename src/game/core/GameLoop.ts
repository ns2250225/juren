/** requestAnimationFrame loop with clamped delta, time scaling (slow-motion) and FPS metering. */
export class GameLoop {
  private raf = 0
  private last = 0
  running = false
  timeScale = 1
  private slowTimer = 0
  private slowScale = 1
  fps = 60
  private fpsAcc = 0
  private fpsFrames = 0

  constructor(private update: (dt: number, realDt: number) => void) {}

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const tick = (now: number) => {
      if (!this.running) return
      this.raf = requestAnimationFrame(tick)
      let real = (now - this.last) / 1000
      this.last = now
      if (real > 0.1) real = 0.1
      this.fpsAcc += real
      this.fpsFrames++
      if (this.fpsAcc >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsAcc)
        this.fpsAcc = 0
        this.fpsFrames = 0
      }
      if (this.slowTimer > 0) {
        this.slowTimer -= real
        this.timeScale = this.slowScale
        if (this.slowTimer <= 0) this.timeScale = 1
      }
      this.update(real * this.timeScale, real)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  /** brief slow-motion (e.g. nape hit) */
  slowMo(scale: number, seconds: number) {
    this.slowScale = scale
    this.slowTimer = Math.max(this.slowTimer, seconds)
  }
}
