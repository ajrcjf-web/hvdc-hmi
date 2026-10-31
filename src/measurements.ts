// Valores medidos: se calculan a partir de la estación, no se guardan.
// Así nunca pueden quedar desactualizados respecto de la potencia o el estado.

import type { Station, StationConfig } from "./station.ts";

export type Measurements = {
  udcKV: number;
  idcKA: number;
};

export function measure(station: Station, config: StationConfig): Measurements {
  const udcKV = station.state === "coupled" ? config.ratedVoltageKV : 0;
  const idcKA = udcKV > 0 ? station.powerMW / udcKV : 0;
  return { udcKV, idcKA };
}
