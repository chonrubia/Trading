// Persistencia sin nativos: JSON en backend/data + audit.log append-only.
// Misma interfaz que usaría Postgres (load/save por colección) para migrar luego.
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

function file(k) { return path.join(DIR, `${k}.json`); }
function load(k, fallback) {
  try {
    if (!fs.existsSync(file(k))) return fallback;
    return JSON.parse(fs.readFileSync(file(k), "utf8"));
  } catch { return fallback; }
}
function save(k, val) {
  try { fs.writeFileSync(file(k), JSON.stringify(val, null, 1)); } catch {}
}
function audit(event) {
  try { fs.appendFileSync(path.join(DIR, "audit.log"), JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n"); } catch {}
}
function tailAudit(n = 50) {
  try {
    const p = path.join(DIR, "audit.log");
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, "utf8").trim().split("\n").slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  } catch { return []; }
}
module.exports = { load, save, audit, tailAudit };
