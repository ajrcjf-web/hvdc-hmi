import { describe, expect, test } from "vitest";
import {
  requestBlock,
  requestDeblock,
  requestPowerOrder,
  requestTransition,
} from "./station.ts";
import { deriveState } from "./stationState.ts";
import { deblockedAt, stationAt, testConfig } from "./testSupport.ts";

describe("requestTransition", () => {
  test("ir a decoupled ordena cerrar Q1", () => {
    const result = requestTransition(stationAt("stopped"), "decoupled", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.switchgear.Q1).toEqual({
        kind: "moving",
        to: "closed",
        remainingSeconds: 2,
      });
      expect(deriveState(result.station.switchgear)).toBe("transition");
    }
  });

  test("ir a earthed ordena cerrar la puesta a tierra", () => {
    const result = requestTransition(stationAt("stopped"), "earthed", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.switchgear.QE).toEqual({
        kind: "moving",
        to: "closed",
        remainingSeconds: 3,
      });
    }
  });

  test("no modifica la estación original", () => {
    const station = stationAt("stopped");
    requestTransition(station, "decoupled", testConfig);
    expect(deriveState(station.switchgear)).toBe("stopped");
  });

  test("una transición no permitida se rechaza con motivo", () => {
    const result = requestTransition(stationAt("stopped"), "coupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("stopped → coupled");
    }
  });

  test("no acepta órdenes de estado durante una transición", () => {
    const first = requestTransition(stationAt("stopped"), "decoupled", testConfig);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(requestTransition(first.station, "stopped", testConfig).ok).toBe(false);
    }
  });

  test("desacoplar con el convertidor bloqueado y sin tensión ordena abrir Q2", () => {
    const result = requestTransition(stationAt("coupled"), "decoupled", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.switchgear.Q2).toEqual({
        kind: "moving",
        to: "open",
        remainingSeconds: 4,
      });
    }
  });

  test("no se puede desacoplar con el convertidor desbloqueado", () => {
    const result = requestTransition(deblockedAt(), "decoupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("bloquear primero");
    }
  });

  test("Q2 no puede maniobrar con corriente (defensa en profundidad)", () => {
    const station = { ...stationAt("coupled"), powerMW: 300, powerOrderMW: 300 };
    const result = requestTransition(station, "decoupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("P debe ser 0");
    }
  });

  test("no se puede cambiar de estado durante una rampa de potencia", () => {
    const result = requestTransition(deblockedAt(100, 300), "decoupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("rampa");
    }
  });

  test("no se puede cambiar de estado mientras la tensión baja", () => {
    const station = { ...stationAt("coupled"), udcKV: 300 };
    const result = requestTransition(station, "decoupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("rampa");
    }
  });
});

describe("requestDeblock y requestBlock", () => {
  test("se puede desbloquear en coupled", () => {
    const result = requestDeblock(stationAt("coupled"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.converter).toBe("deblocked");
    }
  });

  test("no se puede desbloquear fuera de coupled", () => {
    expect(requestDeblock(stationAt("decoupled")).ok).toBe(false);
  });

  test("no se puede desbloquear un convertidor desbloqueado", () => {
    expect(requestDeblock(deblockedAt()).ok).toBe(false);
  });

  test("se puede bloquear con P y consigna en 0", () => {
    const result = requestBlock(deblockedAt());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.converter).toBe("blocked");
    }
  });

  test("no se puede bloquear con potencia", () => {
    expect(requestBlock(deblockedAt(300)).ok).toBe(false);
  });

  test("no se puede bloquear con una consigna pendiente", () => {
    expect(requestBlock(deblockedAt(0, 300)).ok).toBe(false);
  });
});

describe("requestPowerOrder", () => {
  test("solo se acepta consigna en coupled", () => {
    expect(requestPowerOrder(stationAt("decoupled"), 300, testConfig).ok).toBe(false);
  });

  test("con el convertidor bloqueado se rechaza", () => {
    const result = requestPowerOrder(stationAt("coupled"), 300, testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Desbloquear");
    }
  });

  test("mientras Udc sube se rechaza", () => {
    const station = { ...deblockedAt(), udcKV: 200 };
    const result = requestPowerOrder(station, 300, testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Udc");
    }
  });

  test.each([0, 50, 250, 500])("acepta una consigna de %s MW", (orderMW) => {
    const result = requestPowerOrder(deblockedAt(), orderMW, testConfig);
    expect(result).toEqual({ ok: true, station: deblockedAt(0, orderMW) });
  });

  test.each([10, 49, 501, -100, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza una consigna de %s MW",
    (orderMW) => {
      expect(requestPowerOrder(deblockedAt(), orderMW, testConfig).ok).toBe(false);
    },
  );
});
