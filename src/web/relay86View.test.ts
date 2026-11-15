import { describe, expect, test } from "vitest";
import type { SerEvent } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { noFaults } from "../protections.ts";
import type { Station } from "../station.ts";
import { stationAt } from "../testSupport.ts";
import { describeRelay86, lastProtection } from "./relay86View.ts";

const locked = (faults: Partial<ReturnType<typeof noFaults>>): Station => ({
  ...stationAt("stopped"),
  relay86: { locked: true, operated: ["transformerDifferential", "converterProtection"] },
  faults: { ...noFaults(), ...faults },
});

describe("describeRelay86", () => {
  test("normal: texto y símbolo propios, sin causas", () => {
    expect(describeRelay86(stationAt("stopped"))).toEqual({
      locked: false,
      label: "RELÉ 86 NORMAL",
      symbol: "[□]",
      accessibleLabel: "Relé de bloqueo 86: normal",
      causes: [],
    });
  });

  test("enclavado: texto y símbolo distintos (no depende del color)", () => {
    const normal = describeRelay86(stationAt("stopped"));
    const view = describeRelay86(locked({}));
    expect(view.locked).toBe(true);
    expect(view.label).toBe("RELÉ 86 ENCLAVADO");
    expect(view.label).not.toBe(normal.label);
    expect(view.symbol).not.toBe(normal.symbol);
    expect(view.accessibleLabel).toBe("Relé de bloqueo 86: enclavado");
  });

  test("cada causa dice si su falla sigue presente o ya se despejó", () => {
    const view = describeRelay86(locked({ converter: true }));
    expect(view.causes).toEqual([
      {
        name: "Protección diferencial del transformador (87T)",
        present: false,
        text: "Protección diferencial del transformador (87T): falla despejada",
      },
      {
        name: "Protección del convertidor",
        present: true,
        text: "Protección del convertidor: falla presente",
      },
    ]);
  });
});

describe("lastProtection", () => {
  const event = (id: number, code: SerEvent["code"], state: SerEvent["state"]): SerEvent => ({
    id,
    code,
    state,
    timestampMs: 1_700_000_000_000 + id * 1000,
  });

  test("sin eventos de protección no hay ninguna", () => {
    expect(lastProtection([])).toBeNull();
    expect(lastProtection([event(1, "Q1.POS", "open"), event(0, "RELAY86.LOCKOUT", "locked")])).toBeNull();
  });

  test("un arranque no cuenta: solo la protección que actuó", () => {
    expect(lastProtection([event(0, "PROT.CONVERTER", "picked-up")])).toBeNull();
  });

  test("devuelve la más reciente (el SER guarda el más nuevo primero), con su hora del SER", () => {
    const events = [
      event(4, "RELAY86.LOCKOUT", "normal"), // un reset posterior no la borra
      event(3, "PROT.CONVERTER", "operated"),
      event(2, "PROT.CONVERTER", "picked-up"),
      event(1, "PROT.TRANSFORMER_DIFFERENTIAL", "operated"),
    ];
    expect(lastProtection(events)).toEqual({
      name: "Protección del convertidor",
      timestamp: formatTimestamp(1_700_000_003_000),
    });
  });
});
