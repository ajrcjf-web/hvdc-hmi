// La ventana overview: el unifilar, los valores y las órdenes. Los eventos (y las respuestas
// a las órdenes) se ven en el panel lateral, que está en todas las ventanas.
import type { Dispatch } from "react";
import type { HmiAction, HmiState } from "../hmiState.ts";
import { reset86Command } from "../commands.ts";
import { describeRelay86, lastProtection } from "../relay86View.ts";
import { ModeIndicator } from "./ModeIndicator.tsx";
import { Relay86Indicator } from "./Relay86Indicator.tsx";
import { CommandPanel } from "./CommandPanel.tsx";
import { SingleLineDiagram } from "./SingleLineDiagram.tsx";
import { StatusPanel } from "./StatusPanel.tsx";

type Props = {
  state: HmiState;
  dispatch: Dispatch<HmiAction>;
};

export function OverviewWindow({ state, dispatch }: Props) {
  const relay = describeRelay86(state.simulation.station);
  return (
    <>
      <h1>HMI HVDC — Overview</h1>
      <div className="indicators">
        <ModeIndicator mode={state.simulation.station.mode} />
        <Relay86Indicator relay={relay} />
        {/* El reset no opera la planta: habilita volver a operarla. Por eso va con el indicador
            del 86 y no con las órdenes de maniobra. Siempre presente y siempre activo: si no
            vale, la lógica lo rechaza y el motivo sale en el panel de eventos. */}
        <button onClick={() => dispatch({ type: "select", command: reset86Command() })}>
          Resetear 86
        </button>
      </div>
      <SingleLineDiagram station={state.simulation.station} />
      <div className="layout">
        <StatusPanel
          station={state.simulation.station}
          timeSeconds={state.simulation.timeSeconds}
          relay={relay}
          lastProtection={lastProtection(state.simulation.events)}
        />
        <CommandPanel
          mode={state.simulation.station.mode}
          onCommand={(command) => dispatch({ type: "select", command })}
        />
      </div>
    </>
  );
}
