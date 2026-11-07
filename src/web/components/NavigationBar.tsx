// Barra de navegación: un botón por ventana. Son botones y no enlaces para no invitar
// a abrir otra pestaña (cada pestaña tendría su propia simulación). La ventana activa se
// distingue por forma y peso (borde inferior y negrita) y por aria-current, no por color.
//
// A la derecha va el indicador de alarmas, visible desde todas las ventanas: la cantidad
// y la prioridad más alta (por texto, símbolo y color), intermitente si hay alguna sin
// reconocer. Al pulsarlo se abre la ventana de alarmas.
import { describeAlarmSummary, UNACKNOWLEDGED_SYMBOL, type AlarmSummary } from "../alarmView.ts";
import { windows, type WindowId } from "../windows.ts";

type Props = {
  active: WindowId;
  alarmSummary: AlarmSummary;
  onNavigate: (id: WindowId) => void;
};

export function NavigationBar({ active, alarmSummary, onNavigate }: Props) {
  const classes = ["alarm-indicator"];
  if (alarmSummary.highest !== null) classes.push(`alarm-${alarmSummary.highest}`);
  if (alarmSummary.blinking) classes.push("alarm-unacknowledged");
  const text = describeAlarmSummary(alarmSummary);

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
      <button
        type="button"
        className={classes.join(" ")}
        onClick={() => onNavigate("alarms")}
        aria-label={`Alarmas: ${text}${alarmSummary.blinking ? ", hay alguna sin reconocer" : ""}`}
      >
        {alarmSummary.blinking && `${UNACKNOWLEDGED_SYMBOL} `}
        {text}
      </button>
    </nav>
  );
}
