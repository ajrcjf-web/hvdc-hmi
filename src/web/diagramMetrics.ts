// Lo que el unifilar necesita saber del navegador: el ancho de su lugar y el ancho de los
// textos con la fuente real. Son efectos del navegador, así que viven aquí y no en
// diagramLayout.ts (que es una función pura).

import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { estimateTextWidth, type TextWidth } from "./diagramLayout.ts";

// El ancho del elemento, que se vuelve a leer cuando cambia (ventana, panel de eventos).
// Antes de la primera medición vale 0: el layout usa entonces su ancho mínimo.
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export type TextMetrics = {
  fontPx: number; // el tamaño de las letras del dibujo: 1rem
  textWidth: TextWidth; // el ancho de un texto con la fuente real
};

function rootFontPx(): number {
  try {
    const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(size) && size > 0 ? size : 16;
  } catch {
    return 16;
  }
}

// Mide los textos con la fuente de la página. Si se mide antes de que la fuente termine de
// cargar, la medición es la de la fuente de reemplazo: por eso, cuando `document.fonts`
// avisa que terminó de cargar, se devuelve una función de medición nueva y el layout se
// recalcula.
export function useTextMetrics(): TextMetrics {
  const [fontsVersion, setFontsVersion] = useState(0);

  useLayoutEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (fonts === undefined) return;
    let active = true;
    const bump = () => {
      if (active) setFontsVersion((version) => version + 1);
    };
    fonts.ready.then(bump, () => undefined);
    fonts.addEventListener?.("loadingdone", bump);
    return () => {
      active = false;
      fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);

  // La función cambia cuando cambia la versión de las fuentes (fontsVersion).
  return useMemo(() => {
    void fontsVersion;
    const fontPx = rootFontPx();
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = document.createElement("canvas").getContext("2d");
    } catch {
      context = null;
    }
    if (context === null) return { fontPx, textWidth: estimateTextWidth(fontPx) };

    const family = getComputedStyle(document.body).fontFamily;
    const ctx = context;
    const textWidth: TextWidth = (text, bold) => {
      ctx.font = `${bold ? "bold " : ""}${fontPx}px ${family}`;
      return ctx.measureText(text).width;
    };
    return { fontPx, textWidth };
  }, [fontsVersion]);
}
