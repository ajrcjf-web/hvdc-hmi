// Punto de entrada del simulador: corre la simulación en el tiempo
// y ejecuta un escenario de órdenes del operador.
import { createAlarmState, type AlarmState } from "./alarms.ts";
import { converterLabels, formatSwitch } from "./labels.ts";
import { measure } from "./measurements.ts";
import { runCycle, type ScheduledCommand } from "./simulationCycle.ts";
import {
  createStation,
  defaultConfig,
  requestBlock,
  requestDeblock,
  requestPowerOrder,
  requestTransition,
  type CommandResult,
  type Station,
} from "./station.ts";
import { deriveState } from "./stationState.ts";

const TICK_MS = 100; // cada cuánto se calcula un paso (tiempo real)
const SIMULATION_SPEED = 10; // 10 = la simulación corre 10 veces más rápido
const DT_SECONDS = (TICK_MS / 1000) * SIMULATION_SPEED; // tiempo simulado por paso
const END_SECONDS = 120;

// Tiempos por defecto: Q1 = 1 s, Q2 = 8 s, QE = 6 s; Udc: 100 kV/s; P: 10 MW/s.
const scenario: ScheduledCommand[] = [
  { atSeconds: 0, label: "Ir a decoupled", run: (s) => requestTransition(s, "decoupled", defaultConfig) },
  { atSeconds: 2, label: "Ir a coupled", run: (s) => requestTransition(s, "coupled", defaultConfig) },
  { atSeconds: 12, label: "Consigna 300 MW", run: (s) => requestPowerOrder(s, 300, defaultConfig) },
  { atSeconds: 13, label: "Desbloquear", run: (s) => requestDeblock(s) },
  { atSeconds: 15, label: "Consigna 300 MW", run: (s) => requestPowerOrder(s, 300, defaultConfig) },
  { atSeconds: 20, label: "Consigna 300 MW", run: (s) => requestPowerOrder(s, 300, defaultConfig) },
  { atSeconds: 25, label: "Desacoplar", run: (s) => requestTransition(s, "decoupled", defaultConfig) },
  { atSeconds: 53, label: "Desacoplar", run: (s) => requestTransition(s, "decoupled", defaultConfig) },
  { atSeconds: 55, label: "Bloquear", run: (s) => requestBlock(s) },
  { atSeconds: 57, label: "Consigna 0 MW", run: (s) => requestPowerOrder(s, 0, defaultConfig) },
  { atSeconds: 90, label: "Bloquear", run: (s) => requestBlock(s) },
  { atSeconds: 92, label: "Desacoplar", run: (s) => requestTransition(s, "decoupled", defaultConfig) },
  { atSeconds: 96, label: "Desacoplar", run: (s) => requestTransition(s, "decoupled", defaultConfig) },
  { atSeconds: 106, label: "Ir a stopped", run: (s) => requestTransition(s, "stopped", defaultConfig) },
  { atSeconds: 109, label: "Ir a earthed", run: (s) => requestTransition(s, "earthed", defaultConfig) },
];

let station: Station = createStation();
let alarms: AlarmState = createAlarmState(); // la consola no las muestra, pero el ciclo las necesita
let timeSeconds = 0;

function log(message: string): void {
  console.log(`[t = ${String(timeSeconds).padStart(3)} s] ${message}`);
}

function logCommand(label: string, result: CommandResult): void {
  if (result.ok) {
    log(`✓ ${label}`);
  } else {
    log(`✗ ${label} → rechazada: ${result.reason}`);
  }
}

function logSnapshot(snapshot: Station): void {
  const { Q1, Q2, QE } = snapshot.switchgear;
  const { udcKV, idcKA } = measure(snapshot);
  log(
    `  ${deriveState(snapshot.switchgear).padEnd(10)}` +
      ` | Q1 ${formatSwitch(Q1).padEnd(8)} Q2 ${formatSwitch(Q2).padEnd(8)} QE ${formatSwitch(QE).padEnd(8)}` +
      ` | ${converterLabels[snapshot.converter].padEnd(12)}` +
      ` | P = ${String(snapshot.powerMW).padStart(3)} MW` +
      ` | Udc = ${String(udcKV).padStart(3)} kV | Idc = ${idcKA.toFixed(2)} kA`,
  );
}

function tick(): void {
  const cycle = runCycle(station, timeSeconds, scenario, DT_SECONDS, defaultConfig, alarms);

  // Los eventos se muestran con el instante en que ocurrieron (antes de avanzar).
  for (const event of cycle.events) {
    if (event.kind === "command") {
      logCommand(event.label, event.result);
    } else if (event.kind === "snapshot") {
      logSnapshot(event.station);
    } // los eventos de señal son para el SER de la web: la consola no los muestra
  }

  station = cycle.station;
  alarms = cycle.alarms;
  timeSeconds = cycle.timeSeconds;

  if (timeSeconds > END_SECONDS) {
    clearInterval(timer);
    console.log("Fin de la simulación");
  }
}

console.log("Simulador HMI HVDC");
const timer = setInterval(tick, TICK_MS);
