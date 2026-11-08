// Los mandos del operador. Se muestran solo los del modo actual: las órdenes de estado en
// automático y el mando por equipo en manual (así el operador no ve botones que no valen).
// Los botones que se ven siempre están activos: si la orden no es
// válida, la lógica de control la rechaza y el motivo aparece en el registro
// (los enclavamientos viven en el control, no en la interfaz).
// Un botón no ejecuta la orden: la selecciona, y se confirma en la ventana de confirmación.
import { useState } from "react";
import type { OperatingMode } from "../../station.ts";
import { stationStates } from "../../stationState.ts";
import { switchIds, type SwitchId } from "../../switchgear.ts";
import {
  blockCommand,
  deblockCommand,
  modeCommand,
  powerOrderCommand,
  switchCommand,
  transitionCommand,
  type OperatorCommand,
} from "../commands.ts";

const switchNames: Record<SwitchId, string> = {
  Q1: "Q1 (interruptor AC)",
  Q2: "Q2 (seccionador DC)",
  QE: "QE (puesta a tierra)",
};

type Props = {
  mode: OperatingMode;
  onCommand: (command: OperatorCommand) => void; // selecciona la orden (aún no la ejecuta)
  notice: string | null; // por qué no se pudo seleccionar la última orden
};

export function CommandPanel({ mode, onCommand, notice }: Props) {
  // El texto que el operador está escribiendo; solo se convierte en número al enviar.
  const [powerText, setPowerText] = useState("");

  function sendPowerOrder() {
    // Un campo vacío o con basura da NaN, y requestPowerOrder lo rechaza con motivo.
    const orderMW = powerText.trim() === "" ? Number.NaN : Number(powerText);
    onCommand(powerOrderCommand(orderMW));
  }

  return (
    <section className="panel">
      <h2>Órdenes</h2>
      {notice !== null && (
        <p className="notice" role="alert">
          ✗ No seleccionada — {notice}
        </p>
      )}

      <h3>Modo de operación</h3>
      <div className="buttons">
        {mode === "automatic" ? (
          <button onClick={() => onCommand(modeCommand("manual"))}>Pasar a manual</button>
        ) : (
          <button onClick={() => onCommand(modeCommand("automatic"))}>Pasar a automático</button>
        )}
      </div>

      {mode === "automatic" ? (
        <>
          <h3>Estado de la estación</h3>
          <div className="buttons">
            {stationStates.map((state) => (
              <button key={state} onClick={() => onCommand(transitionCommand(state))}>
                {state}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h3>Equipos</h3>
          {switchIds.map((id) => (
            <div className="buttons" key={id} role="group" aria-label={switchNames[id]}>
              <span className="switch-name">{switchNames[id]}</span>
              <button onClick={() => onCommand(switchCommand(id, "open"))}>Abrir {id}</button>
              <button onClick={() => onCommand(switchCommand(id, "closed"))}>Cerrar {id}</button>
            </div>
          ))}
        </>
      )}

      <h3>Convertidor</h3>
      <div className="buttons">
        <button onClick={() => onCommand(deblockCommand())}>Desbloquear</button>
        <button onClick={() => onCommand(blockCommand())}>Bloquear</button>
      </div>

      <h3>Consigna de potencia</h3>
      <form
        className="buttons"
        onSubmit={(event) => {
          event.preventDefault(); // evita que el navegador recargue la página
          sendPowerOrder();
        }}
      >
        <input
          type="number"
          value={powerText}
          onChange={(event) => setPowerText(event.target.value)}
          placeholder="MW"
          aria-label="Consigna de potencia en MW"
        />
        <button type="submit">Enviar consigna</button>
      </form>
    </section>
  );
}
