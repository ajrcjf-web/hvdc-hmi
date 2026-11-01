// Simulación de la planta: cómo evoluciona la estación con el tiempo.
// Funciones puras: reciben una estación y devuelven la siguiente.

import type { Station, StationConfig } from "./station.ts";
import { stepSwitchgear } from "./switchgear.ts";

// Avanza la simulación dtSeconds segundos: las maniobras de los equipos
// progresan, y la potencia se acerca a la consigna según la rampa.
export function step(
  station: Station,
  dtSeconds: number,
  config: StationConfig,
): Station {
  return {
    ...station,
    switchgear: stepSwitchgear(station.switchgear, dtSeconds),
    powerMW: nextPowerMW(station, dtSeconds, config),
  };
}

function nextPowerMW(station: Station, dtSeconds: number, config: StationConfig): number {
  const maxChangeMW = (config.rampRateMWPerMin / 60) * dtSeconds;
  const errorMW = station.powerOrderMW - station.powerMW;

  if (Math.abs(errorMW) <= maxChangeMW) {
    return station.powerOrderMW;
  }
  return station.powerMW + Math.sign(errorMW) * maxChangeMW;
}
