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

// Con una rampa cuyo paso por ciclo no es exacto (100/3 por 0.1), la suma acumulada
// queda a un residuo del objetivo: debe llegar en el ciclo justo. Issue #46.
describe("step: rampa con paso decimal", () => {
  const dt = 0.1;

  function cyclesUntil(station: Station, config: typeof testConfig, reached: (s: Station) => boolean): number {
    let current = station;
    let cycles = 0;
    while (!reached(current) && cycles < 100_000) {
      current = step(current, dt, config);
      cycles++;
    }
    return cycles;
  }

  test("Udc a 100/3 kV/s llega a 500 kV en 150 ciclos (15 s), no en 151", () => {
    const config = { ...testConfig, voltageRampKVPerS: 100 / 3 };
    const start: Station = { ...deblockedAt(0), udcKV: 0 };
    expect(cyclesUntil(start, config, (s) => s.udcKV === 500)).toBe(150);
  });

  test("Udc a 100/3 kV/s todavía no llegó en el ciclo 149", () => {
    const config = { ...testConfig, voltageRampKVPerS: 100 / 3 };
    let station: Station = { ...deblockedAt(0), udcKV: 0 };
    for (let i = 0; i < 149; i++) {
      station = step(station, dt, config);
    }
    expect(station.udcKV).toBeLessThan(500);
  });

  test("P a 2000 MW/min (100/3 MW/s) llega a 450 MW en 135 ciclos, no en 136", () => {
    const config = { ...testConfig, rampRateMWPerMin: 2000 };
    expect(cyclesUntil(deblockedAt(0, 450), config, (s) => s.powerMW === 450)).toBe(135);
  });

  test("con la rampa por defecto de los tests sigue llegando en el ciclo justo", () => {
    expect(cyclesUntil(deblockedAt(0, 300), testConfig, (s) => s.powerMW === 300)).toBe(300);
  });
});
