import { describe, expect, it } from "vitest";

import { screenKeyboardCommand } from "./screen-keyboard";

function event(
  input: Partial<KeyboardEvent> & Pick<KeyboardEvent, "code" | "key">,
): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...input,
  } as KeyboardEvent;
}

describe("screenKeyboardCommand", () => {
  it("injects printable keyboard input as text", () => {
    expect(screenKeyboardCommand(event({ code: "KeyA", key: "a" }), "down")).toEqual({
      type: "text",
      text: "a",
    });
    expect(screenKeyboardCommand(event({ code: "KeyA", key: "a" }), "up")).toBeNull();
  });

  it("uses Android key events for editing and shortcuts", () => {
    expect(
      screenKeyboardCommand(
        event({ code: "Backspace", key: "Backspace" }),
        "down",
      ),
    ).toMatchObject({ type: "key", keyCode: 67, action: "down" });
    expect(
      screenKeyboardCommand(
        event({ code: "KeyA", key: "a", ctrlKey: true }),
        "down",
      ),
    ).toMatchObject({ type: "key", keyCode: 29, metaState: 4096 });
  });

  it("does not duplicate IME composition key events", () => {
    expect(
      screenKeyboardCommand(
        event({ code: "KeyA", key: "a", isComposing: true }),
        "down",
      ),
    ).toBeNull();
  });
});
