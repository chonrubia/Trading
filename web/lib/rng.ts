// Seams inyectables: azar y reloj. Prohibido Math.random/Date directos en lib/.
export type Rng = () => number;
export type Clock = () => string;

// LCG idéntico al backend original (goldens congelados en tests).
export function seedRand(seed: number): Rng {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

export function hashStr(t: string): number {
  let h = 0;
  const s = String(t || "?");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
