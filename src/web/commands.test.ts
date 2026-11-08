import { describe, expect, test } from "vitest";
import { deriveState } from "../stationState.ts";
import { deblockedAt, stationAt, testConfig } from "../testSupport.ts";
import {
  blockCommand,
  commandLabel,
  commandSignal,
  deblockCommand,
  modeCommand,
  powerOrderCommand,
  runCommand,
  switchCommand,
  transitionCommand,
} from "./commands.ts";

describe("runCommand", () => {
  test("una transición válida devuelve la estación con la maniobra iniciada", () => {
    const result = runCommand(transitionCommand("decoupled"), stationAt("stopped"), testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(deriveState(result.station.switchgear)).toBe("transition");
    }
  });

  test("una transición no permitida se rechaza con motivo", () => {
    const result = runCommand(transitionCommand("coupled"), stationAt("stopped"), testConfig);
    expect(result).toMatchObject({ ok: false });
  });

  test("desbloquear y bloquear", () => {
    expect(runCommand(deblockCommand(), stationAt("coupled"), testConfig).ok).toBe(true);
    expect(runCommand(blockCommand(), deblockedAt(), testConfig).ok).toBe(true);
    expect(runCommand(blockCommand(), stationAt("coupled"), testConfig).ok).toBe(false);
  });

  test("la consigna se rechaza si el convertidor está bloqueado", () => {
    const result = runCommand(powerOrderCommand(300), stationAt("coupled"), testConfig);
    expect(result).toMatchObject({ ok: false });
  });

  test("la consigna válida cambia la consigna", () => {
    const result = runCommand(powerOrderCommand(300), deblockedAt(), testConfig);
    expect(result.ok && result.station.powerOrderMW).toBe(300);
  });

  test("no modifica la estación recibida", () => {
    const station = deblockedAt();
    const copy = structuredClone(station);
    runCommand(powerOrderCommand(300), station, testConfig);
    expect(station).toEqual(copy);
  });
});

describe("commandLabel", () => {
  test("etiquetas", () => {
    expect(commandLabel(transitionCommand("coupled"))).toBe("Ir a coupled");
    expect(commandLabel(blockCommand())).toBe("Bloquear");
    expect(commandLabel(deblockCommand())).toBe("Desbloquear");
    expect(commandLabel(powerOrderCommand(300))).toBe("Consigna 300 MW");
  });

  test("una consigna que no es un número tiene etiqueta propia", () => {
    expect(commandLabel(powerOrderCommand(Number.NaN))).toBe("Consigna (valor no válido)");
  });
});

describe("cambio de modo y mando por equipo como órdenes", () => {
  test("runCommand pide el cambio de modo a la lógica", () => {
    const result = runCommand(modeCommand("manual"), stationAt("stopped"), testConfig);
    expect(result).toMatchObject({ ok: true, station: { mode: "manual" } });
    expect(runCommand(modeCommand("automatic"), stationAt("stopped"), testConfig)).toMatchObject({
      ok: false,
    });
  });

  test("runCommand pide el mando por equipo a la lógica: solo vale en manual", () => {
    const manual = { ...stationAt("stopped"), mode: "manual" as const };
    expect(runCommand(switchCommand("Q1", "closed"), manual, testConfig).ok).toBe(true);
    expect(runCommand(switchCommand("Q1", "closed"), stationAt("stopped"), testConfig)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("modo manual"),
    });
  });

  test("etiquetas", () => {
    expect(commandLabel(modeCommand("manual"))).toBe("Pasar a manual");
    expect(commandLabel(modeCommand("automatic"))).toBe("Pasar a automático");
    expect(commandLabel(switchCommand("Q2", "open"))).toBe("Abrir Q2");
    expect(commandLabel(switchCommand("QE", "closed"))).toBe("Cerrar QE");
  });

  test("señales: una por orden", () => {
    expect(commandSignal(modeCommand("manual"))).toEqual({ code: "CMD.MODE_MANUAL" });
    expect(commandSignal(modeCommand("automatic"))).toEqual({ code: "CMD.MODE_AUTOMATIC" });
    expect(commandSignal(switchCommand("Q1", "open"))).toEqual({ code: "CMD.Q1_OPEN" });
    expect(commandSignal(switchCommand("Q1", "closed"))).toEqual({ code: "CMD.Q1_CLOSE" });
    expect(commandSignal(switchCommand("Q2", "open"))).toEqual({ code: "CMD.Q2_OPEN" });
    expect(commandSignal(switchCommand("Q2", "closed"))).toEqual({ code: "CMD.Q2_CLOSE" });
    expect(commandSignal(switchCommand("QE", "open"))).toEqual({ code: "CMD.QE_OPEN" });
    expect(commandSignal(switchCommand("QE", "closed"))).toEqual({ code: "CMD.QE_CLOSE" });
  });
});
