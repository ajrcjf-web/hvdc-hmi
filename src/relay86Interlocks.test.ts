// El relé 86 enclavado: impide cerrar Q1 y desbloquear el convertidor, y el operador
// sigue sin poder abrir Q1 con carga (solo la protección lo hace).
import { describe, expect, test } from "vitest";
import {
  requestDeblock,
  requestSwitchOrder,
  requestTransition,
  type CommandResult,
  type Station,
} from "./station.ts";
import { deblockedAt, stationAt, testConfig } from "./testSupport.ts";

const locked = (station: Station): Station => ({
  ...station,
  relay86: { locked: true, operated: ["transformerDifferential"] },
});
const manual = (station: Station): Station => ({ ...station, mode: "manual" });

function expectRejected(result: CommandResult, reason: string) {
  expect(result).toEqual({ ok: false, reason: expect.stringContaining(reason) });
}

describe("el 86 enclavado impide cerrar Q1", () => {
  test("con la orden de estado (automático)", () => {
    expectRejected(
      requestTransition(locked(stationAt("stopped")), "decoupled", testConfig),
      "relé 86 enclavado",
    );
  });

  test("con la orden por equipo (manual)", () => {
    expectRejected(
      requestSwitchOrder(manual(locked(stationAt("stopped"))), "Q1", "closed", testConfig),
      "relé 86 enclavado",
    );
  });

  test("sin el 86 enclavado, la misma orden se acepta", () => {
    expect(requestTransition(stationAt("stopped"), "decoupled", testConfig).ok).toBe(true);
  });

  test("tras el reset (86 liberado) vuelve a aceptarse", () => {
    const released = { ...locked(stationAt("stopped")), relay86: { locked: false, operated: [] } };
    expect(requestTransition(released, "decoupled", testConfig).ok).toBe(true);
  });

  test("abrir no se enclava: se puede abrir Q1 aunque el 86 esté enclavado", () => {
    const station = manual(locked(stationAt("decoupled")));
    expect(requestSwitchOrder(station, "Q1", "open", testConfig).ok).toBe(true);
  });

  test("el 86 solo enclava Q1: Q2 y QE siguen sus propias reglas", () => {
    const station = manual(locked(stationAt("earthed")));
    expect(requestSwitchOrder(station, "QE", "open", testConfig).ok).toBe(true);
  });
});

describe("el 86 enclavado impide desbloquear el convertidor", () => {
  test("se rechaza con su motivo", () => {
    const station = locked({ ...stationAt("coupled") });
    expectRejected(requestDeblock(station), "relé 86 enclavado");
  });

  test("sin el 86 enclavado, en coupled se acepta", () => {
    expect(requestDeblock(stationAt("coupled")).ok).toBe(true);
  });
});

describe("el operador no abre Q1 con carga (solo la protección lo hace)", () => {
  test("con el convertidor desbloqueado, abrir Q1 se rechaza", () => {
    expectRejected(
      requestSwitchOrder(manual(deblockedAt(300)), "Q1", "open", testConfig),
      "convertidor desbloqueado",
    );
  });
});
