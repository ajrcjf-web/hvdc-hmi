import { describe, expect, test } from "vitest";
import {
  DEFAULT_WINDOW,
  hashForWindow,
  windowFromHash,
  windowIds,
  windows,
} from "./windows.ts";

describe("lista de ventanas", () => {
  test("están las cinco ventanas, en el orden de la barra", () => {
    expect(windows.map((w) => w.id)).toEqual(["overview", "alarms", "events", "trends", "faults"]);
    expect(windows.map((w) => w.id)).toEqual([...windowIds]);
  });

  test("tienen contenido la overview, las alarmas, los eventos y la simulación del instructor", () => {
    expect(windows.filter((w) => w.available).map((w) => w.id)).toEqual([
      "overview",
      "alarms",
      "events",
      "faults",
    ]);
  });

  test("cada ventana tiene una dirección propia", () => {
    const routes = windows.map((w) => w.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe("dirección (hash)", () => {
  test("cada ventana tiene su hash", () => {
    expect(hashForWindow("events")).toBe("#/eventos");
    expect(hashForWindow("overview")).toBe("#/overview");
  });

  test("ida y vuelta: el hash de cada ventana lleva a ella", () => {
    for (const id of windowIds) {
      expect(windowFromHash(hashForWindow(id))).toBe(id);
    }
  });

  test("sin hash, o con uno desconocido, abre la overview", () => {
    expect(windowFromHash("")).toBe(DEFAULT_WINDOW);
    expect(windowFromHash("#")).toBe(DEFAULT_WINDOW);
    expect(windowFromHash("#/no-existe")).toBe(DEFAULT_WINDOW);
  });

  test("acepta el hash sin la barra", () => {
    expect(windowFromHash("#eventos")).toBe("events");
  });
});
