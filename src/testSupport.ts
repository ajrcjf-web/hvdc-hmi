// Apoyo compartido para los tests: configuración y estaciones de prueba.
// No es un archivo de tests (no termina en .test.ts): solo lo importan.

import type { Station, StationConfig } from "./station.ts";
import { switchgearFor, type StationState } from "./stationState.ts";

// Rampa de potencia: 600 MW/min = 10 MW/s. Rampa de tensión: 100 kV/s.
export const testConfig: StationConfig = {
  operatingTimeSeconds: { Q1: 2, Q2: 4, QE: 3 },
  pMinMW: 50,
  pMaxMW: 500,
  rampRateMWPerMin: 600,
  ratedVoltageKV: 500,
  voltageRampKVPerS: 100,
};

// Una estación en un estado: equipos en reposo, convertidor bloqueado, sin tensión.
export function stationAt(state: StationState): Station {
  return {
    switchgear: switchgearFor(state),
    converter: "blocked",
    udcKV: 0,
    powerMW: 0,
    powerOrderMW: 0,
  };
}

// Una estación acoplada, con el convertidor desbloqueado y la tensión establecida.
export function deblockedAt(powerMW = 0, powerOrderMW = powerMW): Station {
  return {
    switchgear: switchgearFor("coupled"),
    converter: "deblocked",
    udcKV: testConfig.ratedVoltageKV,
    powerMW,
    powerOrderMW,
  };
}
