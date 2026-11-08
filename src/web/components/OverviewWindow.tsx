// La ventana overview: el unifilar, los valores, las órdenes y el registro.
import type { Dispatch } from "react";
import type { HmiAction, HmiState } from "../hmiState.ts";
import { CommandLog } from "./CommandLog.tsx";
import { ModeIndicator } from "./ModeIndicator.tsx";
import { CommandPanel } from "./CommandPanel.tsx";
import { SingleLineDiagram } from "./SingleLineDiagram.tsx";
import { StatusPanel } from "./StatusPanel.tsx";

type Props = {
  state: HmiState;
  dispatch: Dispatch<HmiAction>;
};

export function OverviewWindow({ state, dispatch }: Props) {
  return (
    <>
      <h1>HMI HVDC — Overview</h1>
      <ModeIndicator mode={state.simulation.station.mode} />
      <SingleLineDiagram station={state.simulation.station} />
      <div className="layout">
        <StatusPanel station={state.simulation.station} timeSeconds={state.simulation.timeSeconds} />
        <CommandPanel
          mode={state.simulation.station.mode}
          onCommand={(command) => dispatch({ type: "select", command })}
          notice={state.ui.selectionNotice}
        />
        <CommandLog entries={state.ui.log} />
      </div>
    </>
  );
}
