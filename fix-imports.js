const fs = require("fs");
const path = require("path");
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}
const webdir = path.join(__dirname, "web");
for (const f of walk(path.join(webdir, "app", "api"))) {
  const ups = path.relative(webdir, path.dirname(f)).split(path.sep).length;
  const prefix = "../".repeat(ups) + "lib/";
  let s = fs.readFileSync(f, "utf8");
  s = s.replace(/from "(?:\.\.\/)+lib\//g, `from "${prefix}`);
  fs.writeFileSync(f, s);
}
let k = fs.readFileSync(path.join(webdir, "lib", "kv.ts"), "utf8");
k = k.replace(/from "(?:\.\.\/)+lib\//g, 'from "../lib/');
fs.writeFileSync(path.join(webdir, "lib", "kv.ts"), k);
console.log("imports OK");
