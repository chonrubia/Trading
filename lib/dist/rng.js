"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedRand = seedRand;
exports.hashStr = hashStr;
// LCG idéntico al backend original (goldens congelados en tests).
function seedRand(seed) {
    let s = seed;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
function hashStr(t) {
    let h = 0;
    const s = String(t || "?");
    for (let i = 0; i < s.length; i++)
        h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
}
