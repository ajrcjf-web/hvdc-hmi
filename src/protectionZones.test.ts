import { describe, expect, test } from "vitest";
import { isZoneEnergized } from "./protectionZones.ts";
import type { Station } from "./station.ts";
import { deblockedAt, stationAt } from "./testSupport.ts";

describe("isZoneEnergized", () => {
  test("la línea AC está siempre energizada: la red es la fuente", () => {
    for (const state of ["earthed", "stopped", "decoupled", "coupled"] as const) {
      expect(isZoneEnergized("acLine", stationAt(state))).toBe(true);
    }
  });

  test("el transformador y el convertidor se energizan con Q1 cerrado", () => {
    for (const zone of ["transformer", "converter"] as const) {
      expect(isZoneEnergized(zone, stationAt("stopped"))).toBe(false);
      expect(isZoneEnergized(zone, stationAt("decoupled"))).toBe(true);
      expect(isZoneEnergized(zone, stationAt("coupled"))).toBe(true);
    }
  });

  test("un Q1 que se está cerrando todavía no energiza: cuenta en su posición de origen", () => {
    const closing: Station = {
      ...stationAt("stopped"),
      switchgear: {
        ...stationAt("stopped").switchgear,
        Q1: { kind: "moving", to: "closed", remainingSeconds: 1 },
      },
    };
    expect(isZoneEnergized("transformer", closing)).toBe(false);
  });

  test("un Q1 que se está abriendo sigue energizando hasta que termina de abrir", () => {
    const opening: Station = {
      ...stationAt("decoupled"),
      switchgear: {
        ...stationAt("decoupled").switchgear,
        Q1: { kind: "moving", to: "open", remainingSeconds: 0.03 },
      },
    };
    expect(isZoneEnergized("converter", opening)).toBe(true);
  });

  test("la línea DC se energiza con Q2 cerrado y Udc > 0", () => {
    expect(isZoneEnergized("dcLine", deblockedAt(0))).toBe(true);
    expect(isZoneEnergized("dcLine", { ...deblockedAt(0), udcKV: 0 })).toBe(false);
    expect(isZoneEnergized("dcLine", stationAt("coupled"))).toBe(false); // coupled sin tensión
    expect(isZoneEnergized("dcLine", { ...stationAt("decoupled"), udcKV: 500 })).toBe(false);
  });
});
