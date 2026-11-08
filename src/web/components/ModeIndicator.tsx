// El modo de operación, siempre visible en la overview. Solo muestra.
// Se distingue por texto, símbolo y forma del borde (simple: automático, doble: manual),
// nunca por color (ISA-101).
import { modeLabels } from "../../labels.ts";
import type { OperatingMode } from "../../station.ts";

type Props = {
  mode: OperatingMode;
};

const symbols: Record<OperatingMode, string> = {
  automatic: "[A]",
  manual: "[M]",
};

export function ModeIndicator({ mode }: Props) {
  return (
    <p className={`mode-indicator mode-${mode}`} aria-label={`Modo de operación: ${modeLabels[mode]}`}>
      <span aria-hidden="true">{symbols[mode]}</span> MODO {modeLabels[mode].toUpperCase()}
    </p>
  );
}
