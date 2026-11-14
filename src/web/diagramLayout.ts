// Dónde va cada cosa del unifilar según el ancho disponible. Función pura: no sabe nada de
// SVG, de React ni del navegador (el ancho del texto se lo pasan), así que se prueba sola.
//
// El dibujo se hace en píxeles reales: 1 unidad = 1 píxel. Por eso el tamaño de las letras,
// el grosor de las líneas y el tamaño de los símbolos (contactos, tierra, convertidor,
// transformador) NO dependen del ancho. Lo único que crece con el ancho es la distancia
// entre los elementos, y con ella el largo de las líneas.
//
// Ninguna etiqueta puede tocar el dibujo ni a otra etiqueta. Para que se cumpla a cualquier
// ancho, cada elemento reserva el lugar de sus etiquetas (con el texto más ancho que puedan
// mostrar), y el layout no depende del estado de la estación: nada se mueve cuando cambia
// una posición o un valor.

import { converterLabels, positionLabels } from "../labels.ts";
import { formatReadings } from "./diagram.ts";

// Ancho de un texto en píxeles, con la fuente del dibujo. Lo da el navegador (o, en los
// tests, una estimación fija).
export type TextWidth = (text: string, bold: boolean) => number;

export type Box = { x: number; y: number; width: number; height: number };

export type LabelId =
  | "abnormal"
  | "redAc"
  | "transformer"
  | "converterName"
  | "converterState"
  | "q1Name"
  | "q1Position"
  | "q2Name"
  | "q2Position"
  | "qeName"
  | "qePosition"
  | "lineDc"
  | "readingPower"
  | "readingUdc"
  | "readingIdc";

export type Label = {
  x: number; // dónde se dibuja el texto (según el anclaje)
  y: number; // la línea base
  anchor: "start" | "middle";
  bold: boolean;
  box: Box; // el lugar reservado: el texto más ancho que puede mostrar
};

export type DiagramLayout = {
  width: number; // ancho del dibujo (nunca menor que minWidth)
  height: number;
  minWidth: number; // por debajo de este ancho no entran las etiquetas sin tocarse
  mainY: number; // altura de la línea principal
  redAc: { cx: number };
  q1: { cx: number };
  transformer: { cx: number };
  converter: Box & { cx: number };
  qe: { cx: number; cy: number };
  q2: { cx: number };
  line: { endX: number }; // donde termina la línea DC
  groundY: number; // la raya de tierra más alta
  labels: Record<LabelId, Label>;
  // Lo que ocupan los símbolos y los cables, para comprobar que ninguna etiqueta los toca.
  symbols: Record<string, Box>;
};

// --- Tamaños que no dependen del ancho (en píxeles) -----------------------------------
export const MAIN_Y = 110; // altura de la línea principal
export const SWITCH_HALF = 20; // del centro de un equipo a cada terminal
export const CONVERTER_SIZE = { width: 100, height: 80 };
const CONVERTER_Y = 70;
const QE_CY = 190;
const GROUND_Y = 242; // la raya de tierra más alta (siguen dos más, de 6 en 6)
const BASE_HEIGHT = 280;

const MARGIN_LEFT = 10;
const MARGIN_RIGHT = 10;
const MIN_GAP = 28; // distancia mínima entre lo que ocupa cada elemento
const LINE_TAIL = 24; // línea DC que sobra después de su etiqueta
const TEXT_SAFETY = 1.08; // margen sobre el ancho medido (fuente de reemplazo, números)

// Lo que ocupa cada símbolo, con el grosor de su trazo (mitad del ancho, a cada lado).
const CIRCLE_HALF = 22 + 1.5;
const TRANSFORMER_HALF = 34 + 1.5; // dos círculos de radio 22 con centros a ±12
const SWITCH_X_HALF = SWITCH_HALF + 5; // terminal (radio 3.5) y trazo
const SWITCH_TOP = 24 + 2; // la cuchilla abierta sube hasta 24
const SWITCH_BOTTOM = 12; // el cuadro del interruptor baja hasta 11
const QE_LEFT = 14 + 2; // lo más a la izquierda de QE: la raya de tierra
const QE_LABEL_DX = 34; // las etiquetas de QE van a la derecha del símbolo

// El peor caso de las lecturas: más dígitos que cualquier valor de la configuración
// por defecto. El texto sale de la misma función que lo dibuja (formatReadings).
const WORST_READINGS = { powerMW: 9999, udcKV: 9999, idcKA: 9.99 };

// Los textos que puede mostrar cada etiqueta con estado: se reserva el lugar del más ancho.
const positionTexts = Object.values(positionLabels);
const converterStateTexts = Object.values(converterLabels).map((text) => text.toUpperCase());
const readings = formatReadings(WORST_READINGS);

function box(centerOrStart: number, anchor: "start" | "middle", baseline: number, width: number, fontPx: number): Box {
  const height = Math.ceil(fontPx * 1.15);
  const ascent = Math.ceil(fontPx * 0.85);
  return {
    x: anchor === "middle" ? centerOrStart - width / 2 : centerOrStart,
    y: baseline - ascent,
    width,
    height,
  };
}

// Un elemento de la línea principal: dónde está su ancla y cuánto lugar necesita a cada lado
// (su símbolo y todas sus etiquetas).
type Extent = { left: number; right: number };

export function layoutDiagram(width: number, fontPx: number, textWidth: TextWidth): DiagramLayout {
  const w = (texts: string[], bold: boolean) =>
    Math.max(...texts.map((text) => textWidth(text, bold))) * TEXT_SAFETY;

  const nameW = (text: string) => w([text], true);
  const positionW = w(positionTexts, false);
  const readingW = Math.max(
    w([readings.power], false),
    w([readings.udc], false),
    w([readings.idc], false),
  );
  const converterTextW = Math.max(w(converterStateTexts, true), nameW("Convertidor"));
  const lineW = nameW("Línea DC");

  // Lo que necesita cada elemento a cada lado de su ancla.
  const redAc: Extent = { left: Math.max(CIRCLE_HALF, nameW("Red AC") / 2), right: 0 };
  redAc.right = redAc.left;
  const switchHalf = (name: string) => Math.max(SWITCH_X_HALF, nameW(name) / 2, positionW / 2);
  const q1: Extent = { left: switchHalf("Q1"), right: switchHalf("Q1") };
  const transformerHalf = Math.max(TRANSFORMER_HALF, nameW("Transformador") / 2);
  const transformer: Extent = { left: transformerHalf, right: transformerHalf };
  const converterHalf = CONVERTER_SIZE.width / 2 + 1.25;
  const converter: Extent = {
    left: Math.max(converterHalf, converterTextW / 2),
    // Las lecturas empiezan en el borde izquierdo de la caja y pueden pasar su borde derecho.
    right: Math.max(converterHalf, converterTextW / 2, readingW - CONVERTER_SIZE.width / 2),
  };
  const qe: Extent = {
    left: QE_LEFT,
    right: QE_LABEL_DX + Math.max(nameW("QE"), positionW),
  };
  const q2: Extent = { left: switchHalf("Q2"), right: switchHalf("Q2") };
  const lineHalf = lineW / 2;
  const line: Extent = { left: lineHalf, right: lineHalf };

  const chain = [redAc, q1, transformer, converter, qe, q2, line];
  const gaps = chain.length - 1;

  // Ancho mínimo: los lugares de todos los elementos, uno tras otro, con su separación.
  let minWidth = MARGIN_LEFT + MARGIN_RIGHT + LINE_TAIL;
  chain.forEach((extent, i) => {
    minWidth += extent.left + extent.right + (i < gaps ? MIN_GAP : 0);
  });

  const drawingWidth = Math.max(width, minWidth);
  const extraPerGap = (drawingWidth - minWidth) / gaps;

  // Se colocan las anclas de izquierda a derecha; el ancho que sobra se reparte entre los tramos.
  const anchors: number[] = [];
  let cursor = MARGIN_LEFT;
  chain.forEach((extent, i) => {
    cursor += extent.left;
    anchors.push(cursor);
    cursor += extent.right + (i < gaps ? MIN_GAP + extraPerGap : 0);
  });
  const [redAcX, q1X, transformerX, converterX, qeX, q2X, lineX] = anchors as [
    number, number, number, number, number, number, number,
  ];
  const lineEndX = lineX + line.right + LINE_TAIL;

  // --- Etiquetas -----------------------------------------------------------------------
  const make = (
    x: number,
    baseline: number,
    anchor: "start" | "middle",
    bold: boolean,
    labelWidth: number,
  ): Label => ({
    x,
    y: baseline,
    anchor,
    bold,
    box: box(x, anchor, baseline, labelWidth, fontPx),
  });

  // Las dos etiquetas de QE van a los lados del centro del equipo, sin tocarse entre sí:
  // el nombre justo encima de su altura y la posición justo debajo (según el tamaño de letra).
  const boxHeight = Math.ceil(fontPx * 1.15);
  const ascent = Math.ceil(fontPx * 0.85);
  const qeNameBaseline = QE_CY - 2 - (boxHeight - ascent);
  const qePositionBaseline = QE_CY + 2 + ascent;

  const lineSpacing = Math.max(22, boxHeight + 3); // las lecturas no se tocan entre sí
  const converterLeft = converterX - CONVERTER_SIZE.width / 2;
  const readingsY = [206, 206 + lineSpacing, 206 + 2 * lineSpacing];

  const labels: Record<LabelId, Label> = {
    abnormal: make(drawingWidth / 2, 24, "middle", true, nameW("ESTADO INCONSISTENTE")),
    redAc: make(redAcX, MAIN_Y - 36, "middle", true, nameW("Red AC")),
    transformer: make(transformerX, MAIN_Y - 36, "middle", true, nameW("Transformador")),
    converterName: make(converterX, CONVERTER_Y - 12, "middle", true, nameW("Convertidor")),
    converterState: make(
      converterX,
      CONVERTER_Y + CONVERTER_SIZE.height + 22,
      "middle",
      true,
      w(converterStateTexts, true),
    ),
    q1Name: make(q1X, MAIN_Y - 40, "middle", true, nameW("Q1")),
    q1Position: make(q1X, MAIN_Y + 40, "middle", false, positionW),
    q2Name: make(q2X, MAIN_Y - 40, "middle", true, nameW("Q2")),
    q2Position: make(q2X, MAIN_Y + 40, "middle", false, positionW),
    qeName: make(qeX + QE_LABEL_DX, qeNameBaseline, "start", true, nameW("QE")),
    qePosition: make(qeX + QE_LABEL_DX, qePositionBaseline, "start", false, positionW),
    lineDc: make(lineX, MAIN_Y - 16, "middle", true, lineW),
    readingPower: make(converterLeft, readingsY[0] as number, "start", false, w([readings.power], false)),
    readingUdc: make(converterLeft, readingsY[1] as number, "start", false, w([readings.udc], false)),
    readingIdc: make(converterLeft, readingsY[2] as number, "start", false, w([readings.idc], false)),
  };

  const lastReadingBottom = (readingsY[2] as number) + Math.ceil(fontPx * 0.3);
  const groundBottom = GROUND_Y + 12 + 1.5;
  const height = Math.max(BASE_HEIGHT, Math.ceil(Math.max(lastReadingBottom, groundBottom) + 10));

  // --- Lo que ocupa el dibujo ------------------------------------------------------------
  const symbols: Record<string, Box> = {
    redAc: { x: redAcX - CIRCLE_HALF, y: MAIN_Y - CIRCLE_HALF, width: 2 * CIRCLE_HALF, height: 2 * CIRCLE_HALF },
    q1: {
      x: q1X - SWITCH_X_HALF,
      y: MAIN_Y - SWITCH_TOP,
      width: 2 * SWITCH_X_HALF,
      height: SWITCH_TOP + SWITCH_BOTTOM,
    },
    transformer: {
      x: transformerX - TRANSFORMER_HALF,
      y: MAIN_Y - CIRCLE_HALF,
      width: 2 * TRANSFORMER_HALF,
      height: 2 * CIRCLE_HALF,
    },
    converter: {
      x: converterLeft - 1.25,
      y: CONVERTER_Y - 1.25,
      width: CONVERTER_SIZE.width + 2.5,
      height: CONVERTER_SIZE.height + 2.5,
    },
    q2: {
      x: q2X - SWITCH_X_HALF,
      y: MAIN_Y - SWITCH_TOP,
      width: 2 * SWITCH_X_HALF,
      height: SWITCH_TOP + 5,
    },
    // El equipo de tierra, vertical: del cable principal a la raya de tierra más baja.
    qeBranch: { x: qeX - QE_LEFT, y: MAIN_Y, width: QE_LEFT + 26, height: GROUND_Y + 14 - MAIN_Y },
    // El cable principal, de punta a punta.
    mainWire: { x: 0, y: MAIN_Y - 1.5, width: lineEndX, height: 3 },
  };

  return {
    width: drawingWidth,
    height,
    minWidth,
    mainY: MAIN_Y,
    redAc: { cx: redAcX },
    q1: { cx: q1X },
    transformer: { cx: transformerX },
    converter: {
      x: converterLeft,
      y: CONVERTER_Y,
      width: CONVERTER_SIZE.width,
      height: CONVERTER_SIZE.height,
      cx: converterX,
    },
    qe: { cx: qeX, cy: QE_CY },
    q2: { cx: q2X },
    line: { endX: lineEndX },
    groundY: GROUND_Y,
    labels,
    symbols,
  };
}
