import { describe, expect, test } from "vitest";
import { step } from "./simulation.ts";
import { requestDeblock, requestTransition, type Station } from "./station.ts";
import { deriveState } from "./stationState.ts";
import { deblockedAt, stationAt, testConfig } from "./testSupport.ts";


describe("step: potencia", () => {
  test("sube hacia la consigna a la velocidad de rampa", () => {
    expect(step(deblockedAt(0, 300), 1, testConfig).powerMW).toBe(10);
  });

  test("baja hacia la consigna a la velocidad de rampa", () => {
    expect(step(deblockedAt(300, 0), 1, testConfig).powerMW).toBe(290);
  });

  test("el cambio es proporcional al tiempo transcurrido", () => {
    expect(step(deblockedAt(0, 300), 2, testConfig).powerMW).toBe(20);
  });

  test("no se pasa de la consigna", () => {
    expect(step(deblockedAt(295, 300), 1, testConfig).powerMW).toBe(300);
  });

  test("alcanza la consigna después del tiempo esperado", () => {
    let station = deblockedAt(0, 300);
    for (let i = 0; i < 30; i++) {
      station = step(station, 1, testConfig);
    }
    expect(station.powerMW).toBe(300);
  });

  test("no modifica la estación original", () => {
    const station = deblockedAt(0, 300);
    step(station, 1, testConfig);
    expect(station.powerMW).toBe(0);
  });
});

describe("step: tensión", () => {
  test("al desbloquear, Udc sube a la velocidad de rampa", () => {
    const result = requestDeblock(stationAt("coupled"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(step(result.station, 1, testConfig).udcKV).toBe(100);
    }
  });

  test("Udc llega a la tensión nominal y se queda ahí", () => {
    let station: Station = { ...stationAt("coupled"), converter: "deblocked" };
    for (let i = 0; i < 10; i++) {
      station = step(station, 1, testConfig);
    }
    expect(station.udcKV).toBe(500);
  });

  test("con el convertidor bloqueado, Udc baja hacia 0", () => {
    const station = { ...stationAt("coupled"), udcKV: 500 };
    expect(step(station, 1, testConfig).udcKV).toBe(400);
  });
});

describe("step: equipos", () => {
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
