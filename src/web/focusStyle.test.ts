// El indicador de foco (#62) se prueba leyendo la hoja de estilos: el contraste del anillo,
// que nadie quite el contorno de foco, y que el anillo hacia adentro solo se use en
// elementos con fondo oscuro (un anillo blanco dentro de un fondo claro no se vería).
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

// --- Un lector mínimo de CSS -------------------------------------------------------------
type Rule = { selectors: string[]; declarations: Map<string, string> };

function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorText = (match[1] ?? "").trim();
    if (selectorText.startsWith("@")) continue;
    const declarations = new Map<string, string>();
    for (const part of (match[2] ?? "").split(";")) {
      const colon = part.indexOf(":");
      if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    }
    rules.push({ selectors: selectorText.split(",").map((s) => s.trim()), declarations });
  }
  return rules;
}

const rules = parseRules(css);

// --- Colores -----------------------------------------------------------------------------
function variable(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (match === null || match[1] === undefined) throw new Error(`no está la variable --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + 2 * index, 3 + 2 * index), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe("indicador de foco: el anillo", () => {
  const focusRule = rules.find((rule) => rule.selectors.includes(":focus-visible"));

  test("hay un anillo global para :focus-visible", () => {
    expect(focusRule).toBeDefined();
  });

  test("es sólido, de 2 px o más, en el texto de máximo brillo (sin color)", () => {
    const outline = focusRule?.declarations.get("outline") ?? "";
    const match = outline.match(/^(\d+(?:\.\d+)?)px solid var\(--text-strong\)$/);
    expect(match, `outline: ${outline}`).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(2); // mínimo de WCAG 2.2
  });

  test("está separado del elemento: se distingue de su borde", () => {
    const offset = focusRule?.declarations.get("outline-offset") ?? "";
    expect(parseFloat(offset)).toBeGreaterThan(0);
  });

  test.each(["bg", "surface", "surface-raised"])(
    "contraste con el fondo --%s: al menos 7:1 (el mínimo de WCAG es 3:1)",
    (background) => {
      const ratio = contrast(variable("text-strong"), variable(background));
      expect(ratio).toBeGreaterThanOrEqual(7);
    },
  );
});

describe("indicador de foco: nunca se quita", () => {
  test("ninguna regla quita el contorno (outline: none o 0)", () => {
    for (const rule of rules) {
      const outline = rule.declarations.get("outline");
      if (outline !== undefined) {
        expect(outline, rule.selectors.join(", ")).not.toMatch(/^(none|0|0px)$/);
      }
    }
  });
});

describe("indicador de foco: el anillo hacia adentro", () => {
  const darkBackground = /^(var\(--(bg|surface|surface-raised)\))$/;

  const inward = rules.filter((rule) => {
    const offset = rule.declarations.get("outline-offset");
    return offset !== undefined && parseFloat(offset) < 0;
  });

  test("se usa en algún elemento (pestaña plegada, listas con scroll)", () => {
    expect(inward.length).toBeGreaterThan(0);
  });

  test("solo en elementos que declaran su propio fondo oscuro (no claro, no por defecto)", () => {
    for (const rule of inward) {
      for (const selector of rule.selectors) {
        const base = selector.replace(/:focus-visible$/, "");
        const declared = rules
          .filter((r) => r.selectors.includes(base))
          .map((r) => r.declarations.get("background"))
          .filter((value): value is string => value !== undefined);
        expect(declared.length, `${base} no declara su fondo`).toBeGreaterThan(0);
        for (const value of declared) {
          expect(value, `${base}: fondo ${value}`).toMatch(darkBackground);
        }
      }
    }
  });
});
