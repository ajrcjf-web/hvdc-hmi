// Los mandos del operador. Los botones siempre están activos: si la orden no es
// válida, la lógica de control la rechaza y el motivo aparece en el registro
// (los enclavamientos viven en el control, no en la interfaz).
// Un botón no ejecuta la orden: la selecciona, y se confirma en la ventana de confirmación.
import { useState } from "react";
import { stationStates } from "../../stationState.ts";
import {
  blockCommand,
  deblockCommand,
  powerOrderCommand,
  transitionCommand,
  type OperatorCommand,
} from "../commands.ts";

type Props = {
  onCommand: (command: OperatorCommand) => void; // selecciona la orden (aún no la ejecuta)
  notice: string | null; // por qué no se pudo seleccionar la última orden
};

export function CommandPanel({ onCommand, notice }: Props) {
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

      <h3>Estado de la estación</h3>
      <div className="buttons">
        {stationStates.map((state) => (
          <button key={state} onClick={() => onCommand(transitionCommand(state))}>
            {state}
          </button>
        ))}
      </div>

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
