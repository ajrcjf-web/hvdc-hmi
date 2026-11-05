// Las ventanas internas de la aplicación y su dirección en la página (el "hash").
// Son datos: la barra de navegación y la ventana pendiente solo los dibujan.
//
// El hash es la parte de la dirección que va después del #. Cambiarlo no recarga la
// página, pero queda en el historial del navegador: así el botón Atrás funciona y cada
// ventana tiene su dirección (ej. http://localhost:5173/#/eventos).

export const windowIds = ["overview", "alarms", "events", "trends", "faults"] as const;
export type WindowId = (typeof windowIds)[number];

export type WindowInfo = {
  id: WindowId;
  label: string; // lo que se ve en la barra
  route: string; // lo que va en la dirección, después de "#/"
  available: boolean; // si ya tiene contenido
  subphase: string; // en qué subfase de la Fase 4 se completa
};

export const windows: WindowInfo[] = [
  { id: "overview", label: "Overview", route: "overview", available: true, subphase: "3" },
  { id: "alarms", label: "Alarmas", route: "alarmas", available: false, subphase: "4.2" },
  { id: "events", label: "Eventos (SER)", route: "eventos", available: true, subphase: "4.1" },
  { id: "trends", label: "Tendencias", route: "tendencias", available: false, subphase: "4.5" },
  { id: "faults", label: "Simulación de fallas", route: "simulacion", available: false, subphase: "4.4" },
];

export const DEFAULT_WINDOW: WindowId = "overview";

export function windowInfo(id: WindowId): WindowInfo {
  // Todas las ventanas de windowIds están en la lista.
  return windows.find((w) => w.id === id)!;
}

export function hashForWindow(id: WindowId): string {
  return `#/${windowInfo(id).route}`;
}

// Una dirección desconocida o vacía lleva a la overview: nunca rompe la página.
export function windowFromHash(hash: string): WindowId {
  const route = hash.replace(/^#\/?/, "");
  return windows.find((w) => w.route === route)?.id ?? DEFAULT_WINDOW;
}
