// Punto de entrada del simulador: corre la simulación en el tiempo
// y ejecuta un escenario de órdenes del operador.
import { measure } from "./measurements.ts";
import { step } from "./simulation.ts";
import {
  createStation,
  defaultConfig,
  requestBlock,
  requestDeblock,
  requestPowerOrder,
  requestTransition,
  type CommandResult,
  type ConverterState,
  type Station,
} from "./station.ts";
import { deriveState } from "./stationState.ts";
import type { SwitchStatus } from "./switchgear.ts";

const TICK_MS = 100; // cada cuánto se calcula un paso (tiempo real)
const SIMULATION_SPEED = 10; // 10 = la simulación corre 10 veces más rápido
const DT_SECONDS = (TICK_MS / 1000) * SIMULATION_SPEED; // tiempo simulado por paso
const END_SECONDS = 120;

type ScheduledCommand = {
  atSeconds: number;
  label: string;
  run: (station: Station) => CommandResult;
};

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

const positionLabels: Record<"open" | "closed", string> = {
  open: "abierto",
  closed: "cerrado",
};

const converterLabels: Record<ConverterState, string> = {
  blocked: "bloqueado",
  deblocked: "desbloqueado",
};

function formatSwitch(status: SwitchStatus): string {
  return status.kind === "moving" ? "maniobra" : positionLabels[status.kind];
}

let station: Station = createStation();
let timeSeconds = 0;

function log(message: string): void {
  console.log(`[t = ${String(timeSeconds).padStart(3)} s] ${message}`);
}

function apply(label: string, result: CommandResult): void {
  if (result.ok) {
    station = result.station;
    log(`✓ ${label}`);
  } else {
    log(`✗ ${label} → rechazada: ${result.reason}`);
  }
}

function tick(): void {
  // 1. Órdenes programadas para este instante.
  for (const command of scenario) {
    if (command.atSeconds === timeSeconds) {
      apply(command.label, command.run(station));
    }
  }

  // 2. Registro del estado en este instante.
  if (timeSeconds % 5 === 0) {
    const { Q1, Q2, QE } = station.switchgear;
    const { udcKV, idcKA } = measure(station);
    log(
      `  ${deriveState(station.switchgear).padEnd(10)}` +
        ` | Q1 ${formatSwitch(Q1).padEnd(8)} Q2 ${formatSwitch(Q2).padEnd(8)} QE ${formatSwitch(QE).padEnd(8)}` +
        ` | ${converterLabels[station.converter].padEnd(12)}` +
        ` | P = ${String(station.powerMW).padStart(3)} MW` +
        ` | Udc = ${String(udcKV).padStart(3)} kV | Idc = ${idcKA.toFixed(2)} kA`,
    );
  }

  // 3. Evolución de la planta hasta el instante siguiente.
  station = step(station, DT_SECONDS, defaultConfig);
  timeSeconds += DT_SECONDS;

  if (timeSeconds > END_SECONDS) {
    clearInterval(timer);
    console.log("Fin de la simulación");
  }
}

console.log("Simulador HMI HVDC");
const timer = setInterval(tick, TICK_MS);
