// Simulación de la planta: cómo evoluciona la estación con el tiempo.
// Funciones puras: reciben una estación y devuelven la siguiente.

import { targetUdcKV, type Station, type StationConfig } from "./station.ts";
import { stepSwitchgear } from "./switchgear.ts";

// Avanza la simulación dtSeconds segundos: las maniobras de los equipos
// progresan, y la tensión y la potencia se acercan a sus objetivos con sus rampas.
export function step(
  station: Station,
  dtSeconds: number,
  config: StationConfig,
): Station {
  return {
    ...station,
    switchgear: stepSwitchgear(station.switchgear, dtSeconds),
    udcKV: rampTowards(
      station.udcKV,
      targetUdcKV(station, config),
      config.voltageRampKVPerS * dtSeconds,
    ),
    powerMW: rampTowards(
      station.powerMW,
      station.powerOrderMW,
      (config.rampRateMWPerMin / 60) * dtSeconds,
    ),
  };
}

// Acerca un valor a su objetivo sin cambiar más que maxChange.
// Al llegar, queda exactamente en el objetivo (sin errores de redondeo).
function rampTowards(value: number, target: number, maxChange: number): number {
  const error = target - value;
  if (Math.abs(error) <= maxChange) {
    return target;
  }
  return value + Math.sign(error) * maxChange;
}
