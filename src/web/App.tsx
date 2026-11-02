// La ventana overview: conecta el reloj, el estado y los tres paneles.
import { useEffect, useReducer } from "react";
import { defaultConfig } from "../station.ts";
import { CommandLog } from "./components/CommandLog.tsx";
import { SingleLineDiagram } from "./components/SingleLineDiagram.tsx";
import { CommandPanel } from "./components/CommandPanel.tsx";
import { StatusPanel } from "./components/StatusPanel.tsx";
import { createHmiState, hmiReducer, TICK_MS } from "./hmiState.ts";

export function App() {
  const [state, dispatch] = useReducer(hmiReducer, defaultConfig, createHmiState);

  // El reloj: cada TICK_MS pide un latido. La función que devuelve el efecto
  // detiene el reloj cuando el componente desaparece (si no, quedarían relojes duplicados).
  useEffect(() => {
    const timer = setInterval(() => dispatch({ type: "tick" }), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <main>
      <h1>HMI HVDC — Overview</h1>
      <SingleLineDiagram station={state.station} />
      <div className="layout">
        <StatusPanel station={state.station} timeSeconds={state.timeSeconds} />
        <CommandPanel onCommand={(command) => dispatch({ type: "command", command })} />
        <CommandLog entries={state.log} />
      </div>
    </main>
  );
}
