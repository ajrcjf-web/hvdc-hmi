// Barra de navegación: un botón por ventana. Son botones y no enlaces para no invitar
// a abrir otra pestaña (cada pestaña tendría su propia simulación). La ventana activa se
// distingue por forma y peso (borde inferior y negrita) y por aria-current, no por color.
// Los botones no dicen si la ventana está pendiente: lo dice la propia ventana al abrirla (así la
// barra entra en una línea a 1280 px con el panel de eventos abierto).
//
// A la derecha va el indicador de alarmas, visible desde todas las ventanas: la cantidad
// y la prioridad más alta (por texto, símbolo y color), intermitente si hay alguna sin
// reconocer. Al pulsarlo se abre la ventana de alarmas. Su ancho no depende de lo que dice:
// el texto real y los textos más anchos posibles (invisibles) están en la misma celda de una
// grilla, así la caja reserva el ancho del más largo y no cambia ni pasa a otra línea cuando
// llega la primera alarma.

// Se calcula una vez: depende solo de cuántas alarmas existen.
const reservedTexts = widestAlarmSummaryTexts(alarmCodes.length);
import { alarmCodes } from "../../alarms.ts";
import { describeAlarmSummary, formatAlarmSummary, widestAlarmSummaryTexts, type AlarmSummary } from "../alarmView.ts";
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
        </button>
      ))}
      <button
        type="button"
        className={classes.join(" ")}
        onClick={() => onNavigate("alarms")}
        aria-label={`Alarmas: ${text}${alarmSummary.blinking ? ", hay alguna sin reconocer" : ""}`}
      >
        <span className="alarm-text-stack">
          <span className="alarm-text-actual">{formatAlarmSummary(alarmSummary)}</span>
          {reservedTexts.map((reserved) => (
            <span key={reserved} className="alarm-text-reserve" aria-hidden="true">
              {reserved}
            </span>
          ))}
        </span>
      </button>
    </nav>
  );
}
