// Apoyo compartido para los tests: configuración y estaciones de prueba.
// No es un archivo de tests (no termina en .test.ts): solo lo importan.

import type { Station, StationConfig } from "./station.ts";
import { switchgearFor, type StationState } from "./stationState.ts";

// 600 MW/min = 10 MW/s
export const testConfig: StationConfig = {
  operatingTimeSeconds: { Q1: 2, Q2: 4, QE: 3 },
  pMinMW: 50,
  pMaxMW: 500,
  rampRateMWPerMin: 600,
  ratedVoltageKV: 500,
};

// Una estación en un estado, con los equipos en reposo.
export function stationAt(state: StationState, powerMW = 0, powerOrderMW = powerMW): Station {
  return { switchgear: switchgearFor(state), powerMW, powerOrderMW };
}
