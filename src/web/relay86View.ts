// Qué se muestra del relé de bloqueo 86 en la overview: su estado, sus causas y la última
// protección que actuó. Funciones puras: solo preparan textos y datos; los componentes dibujan.

import type { SerEvent } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { relay86Causes } from "../protections.ts";
import { describeSignal } from "../signals.ts";
import type { Station, StationConfig } from "../station.ts";

// Las dos etiquetas del indicador. Se dibujan las dos (la inactiva invisible) para reservar el
// ancho de la más larga con la fuente real.
export const relay86Labels = {
  normal: { symbol: "[□]", label: "RELÉ 86 NORMAL" },
  locked: { symbol: "[■]", label: "RELÉ 86 ENCLAVADO" },
} as const;

export type Relay86View = {
  locked: boolean;
  label: string; // el texto del indicador
  symbol: string; // se distingue también por símbolo y por la forma del borde, no solo por color
  accessibleLabel: string;
  // Las protecciones que enclavaron el 86 y si su falla sigue presente o ya se despejó:
  // la señal de que se puede resetear. Vacío si el 86 no está enclavado.
  causes: { name: string; present: boolean; text: string }[];
};

export function describeRelay86(station: Station, config: StationConfig): Relay86View {
  const locked = station.relay86.locked;
  return {
    locked,
    label: relay86Labels[locked ? "locked" : "normal"].label,
    symbol: relay86Labels[locked ? "locked" : "normal"].symbol,
    accessibleLabel: `Relé de bloqueo 86: ${locked ? "enclavado" : "normal"}`,
    causes: relay86Causes(station, config).map((cause) => ({
      name: cause.name,
      present: cause.present,
      text: `${cause.name}: falla ${cause.present ? "presente" : "despejada"}`,
    })),
  };
}

export type LastProtection = {
  name: string;
  timestamp: string; // la hora del SER (fecha y hora con milisegundos), para buscarla en su ventana
};

// La última protección que actuó, según el SER (el más reciente primero). No es lo mismo
// que las causas del 86: sigue visible después del reset, como dato histórico, mientras el
// evento siga en el SER.
export function lastProtection(events: SerEvent[]): LastProtection | null {
  const event = events.find((e) => e.code.startsWith("PROT.") && e.state === "operated");
  if (event === undefined) return null;
  return { name: describeSignal(event.code), timestamp: formatTimestamp(event.timestampMs) };
}
