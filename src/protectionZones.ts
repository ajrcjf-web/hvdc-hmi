// Transformadores de medida y zonas de protección: los datos fijos de la topología.
// No son estado de la estación (no cambian); sí lo es cuáles están energizadas.
// Funciones puras: se prueban solas y las usan la lógica (qué ve cada protección) y,
// más adelante, la ventana "Protecciones" (qué se dibuja).
//
// Puntos de medida (de la red hacia la línea DC):
//   CT1      lado red de Q1               21 y 87T (lado de alta)
//   TP1      barra AC, lado red de Q1     21 y 27
//   CT2      lado válvulas del transformador   87T (lado de baja) y convertidor
//   CT3      lado DC del convertidor, antes de Q2   convertidor y medición de Idc
//   divisor  lado línea de Q2             protecciones de línea DC
//
// Zonas: línea AC (de CT1 hacia la red), transformador (CT1–CT2), convertidor (CT2–CT3)
// y línea DC (del divisor DC hacia la línea). Q2, entre CT3 y el divisor, no tiene zona.

import type { Station } from "./station.ts";
import { atOrigin } from "./switchgear.ts";

export const measurementPoints = ["CT1", "TP1", "CT2", "CT3", "DC_DIVIDER"] as const;
export type MeasurementPoint = (typeof measurementPoints)[number];

export const protectionZones = ["acLine", "transformer", "converter", "dcLine"] as const;
export type ProtectionZone = (typeof protectionZones)[number];

// Una zona está energizada si le llega tensión: solo entonces un relé puede medir en ella
// una falla. Una falla en una zona sin energizar no la ve ningún relé; la protección actúa
// en cuanto la zona se energiza (cierre sobre falla).
//
// "Cerrado" usa atOrigin, la misma regla de la alarma de inconsistencia: un equipo en
// maniobra cuenta en su posición de origen. Al cerrar Q1, la zona se energiza cuando Q1
// llega a cerrado; al dispararlo, sigue energizada hasta que termina de abrir.
export function isZoneEnergized(zone: ProtectionZone, station: Station): boolean {
  const positions = atOrigin(station.switchgear);
  switch (zone) {
    case "acLine":
      return true; // la red es la fuente
    case "transformer":
    case "converter":
      return positions.Q1.kind === "closed";
    case "dcLine":
      return positions.Q2.kind === "closed" && station.udcKV > 0;
  }
}
