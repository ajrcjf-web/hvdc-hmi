import { describe, expect, test } from "vitest";
import type { Station } from "../station.ts";
import { stationAt, deblockedAt } from "../testSupport.ts";
import { describeDiagram } from "./diagram.ts";

const positions = (station: Station) => {
  const { switches } = describeDiagram(station);
  return [switches.Q1.position, switches.Q2.position, switches.QE.position];
};

describe("describeDiagram: posiciones de los equipos", () => {
  test.each([
    ["earthed", ["open", "open", "closed"]],
    ["stopped", ["open", "open", "open"]],
    ["decoupled", ["closed", "open", "open"]],
    ["coupled", ["closed", "closed", "open"]],
  ] as const)("%s", (state, expected) => {
    expect(positions(stationAt(state))).toEqual(expected);
  });

  test.each(["Q1", "Q2", "QE"] as const)("%s en maniobra muestra hacia dónde va", (id) => {
    const station = stationAt("stopped");
    station.switchgear[id] = { kind: "moving", to: "closed", remainingSeconds: 2 };
    const view = describeDiagram(station).switches[id];
    expect(view).toEqual({ position: "moving", movingTo: "closed" });
  });

  test("un equipo en reposo no tiene destino", () => {
    expect(describeDiagram(stationAt("coupled")).switches.Q1.movingTo).toBeNull();
  });
});

describe("describeDiagram: convertidor", () => {
  test("bloqueado", () => {
    expect(describeDiagram(stationAt("decoupled")).converter).toBe("blocked");
  });

  test("desbloqueado", () => {
    expect(describeDiagram(deblockedAt()).converter).toBe("deblocked");
  });
});

describe("describeDiagram: tramos con tensión", () => {
  test("en stopped solo tiene tensión la red", () => {
    expect(describeDiagram(stationAt("stopped")).segments).toEqual({
      acGrid: "live",
      acStation: "dead",
      dcStation: "dead",
      dcLine: "dead",
    });
  });

  test("en decoupled el lado AC de la estación tiene tensión, el DC no", () => {
    expect(describeDiagram(stationAt("decoupled")).segments).toEqual({
      acGrid: "live",
      acStation: "live",
      dcStation: "dead",
      dcLine: "dead",
    });
  });

  test("en coupled con Udc establecida todo tiene tensión", () => {
    const { segments } = describeDiagram(deblockedAt());
    expect(Object.values(segments)).toEqual(["live", "live", "live", "live"]);
  });

  test("en coupled bloqueado y sin Udc el lado DC no tiene tensión", () => {
    const { segments } = describeDiagram(stationAt("coupled"));
    expect(segments.dcStation).toBe("dead");
    expect(segments.dcLine).toBe("dead");
  });

  test("con Udc subiendo pero Q2 abierto, la línea DC sigue sin tensión", () => {
    const station: Station = { ...stationAt("decoupled"), udcKV: 200 };
    const { segments } = describeDiagram(station);
    expect(segments.dcStation).toBe("live");
    expect(segments.dcLine).toBe("dead");
  });

  test("Q1 en maniobra no cuenta como cerrado", () => {
    const station = stationAt("decoupled");
    station.switchgear.Q1 = { kind: "moving", to: "open", remainingSeconds: 1 };
    expect(describeDiagram(station).segments.acStation).toBe("dead");
  });
});

describe("describeDiagram: abnormal", () => {
  test("los cuatro estados no son anormales", () => {
    for (const state of ["earthed", "stopped", "decoupled", "coupled"] as const) {
      expect(describeDiagram(stationAt(state)).abnormal).toBe(false);
    }
  });

  test("una maniobra en curso (transition) no es anormal", () => {
    const station = stationAt("stopped");
    station.switchgear.Q1 = { kind: "moving", to: "closed", remainingSeconds: 1 };
    const model = describeDiagram(station);
    expect(model.state).toBe("transition");
    expect(model.abnormal).toBe(false);
  });

  test("posiciones que no corresponden a ningún estado son anormales", () => {
    const station = stationAt("stopped");
    station.switchgear.Q2 = { kind: "closed" }; // Q2 cerrado con Q1 abierto
    const model = describeDiagram(station);
    expect(model.state).toBe("inconsistent");
    expect(model.abnormal).toBe(true);
  });
});

describe("describeDiagram: lecturas y pureza", () => {
  test("P, Udc e Idc salen sin redondear", () => {
    const station = deblockedAt(300);
    expect(describeDiagram(station).readings).toEqual({
      powerMW: 300,
      udcKV: 500,
      idcKA: 0.6,
    });
  });

  test("no modifica la estación recibida", () => {
    const station = deblockedAt(300);
    const copy = structuredClone(station);
    describeDiagram(station);
    expect(station).toEqual(copy);
  });
});
