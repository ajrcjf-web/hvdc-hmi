import { describe, expect, test } from "vitest";
import { step } from "./simulation.ts";
import type { Station, StationConfig } from "./station.ts";

// 600 MW/min = 10 MW/s
const config: StationConfig = { pMinMW: 50, pMaxMW: 500, rampRateMWPerMin: 600 };

function coupled(powerMW: number, powerOrderMW = powerMW): Station {
  return { state: "coupled", powerMW, powerOrderMW };
}

describe("step", () => {
  test("sube hacia la consigna a la velocidad de rampa", () => {
    expect(step(coupled(0, 300), 1, config).powerMW).toBe(10);
  });

  test("baja hacia la consigna a la velocidad de rampa", () => {
    expect(step(coupled(300, 0), 1, config).powerMW).toBe(290);
  });

  test("el cambio es proporcional al tiempo transcurrido", () => {
    expect(step(coupled(0, 300), 2, config).powerMW).toBe(20);
  });

  test("no se pasa de la consigna", () => {
    expect(step(coupled(295, 300), 1, config).powerMW).toBe(300);
  });

  test("sin rampa en curso, la potencia no cambia", () => {
    expect(step(coupled(300), 1, config).powerMW).toBe(300);
  });

  test("alcanza la consigna después del tiempo esperado", () => {
    let station = coupled(0, 300);
    for (let i = 0; i < 30; i++) {
      station = step(station, 1, config);
    }
    expect(station.powerMW).toBe(300);
  });

  test("no modifica la estación original", () => {
    const station = coupled(0, 300);
    step(station, 1, config);
    expect(station.powerMW).toBe(0);
  });
});
