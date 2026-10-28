// Punto de entrada del simulador: arranca el programa.
import { canTransition, type StationState } from "./stationState.ts";

const stationName: string = "Estación A";
const ratedPowerMW: number = 500;

console.log("Simulador HMI HVDC");
console.log(`Estación: ${stationName}`);
console.log(`Potencia nominal: ${ratedPowerMW} MW`);

let state: StationState = "stopped";
console.log(`Estado: ${state}`);

// Pruebas manuales: se prueban los 16 pares posibles.
// (Acá pegás tus 16 líneas de console.log, sin cambios.)
