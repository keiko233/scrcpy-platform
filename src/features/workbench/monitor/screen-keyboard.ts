import {
  AndroidKeyCode,
  AndroidKeyEventMeta,
} from "@yume-chan/scrcpy";

import type { InjectScreenKeyboardInput } from "@/shared/screen-contracts";

type KeyboardEventLike = Pick<
  KeyboardEvent,
  | "altKey"
  | "code"
  | "ctrlKey"
  | "isComposing"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>;

type ScreenKeyCommand = InjectScreenKeyboardInput extends infer Input
  ? Input extends { displayId: number }
    ? Omit<Input, "displayId">
    : never
  : never;

const CODE_TO_KEY_CODE: Record<string, AndroidKeyCode> = {
  Digit0: AndroidKeyCode.Digit0,
  Digit1: AndroidKeyCode.Digit1,
  Digit2: AndroidKeyCode.Digit2,
  Digit3: AndroidKeyCode.Digit3,
  Digit4: AndroidKeyCode.Digit4,
  Digit5: AndroidKeyCode.Digit5,
  Digit6: AndroidKeyCode.Digit6,
  Digit7: AndroidKeyCode.Digit7,
  Digit8: AndroidKeyCode.Digit8,
  Digit9: AndroidKeyCode.Digit9,
  KeyA: AndroidKeyCode.KeyA,
  KeyB: AndroidKeyCode.KeyB,
  KeyC: AndroidKeyCode.KeyC,
  KeyD: AndroidKeyCode.KeyD,
  KeyE: AndroidKeyCode.KeyE,
  KeyF: AndroidKeyCode.KeyF,
  KeyG: AndroidKeyCode.KeyG,
  KeyH: AndroidKeyCode.KeyH,
  KeyI: AndroidKeyCode.KeyI,
  KeyJ: AndroidKeyCode.KeyJ,
  KeyK: AndroidKeyCode.KeyK,
  KeyL: AndroidKeyCode.KeyL,
  KeyM: AndroidKeyCode.KeyM,
  KeyN: AndroidKeyCode.KeyN,
  KeyO: AndroidKeyCode.KeyO,
  KeyP: AndroidKeyCode.KeyP,
  KeyQ: AndroidKeyCode.KeyQ,
  KeyR: AndroidKeyCode.KeyR,
  KeyS: AndroidKeyCode.KeyS,
  KeyT: AndroidKeyCode.KeyT,
  KeyU: AndroidKeyCode.KeyU,
  KeyV: AndroidKeyCode.KeyV,
  KeyW: AndroidKeyCode.KeyW,
  KeyX: AndroidKeyCode.KeyX,
  KeyY: AndroidKeyCode.KeyY,
  KeyZ: AndroidKeyCode.KeyZ,
  Numpad0: AndroidKeyCode.Numpad0,
  Numpad1: AndroidKeyCode.Numpad1,
  Numpad2: AndroidKeyCode.Numpad2,
  Numpad3: AndroidKeyCode.Numpad3,
  Numpad4: AndroidKeyCode.Numpad4,
  Numpad5: AndroidKeyCode.Numpad5,
  Numpad6: AndroidKeyCode.Numpad6,
  Numpad7: AndroidKeyCode.Numpad7,
  Numpad8: AndroidKeyCode.Numpad8,
  Numpad9: AndroidKeyCode.Numpad9,
  NumpadAdd: AndroidKeyCode.NumpadAdd,
  NumpadSubtract: AndroidKeyCode.NumpadSubtract,
  NumpadMultiply: AndroidKeyCode.NumpadMultiply,
  NumpadDivide: AndroidKeyCode.NumpadDivide,
  NumpadDecimal: AndroidKeyCode.NumpadDecimal,
  NumpadEnter: AndroidKeyCode.NumpadEnter,
  NumpadEqual: AndroidKeyCode.NumpadEquals,
  ArrowDown: AndroidKeyCode.ArrowDown,
  ArrowLeft: AndroidKeyCode.ArrowLeft,
  ArrowRight: AndroidKeyCode.ArrowRight,
  ArrowUp: AndroidKeyCode.ArrowUp,
  Backquote: AndroidKeyCode.Backquote,
  Backslash: AndroidKeyCode.Backslash,
  BracketLeft: AndroidKeyCode.BracketLeft,
  BracketRight: AndroidKeyCode.BracketRight,
  Comma: AndroidKeyCode.Comma,
  Equal: AndroidKeyCode.Equal,
  Minus: AndroidKeyCode.Minus,
  Period: AndroidKeyCode.Period,
  Quote: AndroidKeyCode.Quote,
  Semicolon: AndroidKeyCode.Semicolon,
  Slash: AndroidKeyCode.Slash,
  AltLeft: AndroidKeyCode.AltLeft,
  AltRight: AndroidKeyCode.AltRight,
  Backspace: AndroidKeyCode.Backspace,
  CapsLock: AndroidKeyCode.CapsLock,
  ControlLeft: AndroidKeyCode.ControlLeft,
  ControlRight: AndroidKeyCode.ControlRight,
  Delete: AndroidKeyCode.Delete,
  End: AndroidKeyCode.End,
  Enter: AndroidKeyCode.Enter,
  Escape: AndroidKeyCode.Escape,
  F1: AndroidKeyCode.F1,
  F2: AndroidKeyCode.F2,
  F3: AndroidKeyCode.F3,
  F4: AndroidKeyCode.F4,
  F5: AndroidKeyCode.F5,
  F6: AndroidKeyCode.F6,
  F7: AndroidKeyCode.F7,
  F8: AndroidKeyCode.F8,
  F9: AndroidKeyCode.F9,
  F10: AndroidKeyCode.F10,
  F11: AndroidKeyCode.F11,
  F12: AndroidKeyCode.F12,
  Home: AndroidKeyCode.Home,
  Insert: AndroidKeyCode.Insert,
  MetaLeft: AndroidKeyCode.MetaLeft,
  MetaRight: AndroidKeyCode.MetaRight,
  PageDown: AndroidKeyCode.PageDown,
  PageUp: AndroidKeyCode.PageUp,
  ShiftLeft: AndroidKeyCode.ShiftLeft,
  ShiftRight: AndroidKeyCode.ShiftRight,
  Space: AndroidKeyCode.Space,
  Tab: AndroidKeyCode.Tab,
};

function metaState(event: KeyboardEventLike): number {
  let value = AndroidKeyEventMeta.None;
  if (event.altKey) value |= AndroidKeyEventMeta.Alt;
  if (event.ctrlKey) value |= AndroidKeyEventMeta.Ctrl;
  if (event.metaKey) value |= AndroidKeyEventMeta.Meta;
  if (event.shiftKey) value |= AndroidKeyEventMeta.Shift;
  if (event.code === "AltLeft") value |= AndroidKeyEventMeta.AltLeft;
  if (event.code === "AltRight") value |= AndroidKeyEventMeta.AltRight;
  if (event.code === "ControlLeft") value |= AndroidKeyEventMeta.CtrlLeft;
  if (event.code === "ControlRight") value |= AndroidKeyEventMeta.CtrlRight;
  if (event.code === "MetaLeft") value |= AndroidKeyEventMeta.MetaLeft;
  if (event.code === "MetaRight") value |= AndroidKeyEventMeta.MetaRight;
  if (event.code === "ShiftLeft") value |= AndroidKeyEventMeta.ShiftLeft;
  if (event.code === "ShiftRight") value |= AndroidKeyEventMeta.ShiftRight;
  return value;
}

export function screenKeyboardCommand(
  event: KeyboardEventLike,
  action: "down" | "up",
): ScreenKeyCommand | null {
  if (event.isComposing || event.key === "Dead") {
    return null;
  }

  const keyCode = CODE_TO_KEY_CODE[event.code];
  const hasShortcutModifier = event.ctrlKey || event.metaKey || event.altKey;
  const isTextInput =
    event.key.length > 0 && event.key.length <= 2 && !hasShortcutModifier;
  if (isTextInput) {
    return action === "down" ? { type: "text", text: event.key } : null;
  }
  if (keyCode === undefined) {
    return null;
  }
  return {
    type: "key",
    action,
    keyCode,
    repeat: action === "down" && event.repeat ? 1 : 0,
    metaState: metaState(event),
  };
}
