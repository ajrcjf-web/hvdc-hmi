// Revisión visual medida: recorre la aplicación real (npm run dev) como lo haría el operador y
// mide, en cada paso, la posición y el tamaño del indicador del modo, del indicador del 86 y del
// botón "Resetear 86" (y de los paneles de estado y de órdenes). Saca una captura por paso.
// Es un ejemplo: para otro PR de interfaz se copia y se cambian el recorrido y lo que se mide.
//
// Requisitos: Chrome instalado y `npm install --no-save playwright-core` (no baja navegadores
// y no cambia package.json). Con otra ruta de Chrome: variable CHROME_PATH.
// Uso: node scripts/visual-check/measure-overview.cjs <url> <carpeta de capturas> [ancho]
// Ver docs/WORKFLOW.md, "Revisión visual medida".
const { chromium } = require("playwright-core");

const url = process.argv[2];
const shots = process.argv[3];
const width = Number(process.argv[4] ?? 1280);
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 100) / 100;

async function box(page, selector) {
  const el = page.locator(selector).first();
  const b = await el.boundingBox();
  // boundingBox es relativo a la ventana: se suma el desplazamiento para medir respecto del documento
  // (si no, un clic que desplaza la página parecería un movimiento del elemento).
  const [sx, sy] = await page.evaluate(() => [window.scrollX, window.scrollY]);
  return b === null ? null : { x: round(b.x + sx), y: round(b.y + sy), w: round(b.width), h: round(b.height) };
}

async function measure(page, label) {
  const m = {
    modo: await box(page, ".indicators .mode-indicator"),
    r86: await box(page, ".indicators .relay86-indicator"),
    reset: await box(page, ".indicators button"),
    ordenes: await box(page, "section.panel:has(h2:text-is('Órdenes'))"),
    estado: await box(page, "section.panel:has(h2:text-is('Estado de la estación'))"),
    unifilar: await box(page, ".layout"),
  };
  m.scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return { label, ...m };
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await page.goto(url + "#/overview");
  await page.waitForSelector(".relay86-indicator");
  await wait(500);

  const steps = [];
  let n = 0;
  const snap = async (label) => {
    await wait(350);
    steps.push(await measure(page, label));
    await page.screenshot({ path: `${shots}/${String(++n).padStart(2, "0")}-${label.replace(/\W+/g, "_")}.png` });
  };
  const confirm = async () => {
    await page.getByRole("button", { name: "Ejecutar" }).click();
    await wait(300);
  };
  const nav = async (name) => {
    await page.locator("nav").getByRole("button", { name }).click();
    await wait(200);
  };
  const orders = (name) => page.locator("section.panel:has(h2:text-is('Órdenes'))").getByRole("button", { name, exact: true });

  await snap("inicio_automatico_86_normal");

  await orders("Pasar a manual").click();
  await confirm();
  await snap("modo_manual");

  await orders("Cerrar Q1").click();
  await confirm();
  await wait(1500); // Q1 tarda 1 s
  await snap("manual_Q1_cerrado");

  await nav("Simulación de fallas");
  await page
    .locator("li", { hasText: "Falla interna del convertidor" })
    .getByRole("button", { name: "Provocar falla" })
    .click();
  await wait(400);
  await nav("Overview");
  await snap("falla_provocada_86_enclavado");

  await page.locator(".indicators button").click(); // Resetear 86 con la falla presente: se rechaza
  await wait(300);
  await snap("reset_rechazado_falla_presente");

  await nav("Simulación de fallas");
  await page
    .locator("li", { hasText: "Falla interna del convertidor" })
    .getByRole("button", { name: "Despejar falla" })
    .click();
  await wait(300);
  await nav("Overview");
  await snap("falla_despejada_86_enclavado");

  await page.locator(".indicators button").click(); // Resetear 86: abre la confirmación
  await page.waitForSelector("dialog[open]");
  await page.screenshot({ path: `${shots}/${String(++n).padStart(2, "0")}-confirmacion_reset.png` });
  const dialogText = await page.locator("dialog[open]").innerText();
  await confirm();
  await snap("reset_aceptado_86_normal");

  await orders("Pasar a automático").click();
  await confirm();
  await snap("modo_automatico_otra_vez");

  console.log(JSON.stringify({ steps, errors, dialogText }));
  await browser.close();
})().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
