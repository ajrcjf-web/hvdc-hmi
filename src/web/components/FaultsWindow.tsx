// Ventana de simulación del instructor: el operador no provoca nada desde aquí. Los botones
// hablan de la causa (la condición), no del ciclo de vida: la alarma se activa y se normaliza
// como consecuencia, igual que con una falla real. Por ahora
// solo tiene las alarmas de prueba (una por prioridad); las fallas y las protecciones
// llegan en la subfase 4.4.
import type { Dispatch } from "react";
import { alarmPriorities, testAlarmCodes, type AlarmState } from "../../alarms.ts";
import { describeSignal } from "../../signals.ts";
import { priorityLabels } from "../alarmView.ts";
import { guardedProps } from "../guardedButton.ts";
import type { HmiAction } from "../hmiState.ts";

type Props = {
  alarms: AlarmState;
  dispatch: Dispatch<HmiAction>;
};

export function FaultsWindow({ alarms, dispatch }: Props) {
  return (
    <section className="panel">
      <h1>Simulación de fallas</h1>
      <p className="empty">
        Ventana del instructor. Las fallas y las protecciones llegan en la subfase 4.4.
      </p>
      <h2>Alarmas de prueba</h2>
      <ul className="test-alarms">
        {testAlarmCodes.map((code) => {
          const active = alarms.forced[code];
          return (
            <li key={code}>
              <span className="test-alarm-name">
                {describeSignal(code)} ({priorityLabels[alarmPriorities[code]]})
              </span>
              <span className="test-alarm-state">{active ? "Condición presente" : "Condición despejada"}</span>
              <button
                type="button"
                {...guardedProps(active, () =>
                  dispatch({ type: "set-test-alarm", code, active: true }),
                )}
              >
                Provocar condición
              </button>
              <button
                type="button"
                {...guardedProps(!active, () =>
                  dispatch({ type: "set-test-alarm", code, active: false }),
                )}
              >
                Despejar condición
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
