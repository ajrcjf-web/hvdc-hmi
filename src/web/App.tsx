// La aplicación: conecta el reloj, el estado, la barra de navegación, la ventana
// activa y la ventana de confirmación. Todas las ventanas comparten este estado.
import { useEffect, useReducer } from "react";
import { timestampMs } from "../events.ts";
import { defaultConfig } from "../station.ts";
import { AlarmWindow } from "./components/AlarmWindow.tsx";
import { ConfirmationDialog } from "./components/ConfirmationDialog.tsx";
import { FaultsWindow } from "./components/FaultsWindow.tsx";
import { EventsPanel } from "./components/EventsPanel.tsx";
import { NavigationBar } from "./components/NavigationBar.tsx";
import { OverviewWindow } from "./components/OverviewWindow.tsx";
import { PendingWindow } from "./components/PendingWindow.tsx";
import { SerWindow } from "./components/SerWindow.tsx";
import {
  createHmiState,
  DEFAULT_SELECTION_TIMEOUT_SECONDS,
  hmiReducer,
  TICK_MS,
} from "./hmiState.ts";
import { summarizeAlarms } from "./alarmView.ts";
import { summarizeNewEvents, toEventRows } from "./eventRows.ts";
import {
  initialPanelOpen,
  NARROW_SCREEN_QUERY,
  readPanelPreference,
  writePanelPreference,
} from "./panelPreference.ts";
import { hashForWindow, windowFromHash, windowInfo } from "./windows.ts";

// El almacenamiento local puede no estar disponible (modo privado, bloqueado): solo entonces
// no se recuerda la elección del panel.
function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isNarrowScreen(): boolean {
  try {
    return window.matchMedia(NARROW_SCREEN_QUERY).matches;
  } catch {
    return false;
  }
}

// La ventana inicial sale de la dirección de la página (ej. #/eventos).
function createInitialState() {
  return createHmiState(
    defaultConfig,
    DEFAULT_SELECTION_TIMEOUT_SECONDS,
    windowFromHash(window.location.hash),
    Date.now(), // el instante de arranque: las marcas de tiempo del SER parten de aquí
    // Visible por defecto; plegado en pantalla angosta si el operador nunca eligió.
    initialPanelOpen(readPanelPreference(getStorage()), isNarrowScreen()),
  );
}

export function App() {
  const [state, dispatch] = useReducer(hmiReducer, undefined, createInitialState);

  // El reloj: cada TICK_MS pide un latido. La función que devuelve el efecto
  // detiene el reloj cuando el componente desaparece (si no, quedarían relojes duplicados).
  useEffect(() => {
    const timer = setInterval(() => dispatch({ type: "tick" }), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // La dirección manda: tanto un clic en la barra como el botón Atrás cambian el hash,
  // y este aviso lleva la ventana nueva al estado. Así hay una sola vía de cambio.
  useEffect(() => {
    const onHashChange = () =>
      dispatch({ type: "navigate", window: windowFromHash(window.location.hash) });
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="app-shell">
      <main>
        <NavigationBar
          active={state.ui.activeWindow}
          alarmSummary={summarizeAlarms(state.simulation.alarms)}
          onNavigate={(id) => {
            window.location.hash = hashForWindow(id);
          }}
        />
        {state.ui.activeWindow === "overview" && <OverviewWindow state={state} dispatch={dispatch} />}
        {state.ui.activeWindow === "events" && (
          <SerWindow
            events={state.simulation.events}
            discarded={state.simulation.nextEventId - state.simulation.events.length}
            nowMs={timestampMs(state.simulation.startMs, state.simulation.timeSeconds)}
          />
        )}
        {state.ui.activeWindow === "alarms" && (
          <AlarmWindow
            alarms={state.simulation.alarms}
            startMs={state.simulation.startMs}
            dispatch={dispatch}
          />
        )}
        {state.ui.activeWindow === "faults" && (
          <FaultsWindow alarms={state.simulation.alarms} dispatch={dispatch} />
        )}
        {!windowInfo(state.ui.activeWindow).available && <PendingWindow id={state.ui.activeWindow} />}
        {state.ui.selection !== null && (
          <ConfirmationDialog
            selection={state.ui.selection}
            station={state.simulation.station}
            config={state.simulation.config}
            timeSeconds={state.simulation.timeSeconds}
            onExecute={() => dispatch({ type: "execute" })}
            onCancel={() => dispatch({ type: "cancel" })}
          />
        )}
      </main>
      <EventsPanel
        open={state.ui.eventsPanelOpen}
        rows={toEventRows(state.simulation.events)}
        summary={summarizeNewEvents(
          state.ui.eventsPanelOpen,
          state.simulation.events,
          state.simulation.nextEventId,
          state.ui.eventsFoldedAtId,
        )}
        onToggle={() => {
          dispatch({ type: "toggle-events-panel" });
          // Solo una elección del operador se recuerda (no el valor por defecto).
          writePanelPreference(getStorage(), !state.ui.eventsPanelOpen);
        }}
        onOpenSer={() => {
          window.location.hash = hashForWindow("events");
        }}
      />
    </div>
  );
}
