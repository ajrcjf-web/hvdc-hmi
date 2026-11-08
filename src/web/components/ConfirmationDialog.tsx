// Ventana de confirmación del select-before-operate. Solo muestra y despacha.
// Se verifica la orden en vivo en cada redibujo: si la estación cambió y la orden
// ya no vale, se muestra el motivo. El botón Ejecutar sigue activo: la lógica de
// control decide al ejecutar.
import { useEffect, useRef } from "react";
import { converterLabels, formatValue, modeLabels } from "../../labels.ts";
import type { Station, StationConfig } from "../../station.ts";
import { describeCommand, formatPowerOrder, remainingSeconds } from "../commandView.ts";
import type { Selection } from "../hmiState.ts";

type Props = {
  selection: Selection;
  station: Station;
  config: StationConfig;
  timeSeconds: number;
  onExecute: () => void;
  onCancel: () => void;
};

export function ConfirmationDialog({
  selection,
  station,
  config,
  timeSeconds,
  onExecute,
  onCancel,
}: Props) {
  // useRef guarda una referencia al elemento <dialog> real del navegador.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Al aparecer, se abre como ventana modal: bloquea el resto de la página y
  // el navegador se encarga del foco. La limpieza la cierra al desaparecer.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    // Cancelar tiene el foco inicial: un Enter sin querer no ejecuta la orden.
    cancelRef.current?.focus();
    return () => dialog.close();
  }, []);

  const view = describeCommand(selection.command, station, config);
  const seconds = remainingSeconds(selection.expiresAtSeconds, timeSeconds);

  return (
    <dialog
      ref={dialogRef}
      className="confirmation"
      aria-labelledby="confirmation-title"
      // Escape: el navegador lanza "cancel". Se evita que cierre la ventana por su
      // cuenta, y se despacha la acción: el estado manda, no el navegador.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirmation-title">Confirmar orden: {view.title}</h2>

      <dl className="values">
        <dt>Estado actual</dt>
        <dd>
          {view.current.state}, convertidor {converterLabels[view.current.converter]}
        </dd>
        <dt>Modo</dt>
        <dd>{modeLabels[view.current.mode]}</dd>
        <dt>Potencia</dt>
        <dd>
          P = {formatValue(view.current.powerMW, 0)} MW, consigna {view.current.powerOrderMW} MW
        </dd>
        {view.powerOrder !== null && (
          <>
            <dt>Consigna</dt>
            <dd>
              {formatPowerOrder(view.powerOrder.currentMW)} → {formatPowerOrder(view.powerOrder.newMW)}
            </dd>
          </>
        )}
        {view.modeChange !== null && (
          <>
            <dt>Cambio de modo</dt>
            <dd>
              {modeLabels[view.modeChange.from]} → {modeLabels[view.modeChange.to]}
            </dd>
          </>
        )}
        {view.switchOrder !== null && (
          <>
            <dt>Equipo</dt>
            <dd>
              {view.switchOrder.id}: {view.switchOrder.position} →{" "}
              {view.switchOrder.to === "open" ? "abierto" : "cerrado"}
            </dd>
          </>
        )}
        <dt>Resultado esperado</dt>
        <dd>{view.expected}</dd>
        <dt>Expira en</dt>
        <dd>{seconds} s</dd>
      </dl>

      {!view.check.ok && (
        <p className="invalid" role="alert">
          ✗ Con la estación actual esta orden sería rechazada: {view.check.reason}
        </p>
      )}

      <div className="buttons">
        <button onClick={onExecute}>Ejecutar</button>
        <button ref={cancelRef} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </dialog>
  );
}
