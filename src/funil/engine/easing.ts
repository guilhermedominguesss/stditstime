/** Curvas de easing usadas pelo motor (o React usa as do Framer Motion). */
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeInCubic = (t: number) => t * t * t
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Tween numérico de um valor só, sem alocação por frame. */
export class Tween {
  value: number
  private from = 0
  private to = 0
  private t0 = 0
  private dur = 0
  private ease: (t: number) => number = easeOutExpo

  constructor(v: number) {
    this.value = v
    this.to = v
  }

  set(to: number, ms: number, now: number, ease: (t: number) => number = easeOutExpo) {
    if (ms <= 0) {
      this.value = this.to = to
      this.dur = 0
      return
    }
    this.from = this.value
    this.to = to
    this.t0 = now
    this.dur = ms
    this.ease = ease
  }

  get target() {
    return this.to
  }

  get active() {
    return this.dur > 0
  }

  update(now: number) {
    if (this.dur <= 0) return this.value
    const t = clamp01((now - this.t0) / this.dur)
    this.value = this.from + (this.to - this.from) * this.ease(t)
    if (t >= 1) this.dur = 0
    return this.value
  }
}
