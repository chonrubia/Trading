// Memoria compartida: análisis relevantes accesibles para todos los agentes.
// Cada entrada: {id, author, dept, pair, text, kind, ts}. El chat autónomo la cita.
const store = require("./store");
let mem = store.load("memory", [
  { id: "mem-0", author: "Análisis · Onchain", dept: "analisis", pair: "BTC", text: "BTC sobre media de 50 y 200 días. Sesgo base alcista salvo pérdida de funding.", kind: "sesgo", ts: new Date().toISOString() },
]);
let n = mem.length + 1;
function add(e) {
  const entry = { id: `mem-${n++}`, ts: new Date().toISOString(), ...e };
  mem.unshift(entry);
  if (mem.length > 200) mem.length = 200;
  store.save("memory", mem);
  return entry;
}
function list(limit = 30) { return mem.slice(0, limit); }
function search(q, limit = 10) {
  q = String(q || "").toLowerCase();
  if (!q) return list(limit);
  return mem.filter(m => `${m.text} ${m.pair} ${m.author} ${m.kind}`.toLowerCase().includes(q)).slice(0, limit);
}
function cite() { // cita corta para inyectar en mensajes de agentes
  if (!mem.length) return "";
  const m = mem[Math.floor(Math.random() * Math.min(5, mem.length))];
  return `Memoria [${m.pair}·${m.author}]: ${m.text.slice(0, 90)}`;
}
module.exports = { add, list, search, cite };
