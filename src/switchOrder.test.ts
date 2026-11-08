// Enclavamientos del mando por equipo: se prueban llamando directamente a
// requestSwitchOrder. Cada test comprueba un enclavamiento, y que la estación recibida
// no cambia cuando la orden se rechaza.
import { describe, expect, test } from "vitest";
import { requestSwitchOrder, requestTransition, type Station } from "./station.ts";
import { deriveState } from "./stationState.ts";
import { stepSwitchgear, type SwitchId, type SwitchStatus, type SwitchTarget } from "./switchgear.ts";
import { deblockedAt, stationAt, testConfig } from "./testSupport.ts";

// La orden por equipo solo vale en modo manual: estos tests pasan la estación a manual
// (los de modo están en operationMode.test.ts). Se ordena sobre la estación recibida.
const manual = (station: Station): Station => ({ ...station, mode: "manual" });
const order = (station: Station, id: SwitchId, to: SwitchTarget) =>
  requestSwitchOrder(manual(station), id, to, testConfig);

// Una estación con convertidor bloqueado, P = 0 y los equipos en las posiciones dadas.
function withSwitches(q1: SwitchStatus, q2: SwitchStatus, qe: SwitchStatus): Station {
  return { ...stationAt("stopped"), switchgear: { Q1: q1, Q2: q2, QE: qe } };
}

const OPEN: SwitchStatus = { kind: "open" };
const CLOSED: SwitchStatus = { kind: "closed" };
const closing = (): SwitchStatus => ({ kind: "moving", to: "closed", remainingSeconds: 1 });
const opening = (): SwitchStatus => ({ kind: "moving", to: "open", remainingSeconds: 1 });

// Comprueba que la orden se rechaza, con un motivo que contiene el texto, y que no cambia la estación.
function expectRejected(station: Station, id: SwitchId, to: SwitchTarget, reason: string) {
  const before = structuredClone(station);
  const result = order(station, id, to);
  expect(result).toEqual({ ok: false, reason: expect.stringContaining(reason) });
  expect(station).toEqual(before);
}

describe("requestSwitchOrder: enclavamientos de la estación", () => {
  test("con el convertidor desbloqueado no maniobra ningún equipo", () => {
    // coupled desbloqueado, P = 0: ni Q1, ni Q2 ni QE.
    const station = deblockedAt(0);
    expectRejected(station, "Q1", "open", "convertidor desbloqueado");
    expectRejected(station, "Q2", "open", "convertidor desbloqueado");
    expectRejected(station, "QE", "closed", "convertidor desbloqueado");
  });

  test("el motivo nombra el equipo que se quiso maniobrar", () => {
    expectRejected(deblockedAt(0), "Q2", "open", "Q2 no puede maniobrar con el convertidor desbloqueado");
    expectRejected(deblockedAt(0), "Q1", "open", "Q1 no puede maniobrar con el convertidor desbloqueado");
  });

  test("con P distinta de 0 no maniobra ningún equipo", () => {
    // Convertidor bloqueado pero con potencia (sin rampa: P igual a la consigna).
    const station: Station = { ...stationAt("coupled"), powerMW: 100, powerOrderMW: 100 };
    expectRejected(station, "Q1", "open", "P debe ser 0");
    expectRejected(station, "Q2", "open", "P debe ser 0");
    expectRejected(station, "QE", "closed", "P debe ser 0");
  });

  test("durante una rampa de potencia no maniobra ningún equipo", () => {
    const station: Station = { ...stationAt("coupled"), powerMW: 50, powerOrderMW: 0 };
    expectRejected(station, "Q1", "open", "rampa");
    expectRejected(station, "Q2", "open", "rampa");
  });

  test("durante una rampa de tensión no maniobra ningún equipo", () => {
    // Bloqueado, pero Udc todavía baja hacia 0.
    const station: Station = { ...stationAt("coupled"), udcKV: 200 };
    expectRejected(station, "Q2", "open", "rampa");
    expectRejected(station, "Q1", "open", "rampa");
  });

  test("con el convertidor bloqueado, P = 0 y sin rampas se acepta", () => {
    expect(order(stationAt("stopped"), "Q1", "closed").ok).toBe(true);
    expect(order(stationAt("stopped"), "QE", "closed").ok).toBe(true);
    expect(order(stationAt("coupled"), "Q2", "open").ok).toBe(true);
  });

  test("una orden aceptada pone el equipo en maniobra y no modifica la estación recibida", () => {
    const station = stationAt("decoupled");
    const result = order(station, "Q2", "closed");
    expect(result).toMatchObject({
      ok: true,
      station: { switchgear: { Q2: { kind: "moving", to: "closed", remainingSeconds: 4 } } },
    });
    expect(station.switchgear.Q2).toEqual(OPEN);
  });
});

describe("requestSwitchOrder: QE (puesta a tierra)", () => {
  test("solo se cierra con Q1 y Q2 abiertos", () => {
    expect(order(withSwitches(OPEN, OPEN, OPEN), "QE", "closed").ok).toBe(true);
  });

  test("no se cierra con Q1 cerrado", () => {
    expectRejected(withSwitches(CLOSED, OPEN, OPEN), "QE", "closed", "cortocircuito");
  });

  test("no se cierra con Q2 cerrado", () => {
    expectRejected(withSwitches(OPEN, CLOSED, OPEN), "QE", "closed", "cortocircuito");
  });

  test("no se cierra mientras Q1 o Q2 se mueven (un equipo en maniobra no cuenta como abierto)", () => {
    expectRejected(withSwitches(opening(), OPEN, OPEN), "QE", "closed", "cortocircuito");
    expectRejected(withSwitches(OPEN, opening(), OPEN), "QE", "closed", "cortocircuito");
  });

  test("se puede abrir", () => {
    expect(order(withSwitches(OPEN, OPEN, CLOSED), "QE", "open").ok).toBe(true);
  });
});

describe("requestSwitchOrder: QE cerrado bloquea Q1 y Q2", () => {
  test("no se cierra Q1 con QE cerrado", () => {
    expectRejected(withSwitches(OPEN, OPEN, CLOSED), "Q1", "closed", "puesta a tierra");
  });

  test("no se cierra Q2 con QE cerrado", () => {
    expectRejected(withSwitches(CLOSED, OPEN, CLOSED), "Q2", "closed", "puesta a tierra");
  });

  test("no se cierra con QE en maniobra", () => {
    expectRejected(withSwitches(OPEN, OPEN, opening()), "Q1", "closed", "puesta a tierra");
  });
});

describe("requestSwitchOrder: Q2 solo se cierra con QE abierto y Q1 cerrado", () => {
  test("con Q1 cerrado y QE abierto se acepta", () => {
    expect(order(withSwitches(CLOSED, OPEN, OPEN), "Q2", "closed").ok).toBe(true);
  });

  test("con Q1 abierto no se cierra", () => {
    expectRejected(withSwitches(OPEN, OPEN, OPEN), "Q2", "closed", "Q1 sin cerrar");
  });

  test("con Q1 en maniobra (cerrándose) no se cierra: aún no está cerrado", () => {
    expectRejected(withSwitches(closing(), OPEN, OPEN), "Q2", "closed", "Q1 sin cerrar");
  });

  test("con Q1 en maniobra (abriéndose) no se cierra", () => {
    expectRejected(withSwitches(opening(), OPEN, OPEN), "Q2", "closed", "Q1 sin cerrar");
  });
});

describe("requestSwitchOrder: Q1 solo se cierra con Q2 y QE abiertos", () => {
  test("con Q2 y QE abiertos se acepta", () => {
    expect(order(withSwitches(OPEN, OPEN, OPEN), "Q1", "closed").ok).toBe(true);
  });

  test("con Q2 cerrado no se cierra", () => {
    // Q1 abierto y Q2 cerrado: es la situación inconsistent después de un disparo.
    expectRejected(withSwitches(OPEN, CLOSED, OPEN), "Q1", "closed", "Q2 sin abrir");
  });

  test("con Q2 en maniobra no se cierra: aún no está abierto", () => {
    expectRejected(withSwitches(OPEN, opening(), OPEN), "Q1", "closed", "Q2 sin abrir");
    expectRejected(withSwitches(OPEN, closing(), OPEN), "Q1", "closed", "Q2 sin abrir");
  });
});

describe("requestSwitchOrder: el propio equipo", () => {
  test("no maniobra un equipo ya en maniobra, y dice cuánto falta", () => {
    expectRejected(withSwitches(closing(), OPEN, OPEN), "Q1", "open", "Q1 en maniobra (cierre), faltan 1 s");
  });

  test("no ordena la posición en la que ya está", () => {
    expectRejected(withSwitches(CLOSED, OPEN, OPEN), "Q1", "closed", "Q1 ya está cerrado");
    expectRejected(withSwitches(OPEN, OPEN, OPEN), "Q2", "open", "Q2 ya está abierto");
  });
});

// Decisión: abrir no tiene más enclavamientos que los de la estación. Se permite abrir Q1
// con Q2 cerrado, por flexibilidad en emergencias, aunque lleva a inconsistent (Q1 abierto
// y Q2 cerrado no corresponde a ningún estado). La salida de inconsistent es abrir Q2.
describe("requestSwitchOrder: abrir Q1 con Q2 cerrado", () => {
  // Corre la maniobra hasta que termina y devuelve la estación resultante.
  function finish(station: Station): Station {
    return { ...station, switchgear: stepSwitchgear(station.switchgear, 10) };
  }

  test("se permite, y lleva a inconsistent", () => {
    const station = stationAt("coupled");
    const result = order(station, "Q1", "open");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(deriveState(finish(result.station).switchgear)).toBe("inconsistent");
    }
    expect(station.switchgear.Q1).toEqual(CLOSED); // la estación recibida no cambia
  });

  test("la salida de inconsistent es abrir Q2, no abrir Q1", () => {
    const inconsistent = withSwitches(OPEN, CLOSED, OPEN);
    expect(deriveState(inconsistent.switchgear)).toBe("inconsistent");

    const result = order(inconsistent, "Q2", "open");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(deriveState(finish(result.station).switchgear)).toBe("stopped");
    }
    // Y Q1 sigue sin poder cerrarse mientras Q2 esté cerrado.
    expectRejected(inconsistent, "Q1", "closed", "Q2 sin abrir");
  });
});

describe("requestTransition usa los mismos enclavamientos", () => {
  test("rechaza con el mismo motivo que la orden por equipo", () => {
    // stopped con el convertidor desbloqueado (situación forzada): ir a decoupled cierra Q1.
    const station: Station = { ...stationAt("stopped"), converter: "deblocked" };
    const byTransition = requestTransition(station, "decoupled", testConfig);
    const bySwitch = order(station, "Q1", "closed");
    expect(byTransition).toEqual(bySwitch);
    expect(byTransition.ok).toBe(false);
  });

  test("ir a coupled con Q1 cerrado y QE abierto sigue funcionando (modo automático sin cambios)", () => {
    expect(requestTransition(stationAt("decoupled"), "coupled", testConfig).ok).toBe(true);
    expect(requestTransition(stationAt("stopped"), "decoupled", testConfig).ok).toBe(true);
  });
});
