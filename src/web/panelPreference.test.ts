import { describe, expect, test } from "vitest";
import {
  initialPanelOpen,
  PANEL_PREFERENCE_KEY,
  readPanelPreference,
  writePanelPreference,
  type PreferenceStorage,
} from "./panelPreference.ts";

// Un almacenamiento falso en memoria.
function fakeStorage(initial: Record<string, string> = {}): PreferenceStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

// Un almacenamiento que falla siempre (modo privado, bloqueado, cuota llena).
const brokenStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("bloqueado");
  },
};

describe("panelPreference", () => {
  test("sin nada guardado no hay elección", () => {
    expect(readPanelPreference(fakeStorage())).toBeNull();
    expect(readPanelPreference(null)).toBeNull();
  });

  test("recuerda la elección: abierto y plegado", () => {
    const storage = fakeStorage();
    writePanelPreference(storage, false);
    expect(storage.data[PANEL_PREFERENCE_KEY]).toBe("folded");
    expect(readPanelPreference(storage)).toBe(false);
    writePanelPreference(storage, true);
    expect(readPanelPreference(storage)).toBe(true);
  });

  test("un valor desconocido se ignora", () => {
    expect(readPanelPreference(fakeStorage({ [PANEL_PREFERENCE_KEY]: "quizás" }))).toBeNull();
  });

  test("si el almacenamiento falla no se rompe nada", () => {
    expect(readPanelPreference(brokenStorage)).toBeNull();
    expect(() => writePanelPreference(brokenStorage, true)).not.toThrow();
    expect(() => writePanelPreference(null, true)).not.toThrow();
  });
});

describe("initialPanelOpen", () => {
  test("visible por defecto", () => {
    expect(initialPanelOpen(null, false)).toBe(true);
  });

  test("en pantalla angosta arranca plegado si nunca eligió", () => {
    expect(initialPanelOpen(null, true)).toBe(false);
  });

  test("si ya eligió se respeta su elección, también en pantalla angosta", () => {
    expect(initialPanelOpen(true, true)).toBe(true);
    expect(initialPanelOpen(false, false)).toBe(false);
  });
});
