// Punto de entrada del simulador: arranca el programa.
import {
  createStation,
  defaultConfig,
  requestPowerOrder,
  requestTransition,
  type CommandResult,
  type Station,
} from "./station.ts";

let station: Station = createStation();

function apply(command: string, result: CommandResult): void {
  if (result.ok) {
    station = result.station;
    console.log(
      `✓ ${command} → estado: ${station.state}, consigna: ${station.powerOrderMW} MW`,
    );
  } else {
    console.log(`✗ ${command} → rechazada: ${result.reason}`);
  }
}

console.log("Simulador HMI HVDC");
console.log(`Estado inicial: ${station.state}`);

apply("Ir a decoupled", requestTransition(station, "decoupled"));
apply("Ir a coupled", requestTransition(station, "coupled"));
apply("Consigna 300 MW", requestPowerOrder(station, 300, defaultConfig));
apply("Consigna 20 MW", requestPowerOrder(station, 20, defaultConfig));
apply("Desacoplar", requestTransition(station, "decoupled"));
apply("Consigna 0 MW", requestPowerOrder(station, 0, defaultConfig));
apply("Desacoplar", requestTransition(station, "decoupled"));
