export const AVATAR_PALETTES = [
  ["#c85d3e", "#3d190e", "#ffd2c2"], // Terracotta / Rust
  ["#288755", "#0b2e1b", "#bcf5d4"], // Emerald / Forest
  ["#356ec4", "#102347", "#cce0ff"], // Cobalt / Royal Blue
  ["#85419c", "#2b1036", "#f3cbff"], // Plum / Violet
  ["#aa3148", "#3b0d17", "#ffd0d9"], // Crimson / Wine
  ["#23858a", "#0a2d2f", "#bdf4f7"], // Deep Teal / Marine
  ["#b88320", "#3d2905", "#ffe6b0"], // Ochre / Amber Gold
  ["#4d5ec2", "#161b42", "#d4dcff"], // Indigo / Dusk
  ["#c24965", "#3b0f1b", "#ffd2dc"], // Coral / Rose
  ["#6b8028", "#222c09", "#e4f7a8"], // Olive / Moss
  ["#8e4a7d", "#2e1227", "#f9d0ee"], // Berry / Heather
  ["#1c83a8", "#072b38", "#bceeff"], // Azure / Vibrant Cyan
  ["#bd5726", "#381506", "#ffd3bb"], // Burnt Sienna
  ["#6a47b8", "#1e113d", "#e0d4ff"], // Violet / Lavender
  ["#25846f", "#092d24", "#bcf5e6"], // Jade / Spruce
  ["#a16328", "#331c07", "#fedec0"]  // Warm Copper / Cinnamon
];

/**
 * Generates a vibrant, dynamic CSS gradient banner derived deterministically from pubkey entropy.
 * Uses complementary harmonies that pair seamlessly with the avatar.
 */
export function getProfileGradientBanner(pubkey: string): string {
  let hash = 0;
  for (let i = 0; i < (pubkey || "").length; i++) {
    hash = (hash << 5) - hash + pubkey.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);
  const [stop1, stop2, accent] = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
  const angle = (seed % 60) + 115;
  return `linear-gradient(${angle}deg, ${stop2} 0%, color-mix(in srgb, ${stop1} 65%, #141312) 55%, color-mix(in srgb, ${accent} 30%, #1c1b18) 100%)`;
}
