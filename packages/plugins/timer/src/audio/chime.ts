/**
 * Web Audio API Bell Chime for Visual Timer
 * Zero audio files or external dependencies.
 */

export function playTimerCompletionChime(): void {
  if (typeof window === "undefined") return;

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Harmonic two-tone singing bell: C5 (523.25 Hz) + E5 (659.25 Hz)
    const tones = [523.25, 659.25, 1046.5];

    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      // Envelope: instant soft attack, gentle exponential decay
      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25 / (idx + 1), now + idx * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 2.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 2.5);
    });
  } catch (err) {
    console.warn("[TimerChime] Could not play audio chime:", err);
  }
}
