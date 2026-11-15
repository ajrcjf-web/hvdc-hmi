// Ventana de simulación del instructor: el operador no provoca nada desde aquí. Los botones
// hablan de la causa (la condición), no de lo que pasa después: la protección actúa, el 86 se
// enclava y la alarma aparece como consecuencia, igual que con una falla real. Provocar o
// despejar no son órdenes de mando: no hay selección ni confirmación, y despejar una falla
// no suelta el 86 (lo resetea el operador).
import type { Dispatch } from "react";
import { alarmPriorities, testAlarmCodes, type AlarmState } from "../../alarms.ts";
import type { Station } from "../../station.ts";
import { describeSignal } from "../../signals.ts";
import { priorityLabels } from "../alarmView.ts";
import { toFaultRows, summarizeStation } from "../faultView.ts";
import { guardedProps } from "../guardedButton.ts";
import type { HmiAction } from "../hmiState.ts";

type Props = {
  station: Station;
  alarms: AlarmState;
  dispatch: Dispatch<HmiAction>;
};

export function FaultsWindow({ station, alarms, dispatch }: Props) {
  return (
    <section className="panel">
      <h1>Simulación de fallas</h1>
      <p>Ventana del instructor. {summarizeStation(station)}</p>

      <h2>Fallas</h2>
      <ul className="test-alarms">
        {toFaultRows(station).map((row) => (
          <li key={row.kind}>
            <span className="test-alarm-name">{row.name}</span>
            <span className="test-alarm-state">{row.stateLabel}</span>
            <button
              type="button"
              {...guardedProps(row.present, () =>
                dispatch({ type: "set-fault", fault: { kind: row.kind } }),
              )}
            >
              Provocar falla
            </button>
            <button
              type="button"
              {...guardedProps(!row.present, () =>
                dispatch({ type: "clear-fault", kind: row.kind }),
              )}
            >
              Despejar falla
            </button>
            {row.note !== "" && <p className="fault-note">{row.note}</p>}
          </li>
        ))}
      </ul>

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
