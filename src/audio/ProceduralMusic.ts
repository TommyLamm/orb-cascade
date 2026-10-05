import { SoundEngine } from './SoundEngine';

export class ProceduralMusic {
  private timer: number | null = null;
  private step = 0;
  private isPlaying = false;
  private readonly bpm = 116;
  private readonly stepIntervalMs: number;

  // 五聲音階 (A小調五聲 / C大調五聲): A2, C3, D3, E3, G3, A3, C4, D4, E4
  private readonly arpScale = [110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63];
  // Bass 根音序列 (每 16 步切換一次: A1 -> F1 -> D1 -> E1)
  private readonly bassSequence = [55.0, 43.65, 36.71, 41.2];

  constructor(private soundEngine: SoundEngine) {
    // 16 分音符間隔: (60 / bpm) / 4 秒
    this.stepIntervalMs = ((60 / this.bpm) / 4) * 1000;
  }

  public start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.step = 0;
    this.scheduleNext();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext = (): void => {
    if (!this.isPlaying) return;

    this.playStep(this.step);
    this.step = (this.step + 1) % 64;

    this.timer = window.setTimeout(this.scheduleNext, this.stepIntervalMs);
  };

  private playStep(currentStep: number): void {
    const ctx = this.soundEngine.getContext();
    const masterGain = this.soundEngine.getMasterGain();
    if (!ctx || !masterGain || this.soundEngine.getIsMuted()) return;
    if (ctx.state !== 'running') return;

    const now = ctx.currentTime;

    // 1. Bass Drone (每 16 步起音)
    if (currentStep % 16 === 0) {
      const chordIndex = Math.floor(currentStep / 16);
      const bassFreq = this.bassSequence[chordIndex % this.bassSequence.length];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassFreq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);

      const dur = (this.stepIntervalMs * 16) / 1000;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.06, now + dur * 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + dur);
    }

    // 2. Arp 琶音軌 (偶數步步進)
    if (currentStep % 2 === 0) {
      const pattern = [0, 2, 4, 7, 5, 3, 6, 8, 4, 2, 7, 5, 3, 1, 4, 6];
      const noteIdx = pattern[(currentStep / 2) % pattern.length];
      const freq = this.arpScale[noteIdx % this.arpScale.length];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.12);
    }

    // 3. Crystal Pulse 晶瑩反拍 (每 8 步的第 4 步)
    if (currentStep % 8 === 4) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08);

      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.18);
    }
  }
}
