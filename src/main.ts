// Punto de entrada del simulador: arranca el programa.
import { canTransition, requestTransition, type StationState } from "./stationState.ts";


const stationName: string = "Estación A";
const ratedPowerMW: number = 500;

console.log("Simulador HMI HVDC");
console.log(`Estación: ${stationName}`);
console.log(`Potencia nominal: ${ratedPowerMW} MW`);

let state: StationState = "stopped";
console.log(`Estado: ${state}`);

const result = requestTransition(state, "coupled");
if (result.ok) {
  state = result.state;
  console.log(`Orden ejecutada. Nuevo estado: ${state}`);
} else {
  console.log(`Orden rechazada: ${result.reason}`);
}
