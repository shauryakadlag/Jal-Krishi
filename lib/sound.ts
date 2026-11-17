// Jal-Krishi AI — Web Audio API Interface Sound Engine
// Inspired by crisp, futuristic, satisfying menu navigation sounds (e.g. World War Z lobby audio)
// 100% original synthesized audio via Web Audio API. 0 external assets, 0 latency, cross-browser reliable.

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5; // 0.0 to 1.0
  private initialized: boolean = false;
  private listenersAttached: boolean = false;
  private subscribers: Set<(state: { isMuted: boolean; volume: number }) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const storedMuted = localStorage.getItem("jal_krishi_sound_muted");
        if (storedMuted !== null) {
          this.isMuted = storedMuted === "true";
        }
        const storedVol = localStorage.getItem("jal_krishi_sound_vol");
        if (storedVol !== null) {
          const v = parseFloat(storedVol);
          if (!isNaN(v) && v >= 0 && v <= 1) {
            this.volume = v;
          }
        }
      } catch {
        // localStorage not available
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Helper: Synthesize authentic Minecraft stone-placement impact (block.stone.place)
  // Characteristic physical profile:
  // 1. Initial crunchy gravel/stone particle attack (burst of filtered noise)
  // 2. Heavy solid subterranean thud (resonant low pitch downward drop)
  // 3. Dense woody/mineral acoustic body (warm short resonance, not metallic)
  private playStonePlacementImpact(options: {
    intensity: number;       // Master gain multiplier
    pitchMultiplier: number; // Pitch variation
    noiseCrunch: number;     // Crunch texture burst
    bodyDecay: number;       // Resonance decay time (seconds)
  }): void {
    if (this.isMuted || this.volume <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const gainScale = this.volume * options.intensity;

      // Master impact gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(gainScale, now + 0.002);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + options.bodyDecay);
      masterGain.connect(ctx.destination);

      // Layer 1: Crunchy stone-on-stone contact friction (bandpassed textured noise burst)
      // Generates the tactile "crunch" of a stone block landing on rock
      const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.045), ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        // High density random noise with rapid natural decay
        const t = i / noiseBuffer.length;
        output[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      // Bandpass filter centered on mineral crunch frequencies (800Hz - 2200Hz)
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(1400 * options.pitchMultiplier, now);
      noiseFilter.Q.setValueAtTime(1.8, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(gainScale * options.noiseCrunch, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);
      noiseSource.start(now);
      noiseSource.stop(now + 0.045);

      // Layer 2: Solid stone mass thud (low-frequency mineral body, triangular wave)
      // Gives the heavy, weighted tactile punch characteristic of stone blocks
      const oscLow = ctx.createOscillator();
      oscLow.type = "triangle";
      const startFreq = 160 * options.pitchMultiplier;
      const endFreq = 68 * options.pitchMultiplier;
      oscLow.frequency.setValueAtTime(startFreq, now);
      oscLow.frequency.exponentialRampToValueAtTime(endFreq, now + options.bodyDecay * 0.7);

      const oscLowGain = ctx.createGain();
      oscLowGain.gain.setValueAtTime(gainScale * 1.2, now);
      oscLowGain.gain.exponentialRampToValueAtTime(0.0001, now + options.bodyDecay);

      oscLow.connect(oscLowGain);
      oscLowGain.connect(masterGain);
      oscLow.start(now);
      oscLow.stop(now + options.bodyDecay);

      // Layer 3: Warm stone resonance body (sine wave at mid-low mineral frequency ~280Hz)
      const oscMid = ctx.createOscillator();
      oscMid.type = "sine";
      oscMid.frequency.setValueAtTime(290 * options.pitchMultiplier, now);
      oscMid.frequency.exponentialRampToValueAtTime(110 * options.pitchMultiplier, now + 0.04);

      const oscMidGain = ctx.createGain();
      oscMidGain.gain.setValueAtTime(gainScale * 0.75, now);
      oscMidGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      oscMid.connect(oscMidGain);
      oscMidGain.connect(masterGain);
      oscMid.start(now);
      oscMid.stop(now + 0.05);

    } catch {
      // Audio execution blocked or unsupported
    }
  }

  // Hover: Full, solid, satisfying stone-placement-inspired impact
  public playHover(): void {
    // Subtle natural pitch variance (0.96 to 1.04) prevents acoustic fatigue on rapid hovers
    const pitchVar = 0.96 + Math.random() * 0.08;
    this.playStonePlacementImpact({
      intensity: 0.38,
      pitchMultiplier: pitchVar,
      noiseCrunch: 1.1,
      bodyDecay: 0.065,
    });
  }

  // Click / Selection: Decisive, satisfying solid stone impact
  public playClick(): void {
    const pitchVar = 0.94 + Math.random() * 0.06;
    this.playStonePlacementImpact({
      intensity: 0.65,
      pitchMultiplier: pitchVar,
      noiseCrunch: 1.4,
      bodyDecay: 0.085,
    });
  }

  // Tab Switching: Recognizable stone-placement sound
  public playTabSwitch(): void {
    this.playStonePlacementImpact({
      intensity: 0.60,
      pitchMultiplier: 1.05,
      noiseCrunch: 1.3,
      bodyDecay: 0.080,
    });
  }

  // Confirmation / Execute: Deeper, heavier, solid impact
  public playConfirmation(): void {
    this.playStonePlacementImpact({
      intensity: 0.85,
      pitchMultiplier: 0.82,
      noiseCrunch: 1.7,
      bodyDecay: 0.12,
    });
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem("jal_krishi_sound_muted", String(muted));
    } catch {}
    this.notify();
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.isMuted);
    if (!this.isMuted) {
      // Play solid stone placement feedback on unmute
      this.playClick();
    }
    return this.isMuted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem("jal_krishi_sound_vol", String(this.volume));
    } catch {}
    this.notify();
  }

  public getState(): { isMuted: boolean; volume: number } {
    return { isMuted: this.isMuted, volume: this.volume };
  }

  public subscribe(cb: (state: { isMuted: boolean; volume: number }) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getState());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.subscribers.forEach((cb) => cb(s));
  }

  // Global event binder for automatic repeated hover sounds across ALL interactive controls
  public initInterfaceListeners(): void {
    if (typeof window === "undefined" || this.listenersAttached) return;
    this.listenersAttached = true;

    // Browser audio unlock on first user gesture
    const unlockAudio = () => {
      this.getAudioContext();
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });

    // Track active hover target to repeat on every fresh entry into any interactive element
    let lastHoveredInteractive: Element | null = null;

    const interactiveSelector =
      "button, a, [role='button'], input[type='range'], select, .interactive-sound, [data-sound='hover']";

    document.addEventListener(
      "pointerover",
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const interactive = target.closest(interactiveSelector);
        if (interactive && interactive !== lastHoveredInteractive) {
          lastHoveredInteractive = interactive;
          this.playHover();
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerout",
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const interactive = target.closest(interactiveSelector);
        if (interactive) {
          const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
          // Only clear if pointer genuinely moved outside of this interactive element
          if (!related || !interactive.contains(related)) {
            if (lastHoveredInteractive === interactive) {
              lastHoveredInteractive = null;
            }
          }
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const interactive = target.closest(
          "button, a, [role='button'], select, .interactive-sound, [data-sound='hover']"
        );
        if (interactive) {
          this.playClick();
        }
      },
      { passive: true }
    );
  }
}

export const soundManager = new SoundEngine();
