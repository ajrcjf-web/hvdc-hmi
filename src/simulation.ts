// Simulación de la planta: cómo evoluciona la estación con el tiempo.
// Funciones puras: reciben una estación y devuelven la siguiente.

import { isTimeUp } from "./simulationTime.ts";
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
      config.voltageRampKVPerS,
      dtSeconds,
    ),
    powerMW: rampTowards(
      station.powerMW,
      station.powerOrderMW,
      config.rampRateMWPerMin / 60,
      dtSeconds,
    ),
  };
}

// Acerca un valor a su objetivo con una rampa (unidades por segundo) durante dtSeconds.
// Al llegar, queda exactamente en el objetivo (sin errores de redondeo).
// Llega si el tiempo que haría falta no supera dt: se compara en tiempo, con
// isTimeUp, y no el paso con el error, porque un paso decimal (100/3 × 0.1) deja un
// residuo que la comparación exacta no tolera y haría llegar un ciclo tarde.
function rampTowards(
  value: number,
  target: number,
  ratePerSecond: number,
  dtSeconds: number,
): number {
  const error = target - value;
  if (error === 0) {
    return target;
  }
  const secondsNeeded = Math.abs(error) / ratePerSecond;
  if (isTimeUp(secondsNeeded - dtSeconds)) {
    return target;
  }
  return value + Math.sign(error) * ratePerSecond * dtSeconds;
}
