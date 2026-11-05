import { describe, expect, test } from "vitest";
import {
  createSwitchgear,
  defaultSwitchgearConfig,
  describeMovingSwitches,
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

describe("describeMovingSwitches", () => {
  const moving = (to: "open" | "closed", remainingSeconds: number): SwitchStatus => ({
    kind: "moving",
    to,
    remainingSeconds,
  });

  test("sin maniobras en curso devuelve null", () => {
    expect(describeMovingSwitches(createSwitchgear())).toBeNull();
    expect(describeMovingSwitches({ Q1: CLOSED, Q2: CLOSED, QE: OPEN })).toBeNull();
  });

  test("un equipo cerrándose", () => {
    const switchgear: Switchgear = { Q1: CLOSED, Q2: moving("closed", 6), QE: OPEN };
    expect(describeMovingSwitches(switchgear)).toBe("Q2 en maniobra (cierre), faltan 6 s");
  });

  test("un equipo abriéndose", () => {
    const switchgear: Switchgear = { Q1: moving("open", 2), Q2: OPEN, QE: OPEN };
    expect(describeMovingSwitches(switchgear)).toBe("Q1 en maniobra (apertura), faltan 2 s");
  });

  test("con varios equipos los menciona a todos, en el orden Q1, Q2, QE", () => {
    const switchgear: Switchgear = {
      Q1: moving("open", 1),
      Q2: moving("closed", 8),
      QE: moving("closed", 3),
    };
    expect(describeMovingSwitches(switchgear)).toBe(
      "Q1 en maniobra (apertura), faltan 1 s; " +
        "Q2 en maniobra (cierre), faltan 8 s; " +
        "QE en maniobra (cierre), faltan 3 s",
    );
  });

  test("los segundos se redondean hacia arriba", () => {
    const at = (remainingSeconds: number): Switchgear => ({
      Q1: moving("closed", remainingSeconds),
      Q2: OPEN,
      QE: OPEN,
    });
    expect(describeMovingSwitches(at(5.2))).toContain("faltan 6 s");
    expect(describeMovingSwitches(at(0.2))).toContain("faltan 1 s");
  });

  test("nunca dice 0 s mientras el equipo todavía se mueve", () => {
    const switchgear: Switchgear = { Q1: moving("closed", 0.0001), Q2: OPEN, QE: OPEN };
    expect(describeMovingSwitches(switchgear)).toContain("faltan 1 s");
  });

  test("el ruido decimal del tiempo acumulado no suma un segundo de más", () => {
    // 8 - 20 × 0.1 no da exactamente 6.
    let remaining = 8;
    for (let i = 0; i < 20; i++) remaining -= 0.1;
    const switchgear: Switchgear = { Q1: CLOSED, Q2: moving("closed", remaining), QE: OPEN };
    expect(describeMovingSwitches(switchgear)).toContain("faltan 6 s");
  });
});

describe("requestSwitch: motivo de rechazo por maniobra en curso", () => {
  test("indica el equipo, el sentido y el tiempo restante", () => {
    const switchgear: Switchgear = {
      Q1: { kind: "moving", to: "closed", remainingSeconds: 1.5 },
      Q2: OPEN,
      QE: OPEN,
    };
    const result = requestSwitch(switchgear, "Q1", "open", config);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Q1 en maniobra (cierre), faltan 2 s"),
    });
  });
});

// Con dt decimal, restar dt muchas veces deja un residuo (1 - 10 × 0.1 = 1.39e-16):
// la maniobra debe terminar en el ciclo justo, no en el siguiente. Issue #46.
describe("stepSwitchgear: maniobra con dt decimal", () => {
  function cyclesToFinish(operatingSeconds: number, dtSeconds: number): number {
    let switchgear: Switchgear = {
      Q1: { kind: "moving", to: "closed", remainingSeconds: operatingSeconds },
      Q2: OPEN,
      QE: OPEN,
    };
    let cycles = 0;
    while (switchgear.Q1.kind === "moving" && cycles < 100_000) {
      switchgear = stepSwitchgear(switchgear, dtSeconds);
      cycles++;
    }
    return cycles;
  }

  test("una maniobra de 1 s con dt = 0.1 termina en el ciclo 10, no en el 11", () => {
    expect(cyclesToFinish(1, 0.1)).toBe(10);
  });

  test("y sigue en maniobra en el ciclo 9", () => {
    let switchgear: Switchgear = {
      Q1: { kind: "moving", to: "closed", remainingSeconds: 1 },
      Q2: OPEN,
      QE: OPEN,
    };
    for (let i = 0; i < 9; i++) {
      switchgear = stepSwitchgear(switchgear, 0.1);
    }
    expect(switchgear.Q1.kind).toBe("moving");
  });

  test.each([
    { name: "Q1 por defecto", seconds: defaultSwitchgearConfig.operatingTimeSeconds.Q1, dt: 0.1, cycles: 10 },
    { name: "Q2 por defecto", seconds: defaultSwitchgearConfig.operatingTimeSeconds.Q2, dt: 0.1, cycles: 80 },
    { name: "QE por defecto", seconds: defaultSwitchgearConfig.operatingTimeSeconds.QE, dt: 0.1, cycles: 60 },
    { name: "Q1 de test", seconds: config.operatingTimeSeconds.Q1, dt: 0.1, cycles: 20 },
    { name: "Q2 de test", seconds: config.operatingTimeSeconds.Q2, dt: 0.1, cycles: 40 },
    { name: "QE de test", seconds: config.operatingTimeSeconds.QE, dt: 0.1, cycles: 30 },
    { name: "1 s con dt = 0.05", seconds: 1, dt: 0.05, cycles: 20 },
    { name: "1 s con dt = 0.01", seconds: 1, dt: 0.01, cycles: 100 },
    { name: "0.3 s con dt = 0.1", seconds: 0.3, dt: 0.1, cycles: 3 },
  ])("$name: termina en el ciclo $cycles", ({ seconds, dt, cycles }) => {
    expect(cyclesToFinish(seconds, dt)).toBe(cycles);
  });

  test("con dt mayor que el tiempo restante termina en un solo ciclo", () => {
    expect(cyclesToFinish(1, 5)).toBe(1);
  });
});
