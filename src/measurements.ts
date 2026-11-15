// Valores medidos de la estación.
// Udc tiene dinámica y se guarda en la estación; Idc se calcula en cada instante. La tensión
// AC en TP1 también se calcula: depende de las fallas presentes.

import type { ProtectionConfig } from "./protections.ts";
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

// La tensión AC en TP1 (barra AC, lado red de Q1), en porcentaje de Un. Sin fallas es 100 %.
// Una falla de subtensión la deja en la tensión residual que eligió el instructor; una falla en
// la línea AC, en una residual fija de la configuración (0 %: falla franca). Si hay las dos, la
// menor. La falla no cambia la planta (P, Udc): solo esta medida.
export function measureAcVoltagePercent(
  station: Station,
  config: Pick<ProtectionConfig, "acLineFaultResidualVoltagePercent">,
): number {
  let percent = 100;
  if (station.faults.acUndervoltage !== null) {
    percent = Math.min(percent, station.faults.acUndervoltage.residualPercent);
  }
  if (station.faults.acLine !== null) {
    percent = Math.min(percent, config.acLineFaultResidualVoltagePercent);
  }
  return percent;
}
