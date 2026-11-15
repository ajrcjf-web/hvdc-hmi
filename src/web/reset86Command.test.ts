// La orden "Resetear 86" como dato: ejecución, etiqueta, señal y vista de confirmación.
import { describe, expect, test } from "vitest";
import { detectPlantEvents } from "../events.ts";
import { noFaults } from "../protections.ts";
import type { Station } from "../station.ts";
import { stationAt, testConfig } from "../testSupport.ts";
import { describeCommand } from "./commandView.ts";
import { commandLabel, commandSignal, reset86Command, runCommand } from "./commands.ts";

const tripped = (converterFault: boolean): Station => ({
  ...stationAt("stopped"),
  relay86: { locked: true, operated: ["converterProtection"] },
  faults: { ...noFaults(), converter: converterFault },
});

describe("orden reset86", () => {
  test("runCommand la pide a la lógica de la estación", () => {
    expect(runCommand(reset86Command(), tripped(false), testConfig)).toMatchObject({
      ok: true,
      station: { relay86: { locked: false } },
    });
    expect(runCommand(reset86Command(), tripped(true), testConfig)).toMatchObject({ ok: false });
  });

  test("etiqueta y señal", () => {
    expect(commandLabel(reset86Command())).toBe("Resetear 86");
    expect(commandSignal(reset86Command())).toEqual({ code: "CMD.RESET_86" });
  });
});

describe("describeCommand: reset86", () => {
  test("muestra el estado del 86 y cada causa con su falla presente o despejada", () => {
    const view = describeCommand(reset86Command(), tripped(true), testConfig);
    expect(view.title).toBe("Resetear 86");
    expect(view.relay86).toEqual({
      locked: true,
      causes: [{ element: "converterProtection", name: "Protección del convertidor", present: true }],
    });
    expect(view.check).toEqual({
      ok: false,
      reason: expect.stringContaining("la causa sigue presente"),
    });
    expect(view.switchOrder).toBeNull();
    expect(view.modeChange).toBeNull();
  });

  test("con la falla despejada la verificación en vivo da ok", () => {
    const view = describeCommand(reset86Command(), tripped(false), testConfig);
    expect(view.relay86?.causes[0]?.present).toBe(false);
    expect(view.check).toEqual({ ok: true });
    expect(view.expected).toContain("relé 86 se liberará");
  });

  test("las demás órdenes no llevan información del 86", () => {
    // Una orden de otro tipo deja la sección vacía.
    expect(describeCommand({ kind: "block" }, tripped(false), testConfig).relay86).toBeNull();
  });
});

describe("detectPlantEvents: relé 86", () => {
  test("liberar el 86 es un evento RELAY86.LOCKOUT en normal", () => {
    const before = tripped(false);
    const after: Station = { ...before, relay86: { locked: false, operated: [] } };
    expect(detectPlantEvents(before, after, 4)).toEqual([
      { code: "RELAY86.LOCKOUT", state: "normal", timeSeconds: 4 },
    ]);
  });

  test("enclavarlo es un evento en locked, y sin cambio no hay evento", () => {
    const before = stationAt("stopped");
    const after = tripped(false);
    expect(detectPlantEvents(before, after, 1)).toEqual([
      { code: "RELAY86.LOCKOUT", state: "locked", timeSeconds: 1 },
    ]);
    expect(detectPlantEvents(after, after, 1)).toEqual([]);
  });
});
