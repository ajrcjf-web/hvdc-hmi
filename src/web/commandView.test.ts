import { describe, expect, test } from "vitest";
import { deblockedAt, stationAt, testConfig } from "../testSupport.ts";
import {
  blockCommand,
  deblockCommand,
  modeCommand,
  powerOrderCommand,
  switchCommand,
  transitionCommand,
} from "./commands.ts";
import { describeCommand, enterHint, formatPowerOrder, remainingSeconds } from "./commandView.ts";

describe("describeCommand", () => {
  test("transición: título, estado actual y resultado esperado", () => {
    const view = describeCommand(transitionCommand("decoupled"), stationAt("stopped"), testConfig);
    expect(view.title).toBe("Ir a decoupled");
    expect(view.current).toEqual({
      state: "stopped",
      mode: "automatic",
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

describe("describeCommand: modo y mando por equipo", () => {
  const manual = { ...stationAt("stopped"), mode: "manual" as const };

  test("cambio de modo: de qué modo a cuál", () => {
    const view = describeCommand(modeCommand("manual"), stationAt("stopped"), testConfig);
    expect(view.title).toBe("Pasar a manual");
    expect(view.modeChange).toEqual({ from: "automatic", to: "manual" });
    expect(view.expected).toBe("La estación pasará a modo manual");
    expect(view.switchOrder).toBeNull();
    expect(view.check).toEqual({ ok: true });
  });

  test("mando por equipo: equipo, posición actual y destino", () => {
    const view = describeCommand(switchCommand("Q1", "closed"), manual, testConfig);
    expect(view.title).toBe("Cerrar Q1");
    expect(view.switchOrder).toEqual({ id: "Q1", position: "abierto", to: "closed" });
    expect(view.expected).toBe("Q1 se cerrará");
    expect(view.modeChange).toBeNull();
    expect(view.check).toEqual({ ok: true });
  });

  test("las demás órdenes no traen datos de equipo ni de modo", () => {
    const view = describeCommand(deblockCommand(), stationAt("coupled"), testConfig);
    expect(view.switchOrder).toBeNull();
    expect(view.modeChange).toBeNull();
  });

  test("el mando por equipo en automático trae el motivo del rechazo", () => {
    const view = describeCommand(switchCommand("Q1", "closed"), stationAt("stopped"), testConfig);
    expect(view.check).toMatchObject({ ok: false, reason: expect.stringContaining("modo manual") });
  });

  test("una orden de estado en manual trae el motivo del rechazo", () => {
    const view = describeCommand(transitionCommand("decoupled"), manual, testConfig);
    expect(view.check).toMatchObject({ ok: false, reason: expect.stringContaining("modo automático") });
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

describe("formatPowerOrder", () => {
  test("formatea la consigna", () => {
    expect(formatPowerOrder(300)).toBe("300 MW");
    expect(formatPowerOrder(Number.NaN)).toBe("no válido");
  });
});

describe("enterHint", () => {
  test("dice qué hace Enter según el botón con el foco", () => {
    expect(enterHint("cancel")).toBe("Con Enter: Cancelar");
    expect(enterHint("execute")).toBe("Con Enter: Ejecutar");
  });

  test("sin botón enfocado no dice nada", () => {
    expect(enterHint(null)).toBe("");
  });
});
