import { describe, expect, test } from "vitest";
import { step } from "./simulation.ts";
import { requestTransition } from "./station.ts";
import { deriveState } from "./stationState.ts";
import { stationAt, testConfig } from "./testSupport.ts";

describe("step", () => {
  test("sube hacia la consigna a la velocidad de rampa", () => {
    expect(step(stationAt("coupled", 0, 300), 1, testConfig).powerMW).toBe(10);
  });

  test("baja hacia la consigna a la velocidad de rampa", () => {
    expect(step(stationAt("coupled", 300, 0), 1, testConfig).powerMW).toBe(290);
  });

  test("el cambio es proporcional al tiempo transcurrido", () => {
    expect(step(stationAt("coupled", 0, 300), 2, testConfig).powerMW).toBe(20);
  });

  test("no se pasa de la consigna", () => {
    expect(step(stationAt("coupled", 295, 300), 1, testConfig).powerMW).toBe(300);
  });

  test("sin rampa en curso, la potencia no cambia", () => {
    expect(step(stationAt("coupled", 300), 1, testConfig).powerMW).toBe(300);
  });

  test("alcanza la consigna después del tiempo esperado", () => {
    let station = stationAt("coupled", 0, 300);
    for (let i = 0; i < 30; i++) {
      station = step(station, 1, testConfig);
    }
    expect(station.powerMW).toBe(300);
  });

  test("no modifica la estación original", () => {
    const station = stationAt("coupled", 0, 300);
    step(station, 1, testConfig);
    expect(station.powerMW).toBe(0);
  });

  test("la estación llega al nuevo estado cuando termina la maniobra", () => {
    const result = requestTransition(stationAt("stopped"), "decoupled", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const afterOneSecond = step(result.station, 1, testConfig);
      expect(deriveState(afterOneSecond.switchgear)).toBe("transition");
      const afterTwoSeconds = step(afterOneSecond, 1, testConfig);
      expect(deriveState(afterTwoSeconds.switchgear)).toBe("decoupled");
    }
  });
});
