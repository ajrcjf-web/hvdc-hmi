// Reset remoto del relé 86: se rechaza con su motivo si no está enclavado o si la causa
// sigue presente; vale en los dos modos y no exige ningún estado de la estación.
import { describe, expect, test } from "vitest";
import { noFaults, type Faults, type ProtectionElement } from "./protections.ts";
import { requestRelayReset, requestTransition, type CommandResult, type Station } from "./station.ts";
import { deblockedAt, stationAt, testConfig } from "./testSupport.ts";

const locked = (
  station: Station,
  operated: ProtectionElement[],
  faults: Partial<Faults> = {},
): Station => ({
  ...station,
  relay86: { locked: true, operated },
  faults: { ...noFaults(), ...faults },
});

function expectRejected(result: CommandResult, reason: string) {
  expect(result).toEqual({ ok: false, reason: expect.stringContaining(reason) });
}

describe("requestRelayReset", () => {
  test("con el 86 sin enclavar se rechaza", () => {
    expectRejected(requestRelayReset(stationAt("stopped")), "no está enclavado");
  });

  test("con la causa presente se rechaza, y el motivo nombra la protección", () => {
    const station = locked(stationAt("stopped"), ["converterProtection"], { converter: true });
    expectRejected(requestRelayReset(station), "la causa sigue presente (Protección del convertidor)");
  });

  test("con varias causas presentes las nombra a todas", () => {
    const station = locked(stationAt("stopped"), ["transformerDifferential", "converterProtection"], {
      transformer: true,
      converter: true,
    });
    const result = requestRelayReset(station);
    expectRejected(result, "Protección diferencial del transformador (87T)");
    expectRejected(result, "Protección del convertidor");
  });

  test("si una causa se despejó y otra no, nombra solo la que sigue presente", () => {
    const station = locked(stationAt("stopped"), ["transformerDifferential", "converterProtection"], {
      converter: true,
    });
    const result = requestRelayReset(station);
    expectRejected(result, "Protección del convertidor");
    expect(result).toEqual({
      ok: false,
      reason: expect.not.stringContaining("transformador"),
    });
  });

  test("con la causa despejada, el 86 se libera y no queda ningún elemento actuado", () => {
    const station = locked(stationAt("stopped"), ["converterProtection"]);
    const result = requestRelayReset(station);
    expect(result).toMatchObject({ ok: true, station: { relay86: { locked: false, operated: [] } } });
  });

  test("no cambia nada más de la estación", () => {
    const station = locked(stationAt("stopped"), ["converterProtection"]);
    const result = requestRelayReset(station);
    if (!result.ok) throw new Error(result.reason);
    expect(result.station).toEqual({ ...station, relay86: { locked: false, operated: [] } });
  });

  test("vale en automático y en manual", () => {
    const station = locked(stationAt("stopped"), ["converterProtection"]);
    expect(requestRelayReset({ ...station, mode: "automatic" }).ok).toBe(true);
    expect(requestRelayReset({ ...station, mode: "manual" }).ok).toBe(true);
  });

  test("no exige ningún estado: se puede resetear con la estación inconsistent", () => {
    const inconsistent: Station = {
      ...stationAt("coupled"),
      switchgear: { ...stationAt("coupled").switchgear, Q1: { kind: "open" } },
    };
    expect(requestRelayReset(locked(inconsistent, ["converterProtection"])).ok).toBe(true);
  });

  test("no usa la energización: la causa cuenta aunque ya ninguna zona la vea", () => {
    // Q1 abierto: el convertidor no está energizado, pero la falla sigue ahí.
    const station = locked(deblockedAt(0), ["converterProtection"], { converter: true });
    expect(requestRelayReset(station).ok).toBe(false);
  });

  test("tras el reset, volver a cerrar Q1 ya no lo impide el 86", () => {
    const tripped = locked(stationAt("stopped"), ["converterProtection"]);
    expect(requestTransition(tripped, "decoupled", testConfig).ok).toBe(false);
    const reset = requestRelayReset(tripped);
    if (!reset.ok) throw new Error(reset.reason);
    expect(requestTransition(reset.station, "decoupled", testConfig).ok).toBe(true);
  });
});
