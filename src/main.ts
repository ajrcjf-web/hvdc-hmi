// Punto de entrada del simulador: corre la simulación en el tiempo
// y ejecuta un escenario de órdenes del operador.
import { step } from "./simulation.ts";
import {
  createStation,
  defaultConfig,
  requestPowerOrder,
  requestTransition,
  type CommandResult,
  type Station,
} from "./station.ts";
import { measure } from "./measurements.ts";

const TICK_MS = 100; // cada cuánto se calcula un paso (tiempo real)
const SIMULATION_SPEED = 10; // 10 = la simulación corre 10 veces más rápido
const DT_SECONDS = (TICK_MS / 1000) * SIMULATION_SPEED; // tiempo simulado por paso
const END_SECONDS = 85;

type ScheduledCommand = {
  atSeconds: number;
  label: string;
  run: (station: Station) => CommandResult;
};

const scenario: ScheduledCommand[] = [
  { atSeconds: 0, label: "Ir a decoupled", run: (s) => requestTransition(s, "decoupled") },
  { atSeconds: 2, label: "Ir a coupled", run: (s) => requestTransition(s, "coupled") },
  { atSeconds: 4, label: "Consigna 300 MW", run: (s) => requestPowerOrder(s, 300, defaultConfig) },
  { atSeconds: 10, label: "Desacoplar", run: (s) => requestTransition(s, "decoupled") },
  { atSeconds: 40, label: "Desacoplar", run: (s) => requestTransition(s, "decoupled") },
  { atSeconds: 42, label: "Consigna 0 MW", run: (s) => requestPowerOrder(s, 0, defaultConfig) },
  { atSeconds: 80, label: "Desacoplar", run: (s) => requestTransition(s, "decoupled") },
];

let station: Station = createStation();
let timeSeconds = 0;

function log(message: string): void {
  console.log(`[t = ${String(timeSeconds).padStart(2)} s] ${message}`);
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
    const { udcKV, idcKA } = measure(station, defaultConfig);
    log(
      `  ${station.state.padEnd(9)} | P = ${String(station.powerMW).padStart(3)} MW` +
        ` | consigna = ${String(station.powerOrderMW).padStart(3)} MW` +
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
