// Un botón que se ve apagado pero sigue pudiendo recibir el foco (aria-disabled).
//
// Con `disabled` el navegador quita el botón del foco: si el botón se apaga justo después de
// usarlo (por ejemplo "Reconocer"), el foco se pierde y el operador de teclado no sabe dónde
// está. Con aria-disabled el botón conserva el foco, pero el navegador ya NO bloquea la
// acción: hay que ignorarla en el código. Un botón se activa por tres caminos: el clic, la
// tecla Enter (al bajar la tecla) y la barra espaciadora (al soltarla). Los tres se ignoran.

export type GuardEvent = { key?: string; preventDefault: () => void };

export type GuardedProps = {
  "aria-disabled": true | undefined;
  onClick: (event: GuardEvent) => void;
  onKeyDown: (event: GuardEvent) => void;
  onKeyUp: (event: GuardEvent) => void;
};

export function guardedProps(disabled: boolean, onActivate: () => void): GuardedProps {
  return {
    "aria-disabled": disabled ? true : undefined,
    onClick: (event) => {
      // Última defensa: todo camino de activación termina en un clic.
      if (disabled) {
        event.preventDefault();
        return;
      }
      onActivate();
    },
    // Enter activa el botón al bajar la tecla; se anula para que no llegue a ser un clic.
    onKeyDown: (event) => {
      if (disabled && (event.key === "Enter" || event.key === " ")) event.preventDefault();
    },
    // La barra espaciadora activa el botón al soltarla.
    onKeyUp: (event) => {
      if (disabled && event.key === " ") event.preventDefault();
    },
  };
}
