import { describe, expect, test } from "vitest";
import { faultKinds, noFaults, type FaultKind, type Faults } from "../protections.ts";
import type { Station } from "../station.ts";
import { deblockedAt, stationAt, testConfig } from "../testSupport.ts";
import { faultFromInput, summarizeStation, toFaultRows, type FaultRow } from "./faultView.ts";

const withFaults = (station: Station, faults: Partial<Faults>): Station => ({
  ...station,
  faults: { ...noFaults(), ...faults },
});
const withFault = (station: Station, kind: "transformer" | "converter"): Station =>
  withFaults(station, { [kind]: true });

const rowOf = (station: Station, kind: FaultKind): FaultRow =>
  toFaultRows(station, testConfig).find((row) => row.kind === kind)!;

describe("toFaultRows", () => {
  test("hay una fila por falla, de la red hacia la línea DC", () => {
    expect(toFaultRows(stationAt("stopped"), testConfig).map((r) => r.kind)).toEqual(faultKinds);
    expect(faultKinds).toEqual(["acLine", "acUndervoltage", "transformer", "converter"]);
    expect(toFaultRows(stationAt("stopped"), testConfig).map((r) => r.name)).toEqual([
      "Falla en la línea AC",
      "Subtensión en la red AC",
      "Falla interna del transformador",
      "Falla interna del convertidor",
    ]);
  });

  test("sin fallas todas están despejadas y sin nota", () => {
    for (const row of toFaultRows(stationAt("coupled"), testConfig)) {
      expect(row).toMatchObject({ present: false, stateLabel: "Falla despejada", note: "" });
    }
  });

  test("solo las fallas de la red llevan un dato, con su rango y qué protecciones lo ven", () => {
    const rows = toFaultRows(stationAt("stopped"), testConfig);
    expect(rows.map((r) => r.parameter !== null)).toEqual([true, true, false, false]);
    expect(rows[0]!.parameter).toMatchObject({ min: 0, max: 150, defaultText: "50" });
    expect(rows[0]!.parameter!.hint).toContain("hasta el 80 % (zona 1)");
    expect(rows[0]!.parameter!.hint).toContain("hasta el 120 % (zona 2)");
    expect(rows[1]!.parameter).toMatchObject({ min: 0, max: 100 });
    expect(rows[1]!.parameter!.hint).toContain("escalón 1 por debajo de 80 %");
    expect(rows[1]!.parameter!.hint).toContain("escalón 2 por debajo de 70 %");
  });

  test("una falla presente en una zona energizada dice qué protección la ve", () => {
    const row = rowOf(withFault(deblockedAt(0), "transformer"), "transformer");
    expect(row).toMatchObject({
      present: true,
      stateLabel: "Falla presente",
      note: "La ve: Protección diferencial del transformador (87T)",
    });
    expect(rowOf(withFault(deblockedAt(0), "transformer"), "converter")).toMatchObject({
      present: false,
      note: "",
    });
  });

  test("una falla en una zona sin energizar avisa que nadie la ve y que actuará al energizarse", () => {
    const note = rowOf(withFault(stationAt("stopped"), "converter"), "converter").note;
    expect(note).toContain("sin energizar");
    expect(note).toContain("ninguna protección la ve");
    expect(note).toContain("Protección del convertidor actuará cuando se energice");
  });
});

describe("toFaultRows: fallas de la red", () => {
  test("línea AC con la estación aportando (Q1 cerrado y convertidor desbloqueado): la ven la 21 y la 27", () => {
    const station = withFaults(deblockedAt(0), { acLine: { locationPercent: 50 } });
    const note = rowOf(station, "acLine").note;
    expect(note).toContain("Ubicación: 50 % de la línea");
    expect(note).toContain("La ve: Protección de distancia (21), zona 1; Protección de distancia (21), zona 2;");
    expect(note).toContain("Protección de subtensión AC (27), escalón 2");
  });

  test("línea AC al 100 %: la zona 1 no la alcanza", () => {
    const station = withFaults(deblockedAt(0), { acLine: { locationPercent: 100 } });
    const note = rowOf(station, "acLine").note;
    expect(note).not.toContain("zona 1");
    expect(note).toContain("zona 2");
  });

  test("línea AC al 130 %: solo la ve la 27", () => {
    const station = withFaults(deblockedAt(0), { acLine: { locationPercent: 130 } });
    const note = rowOf(station, "acLine").note;
    expect(note).not.toContain("distancia");
    expect(note).toContain("subtensión AC (27)");
  });

  test("línea AC con Q1 abierto: la 21 no tiene corriente por CT1, la 27 sí la ve", () => {
    const station = withFaults(stationAt("stopped"), { acLine: { locationPercent: 50 } });
    const note = rowOf(station, "acLine").note;
    expect(note).toContain("La ve: Protección de subtensión AC (27)");
    expect(note).toContain("Sin corriente por CT1 (la 21 necesita Q1 cerrado y el convertidor desbloqueado)");
    expect(note).toContain("zona 1");
  });

  test("tras el disparo dice cuáles ya actuaron", () => {
    const station: Station = {
      ...withFaults(stationAt("stopped"), { acLine: { locationPercent: 50 } }),
      relay86: { locked: true, operated: ["distanceZone1", "acUndervoltageStage2"] },
    };
    expect(rowOf(station, "acLine").note).toContain(
      "Ya actuó: Protección de distancia (21), zona 1; Protección de subtensión AC (27), escalón 2",
    );
  });

  test("subtensión: el escalón 1 la ve por debajo del 80 % y el 2, por debajo del 70 %", () => {
    const at = (residualPercent: number) =>
      rowOf(withFaults(stationAt("stopped"), { acUndervoltage: { residualPercent } }), "acUndervoltage").note;
    expect(at(75)).toContain("escalón 1");
    expect(at(75)).not.toContain("escalón 2");
    expect(at(65)).toContain("escalón 1");
    expect(at(65)).toContain("escalón 2");
    expect(at(80)).toContain("fuera de su alcance"); // no por debajo del arranque
    expect(at(65)).toContain("Tensión residual: 65 % de Un");
  });
});

describe("toFaultRows: después del disparo", () => {
  // Disparo desde coupled: Q1 abierto (la zona quedó sin energizar) y el 86 enclavado.
  const tripped = (): Station => ({
    ...withFault(stationAt("coupled"), "converter"),
    switchgear: { ...stationAt("coupled").switchgear, Q1: { kind: "open" } },
    relay86: { locked: true, operated: ["converterProtection"] },
  });

  test("si el elemento ya actuó, la nota lo dice y no habla en futuro", () => {
    const note = rowOf(tripped(), "converter").note;
    expect(note).toBe(
      "Protección del convertidor ya actuó y la zona del convertidor (CT2–CT3) quedó sin energizar",
    );
    expect(note).not.toContain("actuará");
  });

  test("la nota de una falla que no actuó sigue igual", () => {
    // El transformador no actuó: su zona también está sin energizar, y actuará al energizarse.
    const station: Station = { ...tripped(), faults: { ...noFaults(), transformer: true, converter: true } };
    expect(rowOf(station, "transformer").note).toContain("actuará cuando se energice");
  });

  test("si ya actuó y la zona sigue energizada, solo dice que ya actuó", () => {
    const station: Station = { ...tripped(), switchgear: stationAt("coupled").switchgear };
    expect(rowOf(station, "converter").note).toBe("Protección del convertidor ya actuó");
  });

  test("despejada la falla no hay nota, aunque el 86 siga enclavado", () => {
    const station: Station = { ...tripped(), faults: noFaults() };
    expect(rowOf(station, "converter").note).toBe("");
  });
});

describe("faultFromInput", () => {
  test("las fallas sin dato siempre valen", () => {
    expect(faultFromInput("transformer", "")).toEqual({ kind: "transformer" });
    expect(faultFromInput("converter", "lo que sea")).toEqual({ kind: "converter" });
  });

  test("la ubicación vale de 0 a 150 %", () => {
    expect(faultFromInput("acLine", "50")).toEqual({ kind: "acLine", locationPercent: 50 });
    expect(faultFromInput("acLine", "0")).toEqual({ kind: "acLine", locationPercent: 0 });
    expect(faultFromInput("acLine", "150")).toEqual({ kind: "acLine", locationPercent: 150 });
    expect(faultFromInput("acLine", "151")).toBeNull();
    expect(faultFromInput("acLine", "-1")).toBeNull();
  });

  test("la tensión residual vale de 0 a 100 %", () => {
    expect(faultFromInput("acUndervoltage", "65")).toEqual({ kind: "acUndervoltage", residualPercent: 65 });
    expect(faultFromInput("acUndervoltage", "101")).toBeNull();
  });

  test("un campo vacío o con basura no vale", () => {
    expect(faultFromInput("acLine", "")).toBeNull();
    expect(faultFromInput("acLine", "   ")).toBeNull();
    expect(faultFromInput("acUndervoltage", "abc")).toBeNull();
  });
});

describe("summarizeStation", () => {
  test("dice el estado de la estación y el del 86", () => {
    expect(summarizeStation(stationAt("coupled"))).toBe("Estación: coupled · Relé 86: normal");
  });

  test("con el 86 enclavado y la estación inconsistente", () => {
    const station: Station = {
      ...stationAt("coupled"),
      switchgear: { ...stationAt("coupled").switchgear, Q1: { kind: "open" } },
      relay86: { locked: true, operated: ["converterProtection"] },
    };
    expect(summarizeStation(station)).toBe("Estación: inconsistente · Relé 86: enclavado");
  });
});
