import { describe, expect, test } from "vitest";
import { converterLabels, formatSwitch, formatTime, formatValue } from "./labels.ts";
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

  test("la hora simulada se muestra con un decimal, sin error de redondeo", () => {
    expect(formatTime(0.1 + 0.1 + 0.1)).toBe("0.3");
    expect(formatTime(12)).toBe("12.0");
  });

  test("los valores se muestran con los decimales pedidos", () => {
    expect(formatValue(29.999999999999996, 0)).toBe("30");
    expect(formatValue(0.6, 2)).toBe("0.60");
  });
});
