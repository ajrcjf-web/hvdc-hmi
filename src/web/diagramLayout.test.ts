import { describe, expect, test } from "vitest";
import { formatReadings } from "./diagram.ts";
import {
  CONVERTER_SIZE,
  layoutDiagram,
  MAIN_Y,
  type Box,
  type DiagramLayout,
  type TextWidth,
} from "./diagramLayout.ts";

const FONT_PX = 16;

// Una estimación fija del ancho del texto (el navegador da la medición real): determinista.
const estimate: TextWidth = (text, bold) => text.length * (bold ? 10 : 9);
// Una fuente "ancha", para comprobar que con letras más grandes igual no se solapa nada.
const wide: TextWidth = (text, bold) => text.length * (bold ? 13 : 12);

const layoutAt = (width: number, textWidth: TextWidth = estimate, fontPx = FONT_PX) =>
  layoutDiagram(width, fontPx, textWidth);

const MIN_WIDTH = layoutAt(0).minWidth;
const WIDTHS = [MIN_WIDTH, 900, 1000, 1200, 1366, 1600, 1920, 2400, 3000];

function intersects(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

const labelBoxes = (layout: DiagramLayout) => Object.entries(layout.labels);

describe("layoutDiagram: ninguna etiqueta se solapa", () => {
  test.each([
    ["fuente estimada", estimate, 16],
    ["fuente ancha", wide, 16],
    ["letras más grandes", estimate, 20],
  ] as const)("%s, a cualquier ancho", (_name, textWidth, fontPx) => {
    const min = layoutAt(0, textWidth, fontPx).minWidth;
    for (const width of [min, min + 1, 900, 1200, 1920, 2400, 3000]) {
      const layout = layoutAt(width, textWidth, fontPx);
      const labels = labelBoxes(layout);

      // Ni con otra etiqueta.
      for (const [idA, a] of labels) {
        for (const [idB, b] of labels) {
          if (idA < idB) {
            expect(intersects(a.box, b.box, 2), `${idA} con ${idB} a ${width} px`).toBe(false);
          }
        }
      }
      // Ni con un símbolo ni con un cable.
      for (const [id, label] of labels) {
        for (const [name, symbol] of Object.entries(layout.symbols)) {
          expect(intersects(label.box, symbol, 2), `${id} con ${name} a ${width} px`).toBe(false);
        }
      }
    }
  });

  test("quedan dentro del dibujo", () => {
    for (const width of WIDTHS) {
      const layout = layoutAt(width);
      for (const [id, label] of labelBoxes(layout)) {
        expect(label.box.x, `${id} a ${width} px`).toBeGreaterThanOrEqual(0);
        expect(label.box.x + label.box.width, `${id} a ${width} px`).toBeLessThanOrEqual(layout.width);
        expect(label.box.y, `${id} a ${width} px`).toBeGreaterThanOrEqual(0);
        expect(label.box.y + label.box.height, `${id} a ${width} px`).toBeLessThanOrEqual(layout.height);
      }
    }
  });

  test("el nombre y el estado del convertidor no tocan su caja (Fase 3)", () => {
    for (const width of WIDTHS) {
      const { labels, converter } = layoutAt(width);
      const name = labels.converterName.box;
      const state = labels.converterState.box;
      expect(name.y + name.height).toBeLessThan(converter.y); // el nombre, encima
      expect(state.y).toBeGreaterThan(converter.y + converter.height); // el estado, debajo
    }
  });

  test("las lecturas no tocan la derivación de QE", () => {
    for (const width of WIDTHS) {
      const { labels, symbols } = layoutAt(width);
      for (const id of ["readingPower", "readingUdc", "readingIdc"] as const) {
        expect(intersects(labels[id].box, symbols.qeBranch as Box, 2)).toBe(false);
      }
    }
  });
});

describe("layoutDiagram: crecen las distancias, no el tamaño", () => {
  const anchorsOf = (layout: DiagramLayout) => [
    layout.redAc.cx,
    layout.q1.cx,
    layout.transformer.cx,
    layout.converter.cx,
    layout.qe.cx,
    layout.q2.cx,
    layout.line.endX,
  ];

  test("los elementos van de izquierda a derecha y se separan al ensanchar", () => {
    let previous = anchorsOf(layoutAt(MIN_WIDTH));
    for (const width of WIDTHS.slice(1)) {
      const current = anchorsOf(layoutAt(width));
      // Orden de izquierda a derecha.
      current.forEach((x, i) => {
        if (i > 0) expect(x).toBeGreaterThan(current[i - 1] as number);
      });
      // Cada distancia entre vecinos es mayor o igual que con el ancho anterior.
      current.forEach((x, i) => {
        if (i > 0) {
          const gap = x - (current[i - 1] as number);
          const gapBefore = (previous[i] as number) - (previous[i - 1] as number);
          expect(gap).toBeGreaterThanOrEqual(gapBefore);
        }
      });
      previous = current;
    }
  });

  test("con más ancho, el último elemento se aleja del primero", () => {
    const narrow = layoutAt(MIN_WIDTH);
    const wideLayout = layoutAt(2400);
    expect(wideLayout.line.endX - wideLayout.redAc.cx).toBeGreaterThan(
      narrow.line.endX - narrow.redAc.cx,
    );
  });

  test("usa el ancho disponible: la línea DC llega casi hasta el borde", () => {
    for (const width of WIDTHS) {
      const layout = layoutAt(width);
      expect(layout.width).toBe(Math.max(width, MIN_WIDTH));
      expect(layout.width - layout.line.endX).toBeLessThanOrEqual(20);
    }
  });

  test("la altura y el tamaño del convertidor no dependen del ancho", () => {
    const reference = layoutAt(MIN_WIDTH);
    for (const width of WIDTHS) {
      const layout = layoutAt(width);
      expect(layout.height).toBe(reference.height);
      expect(layout.mainY).toBe(MAIN_Y);
      expect(layout.converter.width).toBe(CONVERTER_SIZE.width);
      expect(layout.converter.height).toBe(CONVERTER_SIZE.height);
      expect(layout.symbols.transformer?.width).toBe(reference.symbols.transformer?.width);
      expect(layout.symbols.q1?.width).toBe(reference.symbols.q1?.width);
      expect(layout.symbols.qeBranch?.height).toBe(reference.symbols.qeBranch?.height);
    }
  });

  test("el lugar de cada etiqueta tampoco depende del ancho (solo su posición)", () => {
    const reference = layoutAt(MIN_WIDTH);
    for (const width of WIDTHS) {
      for (const [id, label] of labelBoxes(layoutAt(width))) {
        expect(label.box.width, id).toBe(reference.labels[id as keyof typeof reference.labels].box.width);
        expect(label.box.height, id).toBe(reference.labels[id as keyof typeof reference.labels].box.height);
      }
    }
  });
});

describe("layoutDiagram: ancho mínimo", () => {
  test("por debajo del mínimo devuelve el layout del mínimo", () => {
    const small = layoutAt(300);
    const minimum = layoutAt(MIN_WIDTH);
    expect(small).toEqual(minimum);
    expect(small.width).toBe(MIN_WIDTH);
  });

  test("sin coordenadas negativas ni fuera del dibujo, al ancho mínimo", () => {
    const layout = layoutAt(0);
    expect(layout.redAc.cx).toBeGreaterThan(0);
    expect(layout.line.endX).toBeLessThanOrEqual(layout.width);
  });

  test("con letras más grandes necesita más ancho", () => {
    expect(layoutAt(0, wide).minWidth).toBeGreaterThan(MIN_WIDTH);
  });
});

describe("layoutDiagram: no depende del estado de la estación", () => {
  test("la misma entrada da siempre el mismo layout", () => {
    expect(layoutAt(1500)).toEqual(layoutAt(1500));
  });

  test("las lecturas reservan el lugar del peor caso, con el formato de la pantalla", () => {
    const worst = formatReadings({ powerMW: 9999, udcKV: 9999, idcKA: 9.99 });
    const { labels } = layoutAt(1500);
    // El lugar reservado es al menos el del texto más largo que puede aparecer.
    expect(labels.readingPower.box.width).toBeGreaterThanOrEqual(worst.power.length * 9);
    expect(labels.readingUdc.box.width).toBeGreaterThanOrEqual(worst.udc.length * 9);
    expect(labels.readingIdc.box.width).toBeGreaterThanOrEqual(worst.idc.length * 9);
    // Y un texto real (por ejemplo "Idc = 0.00 kA") cabe de sobra.
    const real = formatReadings({ powerMW: 0, udcKV: 0, idcKA: 0 });
    expect(real.idc).toBe("Idc = 0.00 kA"); // punto decimal, como en la pantalla
    expect(labels.readingIdc.box.width).toBeGreaterThanOrEqual(real.idc.length * 9);
  });

  test("el estado del convertidor reserva el lugar del texto más ancho", () => {
    const { labels } = layoutAt(1500);
    expect(labels.converterState.box.width).toBeGreaterThanOrEqual("DESBLOQUEADO".length * 10);
  });
});
