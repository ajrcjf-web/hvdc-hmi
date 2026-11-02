import { describe, expect, test } from "vitest";
import { converterLabels, formatSwitch } from "./labels.ts";
import { switchgearFor } from "./stationState.ts";

describe("etiquetas", () => {
  test("posiciones de un equipo", () => {
    const { Q1, QE } = switchgearFor("earthed");
    expect(formatSwitch(Q1)).toBe("abierto");
    expect(formatSwitch(QE)).toBe("cerrado");
  });

  test("equipo en maniobra", () => {
    expect(formatSwitch({ kind: "moving", to: "closed", remainingSeconds: 3 })).toBe(
      "maniobra",
    );
  });

  test("estados del convertidor", () => {
    expect(converterLabels.blocked).toBe("bloqueado");
    expect(converterLabels.deblocked).toBe("desbloqueado");
  });
});
