// La alarma de inconsistencia durante una maniobra (issue #58).
// Regla: para evaluar la condición, un equipo en maniobra cuenta como si siguiera en su
// posición de origen. Así la alarma no se normaliza al empezar la maniobra que la resuelve
// ni aparece antes de que la estación llegue de verdad a la situación inconsistente.
import { describe, expect, test } from "vitest";
import type { AlarmLifeState, AlarmState } from "./alarms.ts";
import { runCycle } from "./simulationCycle.ts";
import { requestSwitchOrder, type Station } from "./station.ts";
import { deriveState } from "./stationState.ts";
import { atOrigin, type SwitchId, type SwitchStatus, type SwitchTarget } from "./switchgear.ts";
import { noAlarms, stationAt, testConfig } from "./testSupport.ts";

const DT = 0.1; // con decimales, como en la web (issue #46)

type Sample = { timeSeconds: number; state: string; life: AlarmLifeState };

// Ordena una maniobra en el instante 0 y corre ciclos durante `seconds`, anotando en cada
// uno el estado de la estación y el ciclo de vida de la alarma.
function runWithOrder(
  start: Station,
  alarms: AlarmState,
  id: SwitchId,
  to: SwitchTarget,
  seconds: number,
): Sample[] {
  const command = {
    atSeconds: 0,
    label: `${id} ${to}`,
    run: (s: Station) => requestSwitchOrder(s, id, to, testConfig),
  };
  const samples: Sample[] = [];
  let station = start;
  let current = alarms;
  let time = 0;
  while (time < seconds - 1e-9) {
    const result = runCycle(station, time, time === 0 ? [command] : [], DT, testConfig, current);
    station = result.station;
    current = result.alarms;
    time = result.timeSeconds;
    samples.push({
      timeSeconds: time,
      state: deriveState(station.switchgear),
      life: current.life["ALARM.INCONSISTENT"],
    });
  }
  return samples;
}

const manual = (station: Station): Station => ({ ...station, mode: "manual" });
const inconsistentStation = (): Station => ({
  ...manual(stationAt("stopped")),
  switchgear: { Q1: { kind: "open" }, Q2: { kind: "closed" }, QE: { kind: "open" } },
});

describe("alarma de inconsistencia: salir de la inconsistencia (abrir Q2)", () => {
  // La alarma ya está activa: un ciclo previo la activó.
  const active = runCycle(inconsistentStation(), 0, [], DT, testConfig, noAlarms).alarms;

  test("la alarma parte activa sin reconocer", () => {
    expect(active.life["ALARM.INCONSISTENT"]).toBe("active-unacknowledged");
  });

  test("sigue activa durante toda la maniobra de Q2 y se normaliza al llegar a stopped", () => {
    // Q2 tarda 4 s en testConfig: con 6 s sobra para llegar.
    const samples = runWithOrder(inconsistentStation(), active, "Q2", "open", 6);

    const moving = samples.filter((sample) => sample.state === "transition");
    expect(moving.length).toBeGreaterThan(30); // la maniobra dura unos 4 s = ~40 ciclos
    for (const sample of moving) {
      expect(sample.life).toBe("active-unacknowledged"); // aún no llegó a un estado válido
    }

    const arrived = samples.filter((sample) => sample.state === "stopped");
    expect(arrived.length).toBeGreaterThan(0);
    for (const sample of arrived) {
      expect(sample.life).toBe("returned-unacknowledged");
    }

    // Y la normalización ocurre exactamente en el ciclo en que llega a stopped.
    const firstArrived = arrived[0]!;
    const before = samples[samples.indexOf(firstArrived) - 1]!;
    expect(before.life).toBe("active-unacknowledged");
  });
});

describe("alarma de inconsistencia: eventos del SER", () => {
  test("la alarma se normaliza en el mismo ciclo en que Q2 llega a abierto", () => {
    const command = {
      atSeconds: 1,
      label: "abrir Q2",
      run: (s: Station) => requestSwitchOrder(s, "Q2", "open", testConfig),
    };
    let station = inconsistentStation();
    let alarms = noAlarms;
    let time = 0;
    const events: { code: string; state: string; timeSeconds: number }[] = [];
    while (time < 7 - 1e-9) {
      const result = runCycle(station, time, [command], DT, testConfig, alarms);
      for (const event of result.events) {
        if (event.kind === "signal") events.push(event.event);
      }
      station = result.station;
      alarms = result.alarms;
      time = result.timeSeconds;
    }

    const q2Open = events.find((e) => e.code === "Q2.POS" && e.state === "open");
    const normalized = events.find(
      (e) => e.code === "ALARM.INCONSISTENT" && e.state === "returned-unacknowledged",
    );
    expect(q2Open).toBeDefined();
    expect(normalized).toBeDefined();
    expect(normalized!.timeSeconds).toBe(q2Open!.timeSeconds);
    // Y ocurre después de que Q2 empezó a moverse, no al empezar.
    const q2Moving = events.find((e) => e.code === "Q2.POS" && e.state === "moving")!;
    expect(normalized!.timeSeconds).toBeGreaterThan(q2Moving.timeSeconds + 3);
  });
});

describe("atOrigin", () => {
  test("un equipo en maniobra cuenta en su posición de origen", () => {
    const closing: SwitchStatus = { kind: "moving", to: "closed", remainingSeconds: 1 };
    const opening: SwitchStatus = { kind: "moving", to: "open", remainingSeconds: 1 };
    expect(atOrigin({ Q1: closing, Q2: opening, QE: { kind: "open" } })).toEqual({
      Q1: { kind: "open" },
      Q2: { kind: "closed" },
      QE: { kind: "open" },
    });
  });
});

describe("alarma de inconsistencia: entrar en la inconsistencia (abrir Q1 con Q2 cerrado)", () => {
  test("no se activa durante la maniobra de Q1 y aparece cuando Q1 llega a abierto", () => {
    // coupled en manual; Q1 tarda 2 s en testConfig.
    const samples = runWithOrder(manual(stationAt("coupled")), noAlarms, "Q1", "open", 4);

    const moving = samples.filter((sample) => sample.state === "transition");
    expect(moving.length).toBeGreaterThan(15); // ~20 ciclos
    for (const sample of moving) {
      expect(sample.life).toBe("normal"); // Q1 cuenta como cerrado: sigue siendo coupled
    }

    const arrived = samples.filter((sample) => sample.state === "inconsistent");
    expect(arrived.length).toBeGreaterThan(0);
    for (const sample of arrived) {
      expect(sample.life).toBe("active-unacknowledged");
    }

    // La alarma aparece en el mismo ciclo en que Q1 llega a abierto, no antes.
    const firstArrived = arrived[0]!;
    const before = samples[samples.indexOf(firstArrived) - 1]!;
    expect(before.life).toBe("normal");
  });
});
