// Imprime el resultado de measure-alarms.cjs, marcando lo que cambia entre un paso y el siguiente.
// Uso: node scripts/visual-check/report-alarms.cjs <resultado.json>
const fs = require("fs");
const { steps, errors } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const keys = ["nav", "indicador", "primerBoton", "titulo"];
const fmt = (b) => (b === null ? "—" : `x${b.x} y${b.y} ${b.w}×${b.h}`);
let prev = null;
for (const s of steps) {
  console.log(`\n# ${s.label}  — texto: "${s.texto}"  (scrollX=${s.scrollX})`);
  for (const k of keys) {
    let note = "";
    if (prev && prev[k] && s[k]) {
      const d = ["x", "y", "w", "h"].filter((f) => Math.abs(prev[k][f] - s[k][f]) > 0.01).map((f) => `${f} ${prev[k][f]}→${s[k][f]}`);
      if (d.length) note = "   ⟵ CAMBIA: " + d.join(", ");
    }
    console.log(`  ${k.padEnd(12)} ${fmt(s[k])}${note}`);
  }
  prev = s;
}
console.log("\nerrores de página:", errors.length ? errors : "ninguno");
