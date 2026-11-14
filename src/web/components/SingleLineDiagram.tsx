// Unifilar de la estación en SVG. Solo muestra: no recibe clics ni da órdenes.
// Qué se dibuja lo decide describeDiagram; dónde va cada cosa, layoutDiagram.
//
// El dibujo es en píxeles reales (1 unidad = 1 píxel): al ensanchar la ventana solo crecen
// las distancias entre los equipos y el largo de las líneas. Las letras, el grosor de las
// líneas y los símbolos mantienen su tamaño. Si el lugar es más angosto que el mínimo que
// necesitan las etiquetas para no tocarse, el dibujo completo se achica de forma pareja.
import { useMemo, useRef } from "react";
import { converterLabels } from "../../labels.ts";
import type { Station } from "../../station.ts";
import { describeDiagram, formatReadings, type Energization } from "../diagram.ts";
import { layoutDiagram } from "../diagramLayout.ts";
import { useElementWidth, useTextMetrics } from "../diagramMetrics.ts";
import { SwitchSymbol } from "./SwitchSymbol.tsx";

type Props = {
  station: Station;
};

function Wire({ x1, y1, x2, y2, energized }: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  energized: Energization;
}) {
  // Con tensión: trazo grueso continuo. Sin tensión: trazo fino discontinuo.
  return <line className={`wire wire-${energized}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
}

export function SingleLineDiagram({ station }: Props) {
  const model = describeDiagram(station);
  const { switches, segments } = model;
  const blocked = model.converter === "blocked";
  const readings = formatReadings(model.readings);

  const frameRef = useRef<HTMLDivElement>(null);
  const available = useElementWidth(frameRef);
  const { fontPx, textWidth } = useTextMetrics();
  const layout = useMemo(
    () => layoutDiagram(available, fontPx, textWidth),
    [available, fontPx, textWidth],
  );
  const { labels, converter, qe } = layout;
  const mainY = layout.mainY;

  const description =
    `Estado ${model.state}. ` +
    `Q1 ${switches.Q1.position}, Q2 ${switches.Q2.position}, QE ${switches.QE.position}. ` +
    `Convertidor ${converterLabels[model.converter]}.`;

  // Un texto del dibujo, en el lugar que le reservó el layout.
  const at = (id: keyof typeof labels) => ({
    x: labels[id].x,
    y: labels[id].y,
    textAnchor: labels[id].anchor,
  });

  return (
    <section className="panel">
      <h2>Unifilar</h2>
      <div
        ref={frameRef}
        className={model.abnormal ? "diagram-frame diagram-abnormal" : "diagram-frame"}
      >
        <svg
          className="diagram"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-labelledby="diagram-title diagram-desc"
        >
          <title id="diagram-title">Unifilar de la estación HVDC</title>
          <desc id="diagram-desc">{description}</desc>

          {model.abnormal && (
            <text className="abnormal-text" {...at("abnormal")}>
              ESTADO INCONSISTENTE
            </text>
          )}

          {/* Cables, debajo de los símbolos */}
          <Wire
            x1={layout.redAc.cx + 22}
            y1={mainY}
            x2={layout.q1.cx - 20}
            y2={mainY}
            energized={segments.acGrid}
          />
          <Wire
            x1={layout.q1.cx + 20}
            y1={mainY}
            x2={converter.x}
            y2={mainY}
            energized={segments.acStation}
          />
          <Wire
            x1={converter.x + converter.width}
            y1={mainY}
            x2={layout.q2.cx - 20}
            y2={mainY}
            energized={segments.dcStation}
          />
          <Wire
            x1={layout.q2.cx + 20}
            y1={mainY}
            x2={layout.line.endX}
            y2={mainY}
            energized={segments.dcLine}
          />
          <Wire x1={qe.cx} y1={mainY} x2={qe.cx} y2={qe.cy - 20} energized={segments.dcStation} />
          <Wire x1={qe.cx} y1={qe.cy + 20} x2={qe.cx} y2={layout.groundY} energized="dead" />

          {/* Red AC */}
          <circle className="symbol" cx={layout.redAc.cx} cy={mainY} r={22} />
          <text className="symbol-text" x={layout.redAc.cx} y={mainY + 6} textAnchor="middle">
            ~
          </text>
          <text className="label-name" {...at("redAc")}>
            Red AC
          </text>

          {/* Transformador: dos círculos que se solapan */}
          <circle className="symbol filled" cx={layout.transformer.cx - 12} cy={mainY} r={22} />
          <circle className="symbol filled" cx={layout.transformer.cx + 12} cy={mainY} r={22} />
          <text className="label-name" {...at("transformer")}>
            Transformador
          </text>

          {/* Convertidor: bloqueado = solo contorno, desbloqueado = relleno */}
          <rect
            className={blocked ? "symbol converter-blocked" : "symbol converter-deblocked"}
            x={converter.x}
            y={converter.y}
            width={converter.width}
            height={converter.height}
          />
          <line
            className="converter-line"
            x1={converter.x}
            y1={converter.y + converter.height}
            x2={converter.x + converter.width}
            y2={converter.y}
          />
          <text className="converter-text" x={converter.x + 18} y={converter.y + 26}>~</text>
          <text
            className="converter-text"
            x={converter.x + converter.width - 28}
            y={converter.y + 66}
          >
            =
          </text>
          {/* El nombre va encima de la caja y el estado debajo: ningún texto toca el dibujo. */}
          <text className="label-name" {...at("converterName")}>
            Convertidor
          </text>
          <text className="label-name" {...at("converterState")}>
            {converterLabels[model.converter].toUpperCase()}
          </text>

          {/* Equipos de maniobra */}
          <SwitchSymbol
            name="Q1"
            view={switches.Q1}
            cx={layout.q1.cx}
            cy={mainY}
            nameLabel={labels.q1Name}
            positionLabel={labels.q1Position}
            breaker
          />
          <SwitchSymbol
            name="Q2"
            view={switches.Q2}
            cx={layout.q2.cx}
            cy={mainY}
            nameLabel={labels.q2Name}
            positionLabel={labels.q2Position}
          />
          <SwitchSymbol
            name="QE"
            view={switches.QE}
            cx={qe.cx}
            cy={qe.cy}
            nameLabel={labels.qeName}
            positionLabel={labels.qePosition}
            vertical
          />

          {/* Símbolo de tierra: siempre dibujado; la posición se ve en la cuchilla de QE */}
          <line className="ground" x1={qe.cx - 14} y1={layout.groundY} x2={qe.cx + 14} y2={layout.groundY} />
          <line className="ground" x1={qe.cx - 9} y1={layout.groundY + 6} x2={qe.cx + 9} y2={layout.groundY + 6} />
          <line className="ground" x1={qe.cx - 4} y1={layout.groundY + 12} x2={qe.cx + 4} y2={layout.groundY + 12} />

          {/* Línea DC */}
          <text className="label-name" {...at("lineDc")}>
            Línea DC
          </text>

          {/* Valores junto al convertidor */}
          <g className="readings">
            <text {...at("readingPower")}>{readings.power}</text>
            <text {...at("readingUdc")}>{readings.udc}</text>
            <text {...at("readingIdc")}>{readings.idc}</text>
          </g>
        </svg>
      </div>
    </section>
  );
}
