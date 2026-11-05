import { describe, expect, test } from "vitest";
import { deblockedAt, stationAt, testConfig } from "../testSupport.ts";
import {
  blockCommand,
  deblockCommand,
  powerOrderCommand,
  transitionCommand,
} from "./commands.ts";
import { describeCommand, formatPowerOrder, logText, remainingSeconds } from "./commandView.ts";
import type { LogEntry } from "./hmiState.ts";

describe("describeCommand", () => {
  test("transición: título, estado actual y resultado esperado", () => {
    const view = describeCommand(transitionCommand("decoupled"), stationAt("stopped"), testConfig);
    expect(view.title).toBe("Ir a decoupled");
    expect(view.current).toEqual({
      state: "stopped",
      converter: "blocked",
      powerMW: 0,
      powerOrderMW: 0,
    });
    expect(view.expected).toBe("La estación pasará de stopped a decoupled");
    expect(view.powerOrder).toBeNull();
    expect(view.check).toEqual({ ok: true });
  });

  test("desbloquear y bloquear dicen qué pasa con Udc", () => {
    expect(describeCommand(deblockCommand(), stationAt("coupled"), testConfig).expected).toContain(
      "500 kV",
    );
    expect(describeCommand(blockCommand(), deblockedAt(), testConfig).expected).toContain("0 kV");
  });

  test("consigna: muestra el valor actual y el nuevo", () => {
    const view = describeCommand(powerOrderCommand(300), deblockedAt(100), testConfig);
    expect(view.powerOrder).toEqual({ currentMW: 100, newMW: 300 });
    expect(view.expected).toContain("600 MW/min");
    expect(view.check).toEqual({ ok: true });
  });

  test("si la orden dejó de ser válida, trae el motivo de la lógica", () => {
    // Consigna con el convertidor bloqueado.
    const view = describeCommand(powerOrderCommand(300), stationAt("coupled"), testConfig);
    expect(view.check.ok).toBe(false);
    expect(view.check).toMatchObject({ reason: expect.stringContaining("Desbloquear") });
  });

  test("usa la estación que recibe (verificación en vivo)", () => {
    const command = powerOrderCommand(300);
    expect(describeCommand(command, deblockedAt(), testConfig).check.ok).toBe(true);
    expect(describeCommand(command, { ...deblockedAt(), udcKV: 0 }, testConfig).check.ok).toBe(
      false,
    );
  });
});

describe("remainingSeconds", () => {
  test("redondea hacia arriba", () => {
    expect(remainingSeconds(15, 0)).toBe(15);
    expect(remainingSeconds(15, 2.3)).toBe(13);
    expect(remainingSeconds(15, 14.9)).toBe(1);
  });

  // Issue #46: el tiempo acumulado (100 × 0.1 = 9.99999999999998) no debe sumar un segundo de más.
  test("no suma un segundo por el error de redondeo del tiempo acumulado", () => {
    let time = 0;
    for (let i = 0; i < 100; i++) {
      time += 0.1;
    }
    expect(remainingSeconds(15, time)).toBe(5);
  });

  test("nunca baja de 0", () => {
    expect(remainingSeconds(15, 15)).toBe(0);
    expect(remainingSeconds(15, 16)).toBe(0);
  });
});

describe("logText", () => {
  const entry = (kind: LogEntry["kind"], reason: string | null = null): LogEntry => ({
    id: 0,
    timeSeconds: 0,
    kind,
    label: "Ir a coupled",
    reason,
  });

  test("cada tipo lleva su símbolo", () => {
    expect(logText(entry("selected"))).toBe("→ Seleccionada: Ir a coupled");
    expect(logText(entry("execute-ordered"))).toBe("▶ Ejecutar: Ir a coupled");
    expect(logText(entry("cancelled"))).toBe("⊘ Cancelada: Ir a coupled");
    expect(logText(entry("expired"))).toBe("⏱ Expiró sin confirmar: Ir a coupled");
    expect(logText(entry("done"))).toBe("✓ Ir a coupled");
  });

  test("los rechazos incluyen el motivo", () => {
    expect(logText(entry("selection-rejected", "P debe ser 0"))).toContain(
      "no se pudo seleccionar: P debe ser 0",
    );
    expect(logText(entry("failed", "P debe ser 0"))).toContain("rechazada: P debe ser 0");
  });
});

describe("formatPowerOrder", () => {
  test("formatea la consigna", () => {
    expect(formatPowerOrder(300)).toBe("300 MW");
    expect(formatPowerOrder(Number.NaN)).toBe("no válido");
  });
});
