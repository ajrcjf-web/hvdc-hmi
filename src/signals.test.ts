import { describe, expect, test } from "vitest";
import {
  describeSignal,
  describeSignalState,
  signalDescriptions,
  signalStateLabels,
} from "./signals.ts";

describe("tabla de señales", () => {
  test("todo código tiene una descripción no vacía", () => {
    for (const [code, description] of Object.entries(signalDescriptions)) {
      expect(description.trim(), code).not.toBe("");
    }
  });

  test("los códigos no se repiten y tienen la forma OBJETO.SEÑAL", () => {
    const codes = Object.keys(signalDescriptions);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9_]+\.[A-Z0-9_]+$/);
    }
  });

  test("la descripción sale de la tabla", () => {
    expect(describeSignal("Q2.POS")).toBe("Q2 (seccionador DC): posición");
    expect(describeSignal("CMD.POWER_ORDER")).toBe("Orden: consigna de potencia");
  });

  test("todo estado tiene su etiqueta", () => {
    for (const [state, label] of Object.entries(signalStateLabels)) {
      expect(label.trim(), state).not.toBe("");
    }
    expect(describeSignalState("moving")).toBe("en maniobra");
    expect(describeSignalState("rejected")).toBe("rechazada");
  });
});

describe("alarmas en la tabla de señales", () => {
  test("cada alarma tiene su descripción y cada paso del ciclo de vida su etiqueta", () => {
    expect(describeSignal("ALARM.INCONSISTENT")).toBe("Alarma: estación inconsistente");
    expect(describeSignalState("active-unacknowledged")).toBe("activa sin reconocer");
    expect(describeSignalState("active-acknowledged")).toBe("activa reconocida");
    expect(describeSignalState("returned-unacknowledged")).toBe("normalizada sin reconocer");
    expect(describeSignalState("normal")).toBe("normal");
  });
});
