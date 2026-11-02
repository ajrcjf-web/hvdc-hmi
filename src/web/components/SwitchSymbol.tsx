// Símbolo de un equipo de maniobra (Q1, Q2 o QE). Solo dibuja.
// La posición se distingue por la forma, no por el color:
//   cerrado    → cuchilla recta, de terminal a terminal
//   abierto    → cuchilla levantada, en ángulo
//   en maniobra → cuchilla discontinua, a medio camino
// Además lleva siempre un texto con la posición.
import { positionLabels } from "../../labels.ts";
import type { SwitchView } from "../diagram.ts";

type Props = {
  name: string; // "Q1", "Q2", "QE"
  view: SwitchView;
  cx: number;
  cy: number;
  vertical?: boolean; // el equipo está en una derivación vertical
  breaker?: boolean; // interruptor (con cuadro) en vez de seccionador
};

const HALF = 20; // distancia del centro a cada terminal

function bladeEnd(position: SwitchView["position"]): { x: number; y: number } {
  switch (position) {
    case "closed":
      return { x: HALF, y: 0 };
    case "open":
      return { x: 14, y: -24 };
    case "moving":
      return { x: 18, y: -11 };
  }
}

export function SwitchSymbol({ name, view, cx, cy, vertical = false, breaker = false }: Props) {
  const end = bladeEnd(view.position);
  const rotation = vertical ? 90 : 0;
  // Texto junto al equipo: encima si es horizontal, a la derecha si es vertical.
  const textX = vertical ? cx + 34 : cx;
  const nameY = vertical ? cy - 2 : cy - 40;
  const positionY = vertical ? cy + 14 : cy + 40;
  const anchor = vertical ? "start" : "middle";

  return (
    <g className={`switch switch-${view.position}`}>
      <g transform={`translate(${cx} ${cy}) rotate(${rotation})`}>
        {breaker && <rect className="symbol" x={-11} y={-11} width={22} height={22} />}
        <circle className="terminal" cx={-HALF} cy={0} r={3.5} />
        <circle className="terminal" cx={HALF} cy={0} r={3.5} />
        <line
          className={view.position === "moving" ? "blade blade-moving" : "blade"}
          x1={-HALF}
          y1={0}
          x2={end.x}
          y2={end.y}
        />
      </g>
      <text className="label-name" x={textX} y={nameY} textAnchor={anchor}>
        {name}
      </text>
      <text className="label-detail" x={textX} y={positionY} textAnchor={anchor}>
        {positionLabels[view.position]}
      </text>
    </g>
  );
}
