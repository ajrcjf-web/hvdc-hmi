// Comparaciones de tiempo con tolerancia. El tiempo se acumula sumando dt, y con
// decimales la suma no es exacta: 1 - 10 × 0.1 da 1.39e-16 y no 0, y diez latidos
// de 0.1 dan 0.9999999999999999 y no 1. Por eso los tiempos acumulados nunca se
// comparan de forma exacta (ni con ===, ni con <= 0, ni con >=): se usan intervalos
// (como hace runCycle) o estas funciones.
//
// 1 µs es mucho mayor que el error acumulado (del orden de 1e-11 en una hora de
// simulación) y mucho menor que cualquier dt razonable (1 ms o más).

export const TIME_TOLERANCE_SECONDS = 1e-6;

// ¿Se acabó el tiempo que faltaba? Tolera el residuo positivo que deja restar dt
// muchas veces (1.39e-16), además del negativo.
export function isTimeUp(remainingSeconds: number): boolean {
  return remainingSeconds <= TIME_TOLERANCE_SECONDS;
}

// ¿Ya se llegó al instante objetivo? Tolera que el tiempo acumulado quede apenas
// por debajo (14.99999999999996 en vez de 15).
export function hasReached(timeSeconds: number, targetSeconds: number): boolean {
  return timeSeconds >= targetSeconds - TIME_TOLERANCE_SECONDS;
}

// Segundos enteros que faltan, redondeados hacia arriba, sin sumar uno por el error
// de redondeo (5.0000000000000195 son 5 s, no 6). Nunca baja de 0.
export function wholeSecondsLeft(remainingSeconds: number): number {
  return Math.max(0, Math.ceil(remainingSeconds - TIME_TOLERANCE_SECONDS));
}
