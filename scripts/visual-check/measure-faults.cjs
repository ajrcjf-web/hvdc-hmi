// Revisión visual medida de la ventana del instructor con las fallas de la red (línea AC y
// subtensión): arma la planta en coupled con carga, provoca fallas con dato desde la ventana, escribe un valor
// inválido, y mide en cada paso los botones de la fila y los indicadores de la overview.
// Requisitos: Chrome y `npm install` (playwright-core es una devDependency). CHROME_PATH opcional.
// Uso: node scripts/visual-check/measure-faults.cjs <url> <carpeta de capturas> [ancho]
const { chromium } = require("playwright-core");

const url = process.argv[2];
const shots = process.argv[3];
const width = Number(process.argv[4] ?? 1280);
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 100) / 100;

async function box(locator) {
  const b = await locator.first().boundingBox();
  if (b === null) return null;
  const [sx, sy] = await locator.page().evaluate(() => [window.scrollX, window.scrollY]);
  return { x: round(b.x + sx), y: round(b.y + sy), w: round(b.width), h: round(b.height) };
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url + "#/overview");
  await page.waitForSelector(".relay86-indicator");
  await wait(500);

  const steps = [];
  let n = 0;
  const shot = (label) => page.screenshot({ path: `${shots}/${String(++n).padStart(2, "0")}-${label}.png`, fullPage: true });
  const nav = async (name) => {
    await page.locator("nav").getByRole("button", { name, exact: true }).click();
    await wait(200);
  };
  const orders = (name) =>
    page.locator("section.panel:has(h2:text-is('Órdenes'))").getByRole("button", { name, exact: true });
  const confirm = async () => {
    await page.getByRole("button", { name: "Ejecutar" }).click();
    await wait(300);
  };
  const row = (text) => page.locator("li", { hasText: text }).first();

  // --- Armar la planta: decoupled, coupled, desbloquear y 300 MW (tiempos reales: ~50 s).
  await orders("decoupled").click();
  await confirm();
  await wait(1500);
  await orders("coupled").click();
  await confirm();
  await wait(8500);
  await orders("Desbloquear").click();
  await confirm();
  await wait(5500);
  await page.getByPlaceholder("MW").fill("300");
  await page.getByRole("button", { name: "Enviar consigna" }).click();
  await confirm();
  await wait(1000);

  const overview = async (label) => {
    await wait(350);
    steps.push({
      label,
      modo: await box(page.locator(".indicators .mode-indicator")),
      r86: await box(page.locator(".indicators .relay86-indicator")),
      reset: await box(page.locator(".indicators button")),
      nav: await box(page.locator("nav.nav")),
      tp1: (await page.locator("dt:text-is('Tensión AC (TP1)') + dd").innerText()).trim(),
      ultima: (await page.locator("dt:text-is('Última protección') + dd").innerText()).trim(),
      causa: (await page.locator("dt:text-is('Causa del 86') + dd").innerText()).trim().replace(/\n/g, " | "),
    });
  };
  await overview("planta_coupled_con_carga");
  await shot("overview_coupled_con_carga");

  // --- Ventana del instructor: la fila de la línea AC antes y después de provocar.
  await nav("Simulación de fallas");
  const lineRow = row("Falla en la línea AC");
  const provoke = lineRow.getByRole("button", { name: "Provocar falla" });
  const clearBtn = lineRow.getByRole("button", { name: "Despejar falla" });
  const input = lineRow.getByLabel("Ubicación (% del largo de la línea)");
  const rowBoxes = async (label) => ({
    label,
    provocar: await box(provoke),
    despejar: await box(clearBtn),
    entrada: await box(input),
    estado: await box(lineRow.locator(".test-alarm-state")),
    provocarDeshabilitado: await provoke.getAttribute("aria-disabled"),
    despejarDeshabilitado: await clearBtn.getAttribute("aria-disabled"),
  });
  const instructor = [];
  instructor.push(await rowBoxes("antes_de_provocar"));
  await shot("instructor_antes");

  await input.fill("200"); // inválido
  await wait(200);
  instructor.push({ ...(await rowBoxes("valor_invalido_200")), aviso: (await lineRow.locator(".fault-note").first().innerText()).trim() });
  await shot("instructor_valor_invalido");

  await input.fill("50");
  await provoke.click();
  await wait(500);
  instructor.push({ ...(await rowBoxes("falla_provocada_50")), nota: (await lineRow.locator(".fault-note").last().innerText()).trim() });
  await shot("instructor_falla_provocada");
  const resumen = (await page.locator("section.panel > p").first().innerText()).trim();

  await nav("Overview");
  await overview("falla_linea_AC_50_disparo");
  await shot("overview_tras_disparo");

  // --- Reset con la falla presente (rechazado), despejar, reset.
  await page.locator(".indicators button").click();
  await wait(300);
  // Con el panel de eventos plegado (ventanas angostas) solo hay una pestaña: se lee su etiqueta
  // accesible (cuenta los eventos nuevos y avisa si hubo un rechazo) sin desplegarla, para no
  // mover el diseño.
  const foldedTab = page.locator("aside button.events-tab");
  const rechazo =
    (await foldedTab.count()) > 0
      ? `(panel plegado) ${await foldedTab.getAttribute("aria-label")}`
      : ((await page.locator("aside").innerText()).split("\n").filter((l) => l.includes("causa sigue presente"))[0] ?? "(no encontrado)");
  await nav("Simulación de fallas");
  await clearBtn.click();
  await wait(300);
  await nav("Overview");
  await overview("falla_despejada_86_enclavado");
  await page.locator(".indicators button").click();
  await page.waitForSelector("dialog[open]");
  const dialog = (await page.locator("dialog[open]").innerText()).replace(/\n+/g, " | ");
  await shot("confirmacion_reset");
  await confirm();
  await overview("reset_aceptado");

  console.log(JSON.stringify({ steps, instructor, resumen, rechazo, dialog, errors }));
  await browser.close();
})().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
