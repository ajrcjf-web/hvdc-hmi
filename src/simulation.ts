// Simulación de la planta: cómo evoluciona la estación con el tiempo.
// Funciones puras: reciben una estación y devuelven la siguiente.

import type { Station, StationConfig } from "./station.ts";

// Avanza la simulación dtSeconds segundos: la potencia medida se acerca
// a la consigna sin superar la velocidad de rampa.
export function step(
  station: Station,
  dtSeconds: number,
  config: StationConfig,
): Station {
  const maxChangeMW = (config.rampRateMWPerMin / 60) * dtSeconds;
  const errorMW = station.powerOrderMW - station.powerMW;

  if (Math.abs(errorMW) <= maxChangeMW) {
    return { ...station, powerMW: station.powerOrderMW };
  }

  return {
    ...station,
    powerMW: station.powerMW + Math.sign(errorMW) * maxChangeMW,
  };
}
