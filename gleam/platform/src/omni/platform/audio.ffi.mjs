export function play_chime() {
  if (typeof globalThis.AudioContext !== "function") return;
  try {
    const ctx = new globalThis.AudioContext();
    const now = ctx.currentTime;
    const tones = [
      { freq: 880, start: 0 },
      { freq: 1174.66, start: 0.16 },
    ];
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      const start = now + tone.start;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    }
    setTimeout(() => {
      if (typeof ctx.close === "function") ctx.close();
    }, 1200);
  } catch {
    // Audio unavailable; completion is still reflected in the UI.
  }
}
