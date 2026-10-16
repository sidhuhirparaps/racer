/**
 * Singleton Web Audio engine. Oscillators are created once and retargeted,
 * so the race loop never allocates audio nodes except for one-shot beeps.
 */
class SoundEngine {
  constructor() {
    this.ctx = null
    this.muted = false
    this.initialized = false
    this.lastGear = 1
  }

  init() {
    if (this.initialized) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    this.ctx = new AudioCtx()

    this.comp = this.ctx.createDynamicsCompressor()
    this.comp.threshold.value = -18
    this.comp.knee.value = 12
    this.comp.ratio.value = 6
    this.comp.connect(this.ctx.destination)

    this.engOsc1 = this.ctx.createOscillator()
    this.engOsc2 = this.ctx.createOscillator()
    this.engSub = this.ctx.createOscillator()
    this.engFilter = this.ctx.createBiquadFilter()
    this.engGain = this.ctx.createGain()

    this.engOsc1.type = 'sawtooth'
    this.engOsc2.type = 'sawtooth'
    this.engSub.type = 'square'

    this.engFilter.type = 'lowpass'
    this.engFilter.frequency.value = 380
    this.engFilter.Q.value = 2.2
    this.engGain.gain.value = 0

    this.engOsc1.connect(this.engFilter)
    this.engOsc2.connect(this.engFilter)
    this.engSub.connect(this.engFilter)
    this.engFilter.connect(this.engGain)
    this.engGain.connect(this.comp)

    this.engOsc1.start()
    this.engOsc2.start()
    this.engSub.start()

    const bufSize = this.ctx.sampleRate * 1.5
    const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.8

    this.skidNode = this.ctx.createBufferSource()
    this.skidNode.buffer = noiseBuf
    this.skidNode.loop = true

    this.skidFilter = this.ctx.createBiquadFilter()
    this.skidFilter.type = 'bandpass'
    this.skidFilter.frequency.value = 1450
    this.skidFilter.Q.value = 6

    this.skidGain = this.ctx.createGain()
    this.skidGain.gain.value = 0

    this.skidNode.connect(this.skidFilter)
    this.skidFilter.connect(this.skidGain)
    this.skidGain.connect(this.comp)
    this.skidNode.start()

    this.curbOsc = this.ctx.createOscillator()
    this.curbGain = this.ctx.createGain()
    this.curbOsc.type = 'sawtooth'
    this.curbOsc.frequency.value = 55
    this.curbGain.gain.value = 0
    this.curbOsc.connect(this.curbGain)
    this.curbGain.connect(this.comp)
    this.curbOsc.start()

    this.initialized = true
  }

  resetGear() {
    this.lastGear = 1
  }

  update(speed, maxSpeed, isDrifting, onCurb, activeRacing) {
    if (!this.initialized || this.muted) return
    if (this.ctx.state === 'suspended') this.ctx.resume()

    const now = this.ctx.currentTime
    if (!activeRacing) {
      const idleWobble = Math.sin(now * 28) * 3
      this.engOsc1.frequency.setTargetAtTime(44 + idleWobble, now, 0.05)
      this.engOsc2.frequency.setTargetAtTime(66 + idleWobble, now, 0.05)
      this.engSub.frequency.setTargetAtTime(22, now, 0.05)
      this.engGain.gain.setTargetAtTime(0.035, now, 0.1)
      this.skidGain.gain.setTargetAtTime(0, now, 0.05)
      this.curbGain.gain.setTargetAtTime(0, now, 0.05)
      return
    }

    const normSpeed = Math.min(1.25, Math.abs(speed) / maxSpeed)
    const gearFloat = normSpeed * 4.2
    const currentGear = Math.min(5, Math.floor(gearFloat) + 1)
    const gearRpm = gearFloat % 1

    if (currentGear > this.lastGear) {
      this.playTone(95, 0.07, 'sawtooth', 0.1)
    }
    this.lastGear = currentGear

    const baseFreq = 54 + normSpeed * 95 + gearRpm * 52
    this.engOsc1.frequency.setTargetAtTime(baseFreq, now, 0.03)
    this.engOsc2.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.03)
    this.engSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.03)

    this.engFilter.frequency.setTargetAtTime(320 + normSpeed * 1200, now, 0.04)
    this.engGain.gain.setTargetAtTime(0.055 + normSpeed * 0.055, now, 0.05)

    this.skidFilter.frequency.setTargetAtTime(1350 + Math.sin(now * 18) * 180, now, 0.04)
    this.skidGain.gain.setTargetAtTime(isDrifting ? 0.075 : 0, now, 0.04)

    const curbVol = onCurb && Math.abs(speed) > 5 ? Math.min(0.085, normSpeed * 0.09) : 0
    this.curbOsc.frequency.setTargetAtTime(42 + Math.abs(speed) * 1.4, now, 0.02)
    this.curbGain.gain.setTargetAtTime(curbVol, now, 0.02)
  }

  playTone(freq, duration, type = 'sine', vol = 0.12) {
    if (!this.initialized || this.muted) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime)
    gain.gain.setValueAtTime(vol, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(this.comp)
    osc.start()
    osc.stop(this.ctx.currentTime + duration)
  }

  playBoost() {
    if (!this.initialized || this.muted) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(130, now)
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.45)
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc.connect(gain)
    gain.connect(this.comp)
    osc.start()
    osc.stop(now + 0.5)
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.initialized && this.muted) {
      const now = this.ctx.currentTime
      this.engGain.gain.setTargetAtTime(0, now, 0.02)
      this.skidGain.gain.setTargetAtTime(0, now, 0.02)
      this.curbGain.gain.setTargetAtTime(0, now, 0.02)
    }
    return !this.muted
  }
}

export const soundEngine = new SoundEngine()
