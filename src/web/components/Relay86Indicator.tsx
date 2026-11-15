// El estado del relé de bloqueo 86, siempre visible en la overview. Solo muestra.
// Se distingue por texto, símbolo y forma del borde (fino: normal, grueso: enclavado). El
// único color es el rojo de la alarma urgente que lo acompaña ("Relé 86 enclavado"): nunca
// es lo único que lo distingue. El tamaño es el mismo en los dos estados, para que nada se
// mueva cuando el 86 cambia.
import type { Relay86View } from "../relay86View.ts";

type Props = {
  relay: Relay86View;
};

export function Relay86Indicator({ relay }: Props) {
  return (
    <p
      className={`relay86-indicator ${relay.locked ? "relay86-locked" : "relay86-normal"}`}
      aria-label={relay.accessibleLabel}
    >
      <span aria-hidden="true">{relay.symbol}</span> {relay.label}
    </p>
  );
}
