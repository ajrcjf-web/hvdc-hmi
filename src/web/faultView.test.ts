import { describe, expect, test } from "vitest";
import { faultKinds, noFaults } from "../protections.ts";
import type { Station } from "../station.ts";
import { deblockedAt, stationAt } from "../testSupport.ts";
import { summarizeStation, toFaultRows } from "./faultView.ts";

const withFault = (station: Station, kind: "transformer" | "converter"): Station => ({
  ...station,
  faults: { ...noFaults(), [kind]: true },
});

describe("toFaultRows", () => {
  test("hay una fila por falla, en el orden de la lista", () => {
    expect(toFaultRows(stationAt("stopped")).map((r) => r.kind)).toEqual(faultKinds);
    expect(toFaultRows(stationAt("stopped")).map((r) => r.name)).toEqual([
      "Falla interna del transformador",
      "Falla interna del convertidor",
    ]);
  });

  test("sin fallas todas están despejadas y sin nota", () => {
    for (const row of toFaultRows(stationAt("coupled"))) {
      expect(row).toMatchObject({ present: false, stateLabel: "Falla despejada", note: "" });
    }
  });

  test("una falla presente en una zona energizada dice qué protección la ve", () => {
    const rows = toFaultRows(withFault(deblockedAt(0), "transformer"));
    expect(rows[0]).toMatchObject({
      present: true,
      stateLabel: "Falla presente",
      note: "La ve: Protección diferencial del transformador (87T)",
    });
    expect(rows[1]).toMatchObject({ present: false, note: "" });
  });

  test("una falla en una zona sin energizar avisa que nadie la ve y que actuará al energizarse", () => {
    const rows = toFaultRows(withFault(stationAt("stopped"), "converter"));
    expect(rows[1]!.note).toContain("sin energizar");
    expect(rows[1]!.note).toContain("ninguna protección la ve");
    expect(rows[1]!.note).toContain("Protección del convertidor actuará cuando se energice");
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
    const note = toFaultRows(tripped())[1]!.note;
    expect(note).toBe(
      "Protección del convertidor ya actuó y la zona del convertidor (CT2–CT3) quedó sin energizar",
    );
    expect(note).not.toContain("actuará");
  });

  test("la nota de una falla que no actuó sigue igual", () => {
    // El transformador no actuó: su zona también está sin energizar, y actuará al energizarse.
    const station: Station = { ...tripped(), faults: { transformer: true, converter: true } };
    expect(toFaultRows(station)[0]!.note).toContain("actuará cuando se energice");
  });

  test("si ya actuó y la zona sigue energizada, solo dice que ya actuó", () => {
    const station: Station = { ...tripped(), switchgear: stationAt("coupled").switchgear };
    expect(toFaultRows(station)[1]!.note).toBe("Protección del convertidor ya actuó");
  });

  test("despejada la falla no hay nota, aunque el 86 siga enclavado", () => {
    const station: Station = { ...tripped(), faults: noFaults() };
    expect(toFaultRows(station)[1]!.note).toBe("");
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
