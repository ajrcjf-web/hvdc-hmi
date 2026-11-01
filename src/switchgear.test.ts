import { describe, expect, test } from "vitest";
import {
  createSwitchgear,
  requestSwitch,
  stepSwitchgear,
  type SwitchStatus,
  type Switchgear,
  type SwitchgearConfig,
} from "./switchgear.ts";

const config: SwitchgearConfig = {
  operatingTimeSeconds: { Q1: 2, Q2: 4, QE: 3 },
};

const OPEN: SwitchStatus = { kind: "open" };
const CLOSED: SwitchStatus = { kind: "closed" };

describe("requestSwitch", () => {
  test("una orden de cierre pone el equipo en maniobra", () => {
    const result = requestSwitch(createSwitchgear(), "Q1", "closed", config);
    expect(result).toEqual({
      ok: true,
      switchgear: {
        Q1: { kind: "moving", to: "closed", remainingSeconds: 2 },
        Q2: OPEN,
        QE: OPEN,
      },
    });
  });

  test("rechaza una orden a un equipo en maniobra", () => {
    const switchgear: Switchgear = {
      Q1: { kind: "moving", to: "closed", remainingSeconds: 1 },
      Q2: OPEN,
      QE: OPEN,
    };
    expect(requestSwitch(switchgear, "Q1", "open", config).ok).toBe(false);
  });

  test("rechaza cerrar un equipo que ya está cerrado", () => {
    const switchgear: Switchgear = { Q1: CLOSED, Q2: OPEN, QE: OPEN };
    expect(requestSwitch(switchgear, "Q1", "closed", config).ok).toBe(false);
  });

  test("permite cerrar QE con Q1 y Q2 abiertos", () => {
    expect(requestSwitch(createSwitchgear(), "QE", "closed", config).ok).toBe(true);
  });

  test("no permite cerrar QE con Q1 cerrado", () => {
    const switchgear: Switchgear = { Q1: CLOSED, Q2: OPEN, QE: OPEN };
    const result = requestSwitch(switchgear, "QE", "closed", config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("cortocircuito");
    }
  });

  test("no permite cerrar QE con Q2 cerrado", () => {
    const switchgear: Switchgear = { Q1: OPEN, Q2: CLOSED, QE: OPEN };
    expect(requestSwitch(switchgear, "QE", "closed", config).ok).toBe(false);
  });

  test("no permite cerrar QE mientras Q1 se está abriendo", () => {
    const switchgear: Switchgear = {
      Q1: { kind: "moving", to: "open", remainingSeconds: 1 },
      Q2: OPEN,
      QE: OPEN,
    };
    expect(requestSwitch(switchgear, "QE", "closed", config).ok).toBe(false);
  });

  test.each(["Q1", "Q2"] as const)(
    "no permite cerrar %s con la puesta a tierra cerrada",
    (id) => {
      const switchgear: Switchgear = { Q1: OPEN, Q2: OPEN, QE: CLOSED };
      expect(requestSwitch(switchgear, id, "closed", config).ok).toBe(false);
    },
  );

  test("permite abrir la puesta a tierra", () => {
    const switchgear: Switchgear = { Q1: OPEN, Q2: OPEN, QE: CLOSED };
    expect(requestSwitch(switchgear, "QE", "open", config).ok).toBe(true);
  });
});

describe("stepSwitchgear", () => {
  test("un equipo en maniobra llega a su posición después del tiempo de maniobra", () => {
    let switchgear: Switchgear = {
      Q1: { kind: "moving", to: "closed", remainingSeconds: 2 },
      Q2: OPEN,
      QE: OPEN,
    };
    switchgear = stepSwitchgear(switchgear, 1);
    expect(switchgear.Q1).toEqual({ kind: "moving", to: "closed", remainingSeconds: 1 });
    switchgear = stepSwitchgear(switchgear, 1);
    expect(switchgear.Q1).toEqual(CLOSED);
  });

  test("los equipos quietos no cambian", () => {
    const switchgear: Switchgear = { Q1: CLOSED, Q2: OPEN, QE: OPEN };
    expect(stepSwitchgear(switchgear, 1)).toEqual(switchgear);
  });
});
