// La elección del operador sobre el panel de eventos (abierto o plegado), que se recuerda
// entre sesiones en el almacenamiento local del navegador. Acceder al almacenamiento puede
// fallar (modo privado, cuota llena, bloqueado por el navegador): en ese caso no se rompe
// nada, simplemente no se recuerda. Las funciones reciben el almacenamiento, para probarlas.

export const PANEL_PREFERENCE_KEY = "hvdc-hmi.eventsPanelOpen";

// Pantalla angosta: el panel arranca plegado para no tapar el proceso.
export const NARROW_SCREEN_QUERY = "(max-width: 900px)";

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

// Lo que eligió el operador, o null si nunca eligió (o no se pudo leer).
export function readPanelPreference(storage: PreferenceStorage | null): boolean | null {
  try {
    const value = storage?.getItem(PANEL_PREFERENCE_KEY);
    if (value === "open") return true;
    if (value === "folded") return false;
    return null;
  } catch {
    return null;
  }
}

export function writePanelPreference(storage: PreferenceStorage | null, open: boolean): void {
  try {
    storage?.setItem(PANEL_PREFERENCE_KEY, open ? "open" : "folded");
  } catch {
    // No se pudo guardar: la elección vale en esta sesión y no se recuerda.
  }
}

// Visible por defecto. En pantalla angosta arranca plegado, salvo que el operador ya haya
// elegido: si eligió, se respeta su elección.
export function initialPanelOpen(stored: boolean | null, narrowScreen: boolean): boolean {
  return stored ?? !narrowScreen;
}
