// Lo que mide y muestra la estación en este instante. Solo muestra: no decide nada.
import { converterLabels, formatSwitch, formatTime, formatValue } from "../../labels.ts";
import { measure } from "../../measurements.ts";
import type { Station } from "../../station.ts";
import { deriveState } from "../../stationState.ts";

type Props = {
  station: Station;
  timeSeconds: number;
};

export function StatusPanel({ station, timeSeconds }: Props) {
  const { Q1, Q2, QE } = station.switchgear;
  const state = deriveState(station.switchgear);
  const { udcKV, idcKA } = measure(station);

  return (
    <section className="panel">
      <h2>Estado de la estación</h2>
      <dl className="values">
        <dt>Hora simulada</dt>
        <dd>{formatTime(timeSeconds)} s</dd>

        <dt>Estado</dt>
        <dd className={`state state-${state}`}>{state}</dd>

        <dt>Q1 (interruptor AC)</dt>
        <dd>{formatSwitch(Q1)}</dd>
        <dt>Q2 (seccionador DC)</dt>
        <dd>{formatSwitch(Q2)}</dd>
        <dt>QE (puesta a tierra)</dt>
        <dd>{formatSwitch(QE)}</dd>

        <dt>Convertidor</dt>
        <dd>{converterLabels[station.converter]}</dd>

        <dt>P</dt>
        <dd>{formatValue(station.powerMW, 0)} MW</dd>
        <dt>Consigna</dt>
        <dd>{formatValue(station.powerOrderMW, 0)} MW</dd>
        <dt>Udc</dt>
        <dd>{formatValue(udcKV, 0)} kV</dd>
        <dt>Idc</dt>
        <dd>{formatValue(idcKA, 2)} kA</dd>
      </dl>
    </section>
  );
}
