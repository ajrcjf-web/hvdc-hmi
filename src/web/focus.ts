// A dónde va el foco cuando se cierra la ventana de confirmación. Función pura: el
// componente se ocupa de enfocar de verdad.

// Lo mínimo que se necesita saber de un elemento para decidir: si sigue en la página.
export type FocusCandidate = { isConnected: boolean };

// El foco vuelve al elemento que abrió la ventana. Si ya no está en la página (por ejemplo,
// la orden cambió el modo y el botón fue reemplazado), va al de reserva: así nunca queda en
// el vacío.
export function focusTarget<T extends FocusCandidate>(opener: T | null, fallback: T | null): T | null {
  return opener !== null && opener.isConnected ? opener : fallback;
}
