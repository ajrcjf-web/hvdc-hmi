// Ventana de confirmación del select-before-operate. Solo muestra y despacha.
// Se verifica la orden en vivo en cada redibujo: si la estación cambió y la orden
// ya no vale, se muestra el motivo. El botón Ejecutar sigue activo: la lógica de
// control decide al ejecutar.
import { useEffect, useRef, useState } from "react";
import { converterLabels, formatValue, modeLabels } from "../../labels.ts";
import type { Station, StationConfig } from "../../station.ts";
import {
  describeCommand,
  enterHint,
  formatPowerOrder,
  remainingSeconds,
  type ConfirmationButton,
} from "../commandView.ts";
import { focusTarget } from "../focus.ts";
import type { Selection } from "../hmiState.ts";

// Al cerrarse la ventana, el foco vuelve al botón que la abrió. Si ese botón ya no está (por
// ejemplo, la orden cambió el modo y el botón fue reemplazado) o no puede recibir el foco, va
// al título de la ventana activa: nunca queda en el vacío.
function restoreFocus(opener: HTMLElement | null): void {
  const heading = document.querySelector<HTMLElement>("main h1");
  const target = focusTarget(opener, heading);
  if (target === null) return;
  if (target === heading) target.setAttribute("tabindex", "-1"); // enfocable solo por programa
  target.focus();
  if (document.activeElement !== target && heading !== null) {
    heading.setAttribute("tabindex", "-1");
    heading.focus();
  }
}

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
  // Qué botón tiene el foco: Enter activa ese. Empieza en Cancelar.
  const [focused, setFocused] = useState<ConfirmationButton | null>("cancel");

  // Al aparecer, se abre como ventana modal: bloquea el resto de la página. La limpieza la
  // cierra al desaparecer (se ejecute, se cancele, Escape o expire) y devuelve el foco al
  // botón que la abrió.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    // El elemento enfocado antes de abrir es el botón que abrió la ventana (en algunos
    // navegadores un clic no enfoca el botón: entonces es el body, y no cuenta).
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    if (!dialog.open) dialog.showModal();
    // Cancelar tiene el foco inicial: un Enter sin querer no ejecuta la orden.
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      restoreFocus(opener);
    };
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
        <button onClick={onExecute} onFocus={() => setFocused("execute")}>
          Ejecutar
        </button>
        <button ref={cancelRef} onClick={onCancel} onFocus={() => setFocused("cancel")}>
          Cancelar
        </button>
      </div>
      <p className="enter-hint">{enterHint(focused)}</p>
    </dialog>
  );
}
