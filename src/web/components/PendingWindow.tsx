// Ventana que todavía no tiene contenido: dice cuándo llega.
import { windowInfo, type WindowId } from "../windows.ts";

type Props = {
  id: WindowId;
};

export function PendingWindow({ id }: Props) {
  const info = windowInfo(id);
  return (
    <section className="panel">
      <h1>{info.label}</h1>
      <p className="empty">Ventana pendiente: llega en la subfase {info.subphase}.</p>
    </section>
  );
}
