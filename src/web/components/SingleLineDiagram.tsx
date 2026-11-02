// Unifilar de la estación en SVG. Solo muestra: no recibe clics ni da órdenes.
// Qué se dibuja lo decide describeDiagram; aquí solo se pone en el papel.
import { converterLabels, formatValue } from "../../labels.ts";
import type { Station } from "../../station.ts";
import { describeDiagram, type Energization } from "../diagram.ts";
import { SwitchSymbol } from "./SwitchSymbol.tsx";

type Props = {
  station: Station;
};

const MAIN_Y = 110; // altura de la línea principal
const Q1_X = 170;
const Q2_X = 610;
const QE_X = 550; // la derivación a tierra sale entre el convertidor y Q2
const CONVERTER = { x: 410, y: 70, width: 100, height: 80 };

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
  const { switches, segments, readings } = model;
  const blocked = model.converter === "blocked";

  const description =
    `Estado ${model.state}. ` +
    `Q1 ${switches.Q1.position}, Q2 ${switches.Q2.position}, QE ${switches.QE.position}. ` +
    `Convertidor ${converterLabels[model.converter]}.`;

  return (
    <section className="panel">
      <h2>Unifilar</h2>
      <svg
        className={model.abnormal ? "diagram diagram-abnormal" : "diagram"}
        viewBox="0 0 940 280"
        role="img"
        aria-labelledby="diagram-title diagram-desc"
      >
        <title id="diagram-title">Unifilar de la estación HVDC</title>
        <desc id="diagram-desc">{description}</desc>

        {model.abnormal && (
          <text className="abnormal-text" x={470} y={24} textAnchor="middle">
            ESTADO INCONSISTENTE
          </text>
        )}

        {/* Cables, debajo de los símbolos */}
        <Wire x1={72} y1={MAIN_Y} x2={Q1_X - 20} y2={MAIN_Y} energized={segments.acGrid} />
        <Wire x1={Q1_X + 20} y1={MAIN_Y} x2={CONVERTER.x} y2={MAIN_Y} energized={segments.acStation} />
        <Wire
          x1={CONVERTER.x + CONVERTER.width}
          y1={MAIN_Y}
          x2={Q2_X - 20}
          y2={MAIN_Y}
          energized={segments.dcStation}
        />
        <Wire x1={Q2_X + 20} y1={MAIN_Y} x2={900} y2={MAIN_Y} energized={segments.dcLine} />
        <Wire x1={QE_X} y1={MAIN_Y} x2={QE_X} y2={170} energized={segments.dcStation} />
        <Wire x1={QE_X} y1={210} x2={QE_X} y2={242} energized="dead" />

        {/* Red AC */}
        <circle className="symbol" cx={50} cy={MAIN_Y} r={22} />
        <text className="symbol-text" x={50} y={MAIN_Y + 6} textAnchor="middle">~</text>
        <text className="label-name" x={50} y={MAIN_Y - 36} textAnchor="middle">Red AC</text>

        {/* Transformador: dos círculos que se solapan */}
        <circle className="symbol filled" cx={288} cy={MAIN_Y} r={22} />
        <circle className="symbol filled" cx={312} cy={MAIN_Y} r={22} />
        <text className="label-name" x={300} y={MAIN_Y - 36} textAnchor="middle">Transformador</text>

        {/* Convertidor: bloqueado = solo contorno, desbloqueado = relleno */}
        <rect
          className={blocked ? "symbol converter-blocked" : "symbol converter-deblocked"}
          {...CONVERTER}
        />
        <line
          className="converter-line"
          x1={CONVERTER.x}
          y1={CONVERTER.y + CONVERTER.height}
          x2={CONVERTER.x + CONVERTER.width}
          y2={CONVERTER.y}
        />
        <text className="converter-text" x={CONVERTER.x + 18} y={CONVERTER.y + 26}>~</text>
        <text className="converter-text" x={CONVERTER.x + CONVERTER.width - 28} y={CONVERTER.y + 66}>=</text>
        {/* El nombre va encima de la caja y el estado debajo: ningún texto toca el dibujo. */}
        <text className="label-name" x={460} y={CONVERTER.y - 12} textAnchor="middle">Convertidor</text>
        <text className="label-name" x={460} y={CONVERTER.y + CONVERTER.height + 22} textAnchor="middle">
          {converterLabels[model.converter].toUpperCase()}
        </text>

        {/* Equipos de maniobra */}
        <SwitchSymbol name="Q1" view={switches.Q1} cx={Q1_X} cy={MAIN_Y} breaker />
        <SwitchSymbol name="Q2" view={switches.Q2} cx={Q2_X} cy={MAIN_Y} />
        <SwitchSymbol name="QE" view={switches.QE} cx={QE_X} cy={190} vertical />

        {/* Símbolo de tierra: siempre dibujado; la posición se ve en la cuchilla de QE */}
        <line className="ground" x1={QE_X - 14} y1={242} x2={QE_X + 14} y2={242} />
        <line className="ground" x1={QE_X - 9} y1={248} x2={QE_X + 9} y2={248} />
        <line className="ground" x1={QE_X - 4} y1={254} x2={QE_X + 4} y2={254} />

        {/* Línea DC */}
        <text className="label-name" x={800} y={MAIN_Y - 16} textAnchor="middle">Línea DC</text>

        {/* Valores junto al convertidor */}
        <g className="readings">
          <text x={CONVERTER.x} y={206}>P = {formatValue(readings.powerMW, 0)} MW</text>
          <text x={CONVERTER.x} y={226}>Udc = {formatValue(readings.udcKV, 0)} kV</text>
          <text x={CONVERTER.x} y={246}>Idc = {formatValue(readings.idcKA, 2)} kA</text>
        </g>
      </svg>
    </section>
  );
}
