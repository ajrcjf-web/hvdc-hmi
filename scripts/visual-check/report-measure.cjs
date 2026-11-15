// Imprime el resultado de measure-overview.cjs como tabla, marcando lo que cambia entre pasos.
// Uso: node scripts/visual-check/report-measure.cjs <resultado.json> [dialog]
const fs = require("fs");
const { steps, errors, dialogText } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const keys = ["modo", "r86", "reset", "ordenes", "estado"];
const fmt = (b) => (b === null ? "—" : `x${b.x} y${b.y} ${b.w}×${b.h}`);
let prev = null;
for (const s of steps) {
  console.log(`\n# ${s.label}  (scrollX=${s.scrollX})`);
  for (const k of keys) {
    let note = "";
    if (prev && prev[k] && s[k]) {
      const d = ["x", "y", "w", "h"].filter((f) => Math.abs(prev[k][f] - s[k][f]) > 0.01).map((f) => `${f} ${prev[k][f]}→${s[k][f]}`);
      if (d.length) note = "   ⟵ CAMBIA: " + d.join(", ");
    }
    console.log(`  ${k.padEnd(8)} ${fmt(s[k])}${note}`);
  }
  prev = s;
}
console.log("\nerrores de consola:", errors.length ? errors : "ninguno");
if (process.argv[3] === "dialog") console.log("\nconfirmación del reset:\n" + dialogText);
