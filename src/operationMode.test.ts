// Modo de operación: automático (órdenes de estado) y manual (órdenes por equipo).
import { describe, expect, test } from "vitest";
import type { AlarmState } from "./alarms.ts";
import { detectPlantEvents } from "./events.ts";
import { runCycle, type CycleEvent, type ScheduledCommand } from "./simulationCycle.ts";
import {
  createStation,
  requestBlock,
  requestDeblock,
  requestMode,
  requestPowerOrder,
  requestSwitchOrder,
  requestTransition,
  type CommandResult,
  type Station,
} from "./station.ts";
import { deriveState } from "./stationState.ts";
import { deblockedAt, noAlarms, stationAt, testConfig } from "./testSupport.ts";

const manual = (station: Station): Station => ({ ...station, mode: "manual" });

function expectRejected(result: CommandResult, reason: string) {
  expect(result).toEqual({ ok: false, reason: expect.stringContaining(reason) });
}

describe("modo de operación: valor inicial", () => {
  test("la estación arranca en automático", () => {
    expect(createStation().mode).toBe("automatic");
  });
});

describe("requestMode: condiciones", () => {
  test("de automático a manual y de manual a automático", () => {
    const toManual = requestMode(stationAt("stopped"), "manual", testConfig);
    expect(toManual).toMatchObject({ ok: true, station: { mode: "manual" } });
    if (!toManual.ok) return;
    expect(requestMode(toManual.station, "automatic", testConfig)).toMatchObject({
      ok: true,
      station: { mode: "automatic" },
    });
  });

  test("no cambia la estación recibida", () => {
    const station = stationAt("stopped");
    requestMode(station, "manual", testConfig);
    expect(station.mode).toBe("automatic");
  });

  test("se rechaza pedir el modo en que ya está", () => {
    expectRejected(requestMode(stationAt("stopped"), "automatic", testConfig), "ya está en modo automático");
    expectRejected(requestMode(manual(stationAt("stopped")), "manual", testConfig), "ya está en modo manual");
  });

  test("se rechaza con una maniobra en curso, y el motivo dice cuál", () => {
    const station: Station = {
      ...stationAt("decoupled"),
      switchgear: {
        ...stationAt("decoupled").switchgear,
        Q2: { kind: "moving", to: "closed", remainingSeconds: 3 },
      },
    };
    expectRejected(requestMode(station, "manual", testConfig), "Q2 en maniobra (cierre), faltan 3 s");
  });

  test("se rechaza durante una rampa de potencia", () => {
    const station = { ...deblockedAt(0), powerOrderMW: 100 };
    expectRejected(requestMode(station, "manual", testConfig), "rampa");
  });

  test("se rechaza durante una rampa de tensión", () => {
    const station = { ...stationAt("coupled"), udcKV: 200 };
    expectRejected(requestMode(station, "manual", testConfig), "rampa");
  });

  test("volver a automático exige uno de los cuatro estados válidos", () => {
    for (const state of ["earthed", "stopped", "decoupled", "coupled"] as const) {
      expect(requestMode(manual(stationAt(state)), "automatic", testConfig).ok).toBe(true);
    }
  });

  test("volver a automático se rechaza en inconsistent", () => {
    const inconsistent: Station = {
      ...manual(stationAt("stopped")),
      switchgear: { Q1: { kind: "open" }, Q2: { kind: "closed" }, QE: { kind: "open" } },
    };
    expectRejected(requestMode(inconsistent, "automatic", testConfig), "inconsistentes");
  });

  test("volver a automático se rechaza en transition", () => {
    const moving: Station = {
      ...manual(stationAt("decoupled")),
      switchgear: {
        ...stationAt("decoupled").switchgear,
        Q2: { kind: "moving", to: "closed", remainingSeconds: 3 },
      },
    };
    expectRejected(requestMode(moving, "automatic", testConfig), "Q2 en maniobra (cierre), faltan 3 s");
  });

  test("se acepta pasar a manual en inconsistent: es la vía para normalizar", () => {
    const inconsistent: Station = {
      ...stationAt("stopped"),
      switchgear: { Q1: { kind: "open" }, Q2: { kind: "closed" }, QE: { kind: "open" } },
    };
    expect(deriveState(inconsistent.switchgear)).toBe("inconsistent");
    expect(requestMode(inconsistent, "manual", testConfig).ok).toBe(true);
  });
});

describe("rechazos por modo", () => {
  test("requestTransition solo en automático", () => {
    const station = manual(stationAt("stopped"));
    expectRejected(requestTransition(station, "decoupled", testConfig), "solo se aceptan en modo automático");
    expect(requestTransition(stationAt("stopped"), "decoupled", testConfig).ok).toBe(true);
  });

  test("requestSwitchOrder solo en manual", () => {
    expectRejected(
      requestSwitchOrder(stationAt("stopped"), "Q1", "closed", testConfig),
      "solo se aceptan en modo manual",
    );
    expect(requestSwitchOrder(manual(stationAt("stopped")), "Q1", "closed", testConfig).ok).toBe(true);
  });

  test("el rechazo por modo no cambia la estación", () => {
    const station = stationAt("stopped");
    const before = structuredClone(station);
    requestSwitchOrder(station, "Q1", "closed", testConfig);
    expect(station).toEqual(before);
  });

  test("en manual rige el mismo enclavamiento que en automático (misma función interna)", () => {
    // Convertidor desbloqueado: ambas órdenes dan el mismo rechazo de la estación.
    const forced: Station = { ...stationAt("stopped"), converter: "deblocked" };
    const byTransition = requestTransition(forced, "decoupled", testConfig);
    const bySwitch = requestSwitchOrder(manual(forced), "Q1", "closed", testConfig);
    expect(byTransition).toEqual(bySwitch);
    expect(byTransition.ok).toBe(false);
  });

  test("las órdenes de convertidor y de potencia valen en los dos modos", () => {
    const station = manual(stationAt("coupled"));
    const deblocked = requestDeblock(station);
    expect(deblocked).toMatchObject({ ok: true, station: { converter: "deblocked" } });
    expect(requestPowerOrder(manual(deblockedAt(0)), 100, testConfig).ok).toBe(true);
    expect(requestBlock(manual(deblockedAt(0))).ok).toBe(true);
  });
});

describe("eventos del SER por cambio de modo", () => {
  test("detectPlantEvents registra STATION.MODE con el nuevo modo", () => {
    const before = stationAt("stopped");
    const after = manual(before);
    expect(detectPlantEvents(before, after, 2)).toEqual([
      { code: "STATION.MODE", state: "manual", timeSeconds: 2 },
    ]);
    expect(detectPlantEvents(after, before, 3)).toEqual([
      { code: "STATION.MODE", state: "automatic", timeSeconds: 3 },
    ]);
  });

  test("sin cambio de modo no hay evento", () => {
    expect(detectPlantEvents(stationAt("stopped"), stationAt("stopped"), 1)).toEqual([]);
  });

  test("runCycle lo registra al ejecutar la orden de modo", () => {
    const command: ScheduledCommand = {
      atSeconds: 0,
      label: "Pasar a manual",
      run: (s) => requestMode(s, "manual", testConfig),
    };
    const result = runCycle(stationAt("stopped"), 0, [command], 0.1, testConfig, noAlarms);
    expect(result.station.mode).toBe("manual");
    expect(result.events).toContainEqual({
      kind: "signal",
      event: { code: "STATION.MODE", state: "manual", timeSeconds: 0 },
    });
  });
});

// Escenario completo: tras un disparo de Q1 (coupled con Q1 abierto) la estación queda
// inconsistent. Las órdenes de estado no valen; el operador pasa a manual, abre Q2,
// vuelve a automático y la estación queda operable otra vez.
describe("escenario de inconsistent", () => {
  const DT = 0.1; // con decimales, como en la web (issue #46)

  // Estado de la simulación para el escenario: se avanza ciclo a ciclo.
  type Sim = { station: Station; alarms: AlarmState; time: number; events: CycleEvent[] };

  // Aplica una orden en el instante actual y deja correr `seconds` segundos.
  function act(sim: Sim, run: (s: Station) => CommandResult, seconds: number): Sim {
    let { station, alarms, time } = sim;
    const events = [...sim.events];
    const command: ScheduledCommand = { atSeconds: time, label: "orden", run };
    const end = time + seconds;
    let first = true;
    while (time < end - 1e-9) {
      const result = runCycle(station, time, first ? [command] : [], DT, testConfig, alarms);
      station = result.station;
      alarms = result.alarms;
      time = result.timeSeconds;
      events.push(...result.events);
      first = false;
    }
    return { station, alarms, time, events };
  }

  const commandResults = (events: CycleEvent[]) =>
    events.flatMap((e) => (e.kind === "command" ? [e.result] : []));
  const lastResult = (sim: Sim) => commandResults(sim.events).at(-1)!;
  const signals = (sim: Sim, code: string) =>
    sim.events.flatMap((e) => (e.kind === "signal" && e.event.code === code ? [e.event.state] : []));

  test("de coupled inconsistent a stopped y otra vez operable", () => {
    let sim: Sim = { station: manual(stationAt("coupled")), alarms: noAlarms, time: 0, events: [] };

    // 1. Se abre Q1 con Q2 cerrado (en manual, por flexibilidad): queda inconsistent.
    sim = act(sim, (s) => requestSwitchOrder(s, "Q1", "open", testConfig), 3);
    expect(deriveState(sim.station.switchgear)).toBe("inconsistent");
    expect(signals(sim, "STATION.STATE")).toContain("inconsistent");
    expect(sim.alarms.life["ALARM.INCONSISTENT"]).toBe("active-unacknowledged");

    // 2. Cerrar Q1 de nuevo no es la salida: Q2 sigue cerrado.
    sim = act(sim, (s) => requestSwitchOrder(s, "Q1", "closed", testConfig), 0.1);
    expectRejected(lastResult(sim), "Q2 sin abrir");

    // 3. En manual, una orden de estado se rechaza por el modo.
    sim = act(sim, (s) => requestTransition(s, "stopped", testConfig), 0.1);
    expectRejected(lastResult(sim), "solo se aceptan en modo automático");

    // 3b. Volver a automático desde inconsistent se rechaza.
    sim = act(sim, (s) => requestMode(s, "automatic", testConfig), 0.1);
    expectRejected(lastResult(sim), "inconsistentes");
    expect(sim.station.mode).toBe("manual");

    // 4. Se abre Q2: la estación vuelve a stopped y la alarma se normaliza.
    sim = act(sim, (s) => requestSwitchOrder(s, "Q2", "open", testConfig), 5);
    expect(deriveState(sim.station.switchgear)).toBe("stopped");
    expect(sim.alarms.life["ALARM.INCONSISTENT"]).toBe("returned-unacknowledged");
    expect(signals(sim, "ALARM.INCONSISTENT")).toEqual(["active-unacknowledged", "returned-unacknowledged"]);

    // 5. En automático (ya consistente) vuelven a valer las órdenes de estado,
    //    y las de equipo se rechazan por el modo.
    sim = act(sim, (s) => requestMode(s, "automatic", testConfig), 0.1);
    expect(sim.station.mode).toBe("automatic");
    expect(signals(sim, "STATION.MODE")).toEqual(["automatic"]);
    sim = act(sim, (s) => requestSwitchOrder(s, "Q1", "closed", testConfig), 0.1);
    expectRejected(lastResult(sim), "solo se aceptan en modo manual");
    sim = act(sim, (s) => requestTransition(s, "decoupled", testConfig), 3);
    expect(lastResult(sim).ok).toBe(true);
    expect(deriveState(sim.station.switchgear)).toBe("decoupled");
  });

  test("desde automático, inconsistent no acepta órdenes de estado y se pasa a manual", () => {
    const inconsistent: Station = {
      ...stationAt("stopped"),
      switchgear: { Q1: { kind: "open" }, Q2: { kind: "closed" }, QE: { kind: "open" } },
    };
    let sim: Sim = { station: inconsistent, alarms: noAlarms, time: 0, events: [] };

    sim = act(sim, (s) => requestTransition(s, "stopped", testConfig), 0.1);
    expectRejected(lastResult(sim), "inconsistentes");

    sim = act(sim, (s) => requestMode(s, "manual", testConfig), 0.1);
    expect(sim.station.mode).toBe("manual");
    expect(signals(sim, "STATION.MODE")).toEqual(["manual"]);

    sim = act(sim, (s) => requestSwitchOrder(s, "Q2", "open", testConfig), 5);
    expect(deriveState(sim.station.switchgear)).toBe("stopped");
  });
});

