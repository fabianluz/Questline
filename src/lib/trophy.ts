/**
 * §6 — Trophy Room artifact generator.
 *
 * Deterministic SVG sigil from an Epic's id + title. Same epic always renders
 * the same artifact, so the "Trophy Room" feels stable across sessions
 * without us needing to store generated images.
 */

const PALETTES = [
  ["#ffd166", "#ef476f"], // amber/rose
  ["#06d6a0", "#118ab2"], // mint/teal
  ["#7209b7", "#f72585"], // purple/magenta
  ["#ffbe0b", "#fb5607"], // gold/orange
  ["#3a86ff", "#8338ec"], // azure/violet
  ["#90e0ef", "#0077b6"], // sky/ocean
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function generateTrophySvg(
  epicId: string,
  title: string,
  size: number = 240,
): string {
  const seed = hash(epicId + title);
  const [c1, c2] = PALETTES[seed % PALETTES.length];
  const sides = 5 + (seed % 4); // pentagon, hexagon, heptagon, octagon
  const rotation = (seed % 360);

  // Star polygon — points alternate inner/outer radius.
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.21;
  const points: string[] = [];
  for (let i = 0; i < sides * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle =
      (Math.PI * 2 * i) / (sides * 2) - Math.PI / 2 + (rotation * Math.PI) / 180;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const initial = title.trim().charAt(0).toUpperCase() || "★";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escapeXml(title)} trophy">
  <defs>
    <linearGradient id="g${seed}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
    <radialGradient id="halo${seed}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${c1}" stop-opacity="0.4" />
      <stop offset="100%" stop-color="${c1}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${size * 0.48}" fill="url(#halo${seed})" />
  <polygon points="${points.join(" ")}" fill="url(#g${seed})" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round" />
  <text x="${cx}" y="${cy + size * 0.05}" text-anchor="middle" font-family="Georgia, serif" font-size="${size * 0.22}" font-weight="bold" fill="#1a1a1a">${escapeXml(initial)}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
