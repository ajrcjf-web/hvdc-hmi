import { describe, expect, test, vi } from "vitest";
import { guardedProps } from "./guardedButton.ts";

const event = (key?: string) => ({ ...(key === undefined ? {} : { key }), preventDefault: vi.fn() });

describe("guardedProps: botón apagado (aria-disabled)", () => {
  test("se marca como deshabilitado para los lectores de pantalla", () => {
    expect(guardedProps(true, () => undefined)["aria-disabled"]).toBe(true);
    expect(guardedProps(false, () => undefined)["aria-disabled"]).toBeUndefined();
  });

  test("ignora el clic", () => {
    const onActivate = vi.fn();
    const e = event();
    guardedProps(true, onActivate).onClick(e);
    expect(onActivate).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  test("ignora Enter: se anula al bajar la tecla, antes de que sea un clic", () => {
    const onActivate = vi.fn();
    const e = event("Enter");
    const props = guardedProps(true, onActivate);
    props.onKeyDown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  test("ignora la barra espaciadora: se anula al bajarla y al soltarla", () => {
    const onActivate = vi.fn();
    const down = event(" ");
    const up = event(" ");
    const props = guardedProps(true, onActivate);
    props.onKeyDown(down);
    props.onKeyUp(up);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(up.preventDefault).toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  test("las demás teclas no se tocan (Tab sigue moviendo el foco)", () => {
    const props = guardedProps(true, () => undefined);
    for (const key of ["Tab", "Escape", "ArrowDown", "a"]) {
      const down = event(key);
      const up = event(key);
      props.onKeyDown(down);
      props.onKeyUp(up);
      expect(down.preventDefault, key).not.toHaveBeenCalled();
      expect(up.preventDefault, key).not.toHaveBeenCalled();
    }
  });

  test("habilitado: el clic ejecuta la acción y no se anula nada", () => {
    const onActivate = vi.fn();
    const props = guardedProps(false, onActivate);
    const click = event();
    const enter = event("Enter");
    const space = event(" ");
    props.onClick(click);
    props.onKeyDown(enter);
    props.onKeyUp(space);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(click.preventDefault).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled(); // Enter debe poder activar el botón
    expect(space.preventDefault).not.toHaveBeenCalled(); // y la barra espaciadora también
  });

  test("la acción se pierde solo mientras está apagado: al habilitarse vuelve a funcionar", () => {
    const onActivate = vi.fn();
    guardedProps(true, onActivate).onClick(event());
    guardedProps(false, onActivate).onClick(event());
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
