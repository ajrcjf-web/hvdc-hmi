// El modo de operación, siempre visible en la overview. Solo muestra.
// Se distingue por texto, símbolo y forma del borde (simple: automático, doble: manual),
// nunca por color (ISA-101).
//
// Mide lo mismo en los dos modos, para que no se corra lo que tiene al lado (el indicador del
// 86 y su botón): se dibujan las dos etiquetas una sobre la otra, con la inactiva invisible,
// así la caja reserva el ancho de la más larga con la fuente real (ver styles.css).
import { modeLabels } from "../../labels.ts";
import type { OperatingMode } from "../../station.ts";

type Props = {
  mode: OperatingMode;
};

const symbols: Record<OperatingMode, string> = {
  automatic: "[A]",
  manual: "[M]",
};

const modes: OperatingMode[] = ["automatic", "manual"];

export function ModeIndicator({ mode }: Props) {
  return (
    <p className={`mode-indicator mode-${mode}`} aria-label={`Modo de operación: ${modeLabels[mode]}`}>
      {modes.map((kind) => (
        <span
          key={kind}
          className={`mode-text mode-text-${kind}${kind === mode ? "" : " mode-text-hidden"}`}
          aria-hidden="true"
        >
          {symbols[kind]} MODO {modeLabels[kind].toUpperCase()}
        </span>
      ))}
    </p>
  );
}
