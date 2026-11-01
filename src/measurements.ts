// Valores medidos de la estación.
// Udc tiene dinámica y se guarda en la estación; Idc se calcula en cada instante.

import type { Station } from "./station.ts";

export type Measurements = {
  udcKV: number;
  idcKA: number;
};

export function measure(station: Station): Measurements {
  const udcKV = station.udcKV;
  const idcKA = udcKV > 0 ? station.powerMW / udcKV : 0;
  return { udcKV, idcKA };
}
