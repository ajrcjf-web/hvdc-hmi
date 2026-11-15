// El texto del indicador de alarmas y los textos que reservan su ancho.
import { describe, expect, test } from "vitest";
import { alarmCodes } from "../alarms.ts";
import {
  describeAlarmSummary,
  formatAlarmSummary,
  UNACKNOWLEDGED_SYMBOL,
  widestAlarmSummaryTexts,
  type AlarmSummary,
} from "./alarmView.ts";

const summary = (s: Partial<AlarmSummary>): AlarmSummary => ({
  count: 1,
  unacknowledged: 1,
  highest: "urgent",
  blinking: true,
  ...s,
});

describe("formatAlarmSummary", () => {
  test("sin alarmas", () => {
    expect(
      formatAlarmSummary({ count: 0, unacknowledged: 0, highest: null, blinking: false }),
    ).toBe("Sin alarmas");
  });

  test("lo no reconocido lleva el símbolo; lo reconocido, no", () => {
    expect(formatAlarmSummary(summary({ count: 2, highest: "high" }))).toBe(
      `${UNACKNOWLEDGED_SYMBOL} 2 alarmas · !! Alta`,
    );
    expect(formatAlarmSummary(summary({ count: 1, highest: "low", blinking: false }))).toBe(
      "1 alarma · ! Baja",
    );
  });
});

describe("widestAlarmSummaryTexts: los textos que reservan el ancho del indicador", () => {
  const max = alarmCodes.length;
  const reserved = widestAlarmSummaryTexts(max);

  test("incluye \"Sin alarmas\" y, por cada prioridad, la cantidad máxima con el símbolo", () => {
    expect(reserved).toEqual([
      "Sin alarmas",
      `${UNACKNOWLEDGED_SYMBOL} ${max} alarmas · !!! Urgente`,
      `${UNACKNOWLEDGED_SYMBOL} ${max} alarmas · !! Alta`,
      `${UNACKNOWLEDGED_SYMBOL} ${max} alarmas · ! Baja`,
    ]);
  });

  test("ningún texto real que pueda mostrar el indicador es más largo que el más largo reservado", () => {
    const longest = Math.max(...reserved.map((text) => text.length));
    for (let count = 0; count <= max; count++) {
      for (const highest of [null, "urgent", "high", "low"] as const) {
        for (const blinking of [true, false]) {
          if ((count === 0) !== (highest === null)) continue; // sin alarmas no hay prioridad
          const text = formatAlarmSummary({
            count,
            unacknowledged: blinking ? count : 0,
            highest,
            blinking: blinking && count > 0,
          });
          expect(text.length).toBeLessThanOrEqual(longest);
        }
      }
    }
  });

  test("usa la cantidad de alarmas que existen, así que crece con ellas", () => {
    expect(widestAlarmSummaryTexts(12)[1]).toContain("12 alarmas");
  });

  test("se generan con el mismo texto que el indicador real", () => {
    expect(reserved[1]).toBe(
      formatAlarmSummary({ count: max, unacknowledged: max, highest: "urgent", blinking: true }),
    );
    expect(reserved[0]).toBe(
      describeAlarmSummary({ count: 0, unacknowledged: 0, highest: null, blinking: false }),
    );
  });
});
