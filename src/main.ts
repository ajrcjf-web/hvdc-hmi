const stationName: string = "Estacion A";
const ratedPowerMW: number = 500;

console.log("Simulador HMI HVDC");
console.log(`Estación: ${stationName}`);
console.log(`Potencia nominal: ${ratedPowerMW} MW`);

type StationState = "earthed" | "stopped" | "decoupled" | "coupled";
let state: StationState = "coupled";
console.log(`Estado: ${state}`);

// Para cada estado, a cuáles se puede pasar (solo vecinos, en ambos sentidos).
// Con Record, TypeScript avisa si se olvida algún estado.
const allowedTransitions: Record<StationState, StationState[]> = {
  stopped: ["earthed", "decoupled"],
  decoupled: ["stopped", "coupled"],
  coupled: ["decoupled"],
  earthed: ["stopped"],
};

function canTransition(from: StationState, to: StationState): boolean {
  return allowedTransitions[from].includes(to);
}

// Pruebas manuales: se prueban los 9 pares posibles.
console.log("stopped → stopped:", canTransition("stopped", "stopped")); // esperado: false
console.log("stopped → decoupled:", canTransition("stopped", "decoupled")); // esperado: true
console.log("stopped → coupled:", canTransition("stopped", "coupled")); // esperado: false
console.log("decoupled → stopped:", canTransition("decoupled", "stopped")); // esperado: true
console.log("decoupled → decoupled:", canTransition("decoupled", "decoupled")); // esperado: false
console.log("decoupled → coupled:", canTransition("decoupled", "coupled")); // esperado: true
console.log("coupled → stopped:", canTransition("coupled", "stopped")); // esperado: false
console.log("coupled → decoupled:", canTransition("coupled", "decoupled")); // esperado: true
console.log("coupled → coupled:", canTransition("coupled", "coupled")); // esperado: false
console.log("earthed → stopped:", canTransition("earthed", "stopped")); // esperado: true
console.log("stopped → earthed:", canTransition("stopped", "earthed")); // esperado: true
console.log("earthed → decoupled:", canTransition("earthed", "decoupled")); // esperado: false
console.log("decoupled → earthed:", canTransition("decoupled", "earthed")); // esperado: false
