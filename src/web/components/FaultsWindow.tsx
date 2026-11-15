// Ventana de simulación del instructor: el operador no provoca nada desde aquí. Los botones
// hablan de la causa (la condición), no de lo que pasa después: la protección actúa, el 86 se
// enclava y la alarma aparece como consecuencia, igual que con una falla real. Provocar o
// despejar no son órdenes de mando: no hay selección ni confirmación, y despejar una falla
// no suelta el 86 (lo resetea el operador).
// Las fallas de la red llevan un dato (la ubicación en la línea AC, la tensión residual): se
// escribe antes de provocarla, y la ubicación real de la falla queda solo en esta ventana.
import { useState, type Dispatch } from "react";
import { alarmPriorities, testAlarmCodes, type AlarmState } from "../../alarms.ts";
import type { FaultKind } from "../../protections.ts";
import type { Station, StationConfig } from "../../station.ts";
import { describeSignal } from "../../signals.ts";
import { priorityLabels } from "../alarmView.ts";
import { faultFromInput, summarizeStation, toFaultRows } from "../faultView.ts";
import { guardedProps } from "../guardedButton.ts";
import type { HmiAction } from "../hmiState.ts";

type Props = {
  station: Station;
  config: StationConfig;
  alarms: AlarmState;
  dispatch: Dispatch<HmiAction>;
};

export function FaultsWindow({ station, config, alarms, dispatch }: Props) {
  const rows = toFaultRows(station, config);
  // Lo que el instructor está escribiendo en cada campo; solo se convierte en número al provocar.
  const [inputs, setInputs] = useState<Partial<Record<FaultKind, string>>>(() =>
    Object.fromEntries(rows.flatMap((r) => (r.parameter ? [[r.kind, r.parameter.defaultText]] : []))),
  );

  return (
    <section className="panel">
      <h1>Simulación de fallas</h1>
      <p>Ventana del instructor. {summarizeStation(station)}</p>

      <h2>Fallas</h2>
      <ul className="test-alarms">
        {rows.map((row) => {
          const text = inputs[row.kind] ?? "";
          const fault = faultFromInput(row.kind, text);
          const invalid = row.parameter !== null && fault === null;
          return (
            <li key={row.kind}>
              <span className="test-alarm-name">{row.name}</span>
              {row.parameter !== null && (
                <label className="fault-parameter">
                  <input
                    type="number"
                    min={row.parameter.min}
                    max={row.parameter.max}
                    step="1"
                    value={text}
                    onChange={(event) =>
                      setInputs((current) => ({ ...current, [row.kind]: event.target.value }))
                    }
                    aria-label={row.parameter.label}
                    aria-invalid={invalid ? true : undefined}
                  />
                  <span aria-hidden="true">%</span>
                </label>
              )}
              <span className="test-alarm-state">{row.stateLabel}</span>
              <button
                type="button"
                {...guardedProps(row.present || fault === null, () => {
                  if (fault !== null) dispatch({ type: "set-fault", fault });
                })}
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
              {row.parameter !== null && (
                <p className="fault-note">
                  {row.parameter.label}: de {row.parameter.min} a {row.parameter.max}.{" "}
                  {row.parameter.hint}.
                  {invalid && ` El valor escrito no vale: debe estar entre ${row.parameter.min} y ${row.parameter.max}.`}
                </p>
              )}
              {row.note !== "" && <p className="fault-note">{row.note}</p>}
            </li>
          );
        })}
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
