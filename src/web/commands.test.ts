import { describe, expect, test } from "vitest";
import { deriveState } from "../stationState.ts";
import { deblockedAt, stationAt, testConfig } from "../testSupport.ts";
import {
  blockCommand,
  commandLabel,
  deblockCommand,
  powerOrderCommand,
  runCommand,
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
