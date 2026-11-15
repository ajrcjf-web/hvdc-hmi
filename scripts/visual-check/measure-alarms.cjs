// Revisión visual medida del indicador de alarmas de la barra de navegación: mide, en cada paso,
// la barra, el indicador, el primer botón de la barra y el título de la ventana. Con alarmas de
// prueba de prioridades distintas (baja, alta, urgente), reconocidas y normalizadas.
// Requisitos: Chrome y `npm install` (playwright-core es una devDependency). CHROME_PATH opcional.
// Uso: node scripts/visual-check/measure-alarms.cjs <url> <carpeta de capturas> [ancho]
const { chromium } = require("playwright-core");

const url = process.argv[2];
const shots = process.argv[3];
const width = Number(process.argv[4] ?? 1280);
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 100) / 100;

async function box(page, selector) {
  const b = await page.locator(selector).first().boundingBox();
  // boundingBox es relativo a la ventana: se suma el desplazamiento para medir respecto del documento.
  const [sx, sy] = await page.evaluate(() => [window.scrollX, window.scrollY]);
  return b === null ? null : { x: round(b.x + sx), y: round(b.y + sy), w: round(b.width), h: round(b.height) };
}

async function measure(page, label) {
  return {
    label,
    texto: (await page.locator(".nav .alarm-indicator .alarm-text-actual").innerText()).trim(),
    nav: await box(page, "nav.nav"),
    indicador: await box(page, ".nav .alarm-indicator"),
    primerBoton: await box(page, ".nav button"),
    titulo: await box(page, "h1"),
    scrollX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url + "#/simulacion");
  await page.waitForSelector(".alarm-indicator");
  await wait(500);

  const steps = [];
  let n = 0;
  const snap = async (label) => {
    await wait(350);
    steps.push(await measure(page, label));
    await page.screenshot({ path: `${shots}/${String(++n).padStart(2, "0")}-${label.replace(/\W+/g, "_")}.png` });
  };
  const nav = async (name) => {
    await page.locator("nav").getByRole("button", { name, exact: true }).click();
    await wait(200);
  };
  const test = async (priority, action) =>
    page
      .locator("li", { hasText: `Alarma de prueba: ${priority}` })
      .getByRole("button", { name: `${action} condición` })
      .click();

  await snap("sin_alarmas");
  await test("baja", "Provocar");
  await snap("1_alarma_baja_sin_reconocer");
  await test("alta", "Provocar");
  await snap("2_alarmas_alta_sin_reconocer");
  await test("urgente", "Provocar");
  await snap("3_alarmas_urgente_sin_reconocer");

  await nav("Alarmas");
  await page.getByRole("button", { name: "Reconocer todas las visibles" }).click();
  await nav("Simulación de fallas");
  await snap("3_alarmas_urgente_reconocidas");

  await test("urgente", "Despejar");
  await snap("urgente_despejada_quedan_2_reconocidas_alta");
  await test("alta", "Despejar");
  await test("baja", "Despejar");
  await snap("todas_despejadas_sin_alarmas");

  // Una alarma que se normaliza sin haberla reconocido sigue visible (y parpadea) hasta reconocerla.
  await test("baja", "Provocar");
  await wait(300);
  await test("baja", "Despejar");
  await snap("baja_normalizada_sin_reconocer");
  await nav("Alarmas");
  await page.getByRole("button", { name: "Reconocer todas las visibles" }).click();
  await nav("Simulación de fallas");
  await snap("sin_alarmas_otra_vez");

  console.log(JSON.stringify({ steps, errors }));
  await browser.close();
})().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
