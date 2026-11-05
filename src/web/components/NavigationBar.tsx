// Barra de navegación: un botón por ventana. Son botones y no enlaces para no invitar
// a abrir otra pestaña (cada pestaña tendría su propia simulación). La ventana activa se
// distingue por forma y peso (borde inferior y negrita) y por aria-current, no por color.
import { windows, type WindowId } from "../windows.ts";

type Props = {
  active: WindowId;
  onNavigate: (id: WindowId) => void;
};

export function NavigationBar({ active, onNavigate }: Props) {
  return (
    <nav className="nav" aria-label="Ventanas">
      {windows.map((w) => (
        <button
          key={w.id}
          type="button"
          className={w.id === active ? "nav-active" : undefined}
          aria-current={w.id === active ? "page" : undefined}
          onClick={() => onNavigate(w.id)}
        >
          {w.label}
          {w.available ? "" : " (pendiente)"}
        </button>
      ))}
    </nav>
  );
}
