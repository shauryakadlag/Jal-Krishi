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

  // Signature WWZ-inspired hover sound: ultra-short, crisp, high-tech micro-tone
  public playHover(): void {
    if (this.isMuted || this.volume <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      // Scaled volume: hover sound is subtle and non-fatiguing
      const hoverGain = 0.09 * this.volume;
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(hoverGain, now + 0.002);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      masterGain.connect(ctx.destination);

      // Primary tone: rapid downward sweep 2400Hz -> 1450Hz
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(2400, now);
      osc1.frequency.exponentialRampToValueAtTime(1450, now + 0.02);
      osc1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.024);

      // Secondary transient: high-frequency metallic tick 3600Hz -> 2100Hz
      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(3600, now);
      osc2.frequency.exponentialRampToValueAtTime(2100, now + 0.012);
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(hoverGain * 0.45, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now);
      osc2.stop(now + 0.014);
    } catch {
      // Audio execution blocked or unsupported
    }
  }

  // Confirmation click sound: slightly deeper, solid tactile click
  public playClick(): void {
    if (this.isMuted || this.volume <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      const clickGain = 0.15 * this.volume;
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(clickGain, now + 0.003);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
      masterGain.connect(ctx.destination);

      // Primary click tone: 920Hz down to 420Hz
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(920, now);
      osc1.frequency.exponentialRampToValueAtTime(420, now + 0.035);
      osc1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.04);

      // Warm resonance body tone: 220Hz
      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(260, now);
      osc2.frequency.exponentialRampToValueAtTime(140, now + 0.03);
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(clickGain * 0.5, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now);
      osc2.stop(now + 0.035);
    } catch {
      // Audio execution blocked or unsupported
    }
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
      // Play brief test click on unmute
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
