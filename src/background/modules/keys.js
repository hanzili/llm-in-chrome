/**
 * Keyboard key definitions and input handling utilities.
 * Used for simulating keyboard input via Chrome DevTools Protocol.
 */

export const KEY_DEFINITIONS = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  f1: { key: 'F1', code: 'F1', keyCode: 112 },
  f2: { key: 'F2', code: 'F2', keyCode: 113 },
  f3: { key: 'F3', code: 'F3', keyCode: 114 },
  f4: { key: 'F4', code: 'F4', keyCode: 115 },
  f5: { key: 'F5', code: 'F5', keyCode: 116 },
  f6: { key: 'F6', code: 'F6', keyCode: 117 },
  f7: { key: 'F7', code: 'F7', keyCode: 118 },
  f8: { key: 'F8', code: 'F8', keyCode: 119 },
  f9: { key: 'F9', code: 'F9', keyCode: 120 },
  f10: { key: 'F10', code: 'F10', keyCode: 121 },
  f11: { key: 'F11', code: 'F11', keyCode: 122 },
  f12: { key: 'F12', code: 'F12', keyCode: 123 },
};

/**
 * Get key definition for a given key name
 */
export function getKeyCode(key) {
  const lowerKey = key.toLowerCase();
  const def = KEY_DEFINITIONS[lowerKey];
  if (def) return def;

  if (key.length === 1) {
    const upper = key.toUpperCase();
    let code;
    if (upper >= 'A' && upper <= 'Z') {
      code = `Key${upper}`;
    } else if (key >= '0' && key <= '9') {
      code = `Digit${key}`;
    } else {
      return null;
    }
    return { key, code, keyCode: upper.charCodeAt(0), text: key };
  }
  return null;
}

/**
 * Check if a character requires the shift key
 */
export function requiresShift(char) {
  return '~!@#$%^&*()_+{}|:"<>?'.includes(char) || (char >= 'A' && char <= 'Z');
}

/**
 * Press a single key with optional modifiers
 */
export async function pressKey(tabId, keyDef, modifiers = 0) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: keyDef.text ? 'keyDown' : 'rawKeyDown',
    key: keyDef.key,
    code: keyDef.code,
    windowsVirtualKeyCode: keyDef.keyCode,
    modifiers,
    text: keyDef.text || '',
    unmodifiedText: keyDef.text || '',
  });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyDef.key,
    code: keyDef.code,
    windowsVirtualKeyCode: keyDef.keyCode,
    modifiers,
  });
}

/**
 * Press a key chord (e.g., "ctrl+c", "cmd+shift+v")
 */
export async function pressKeyChord(tabId, chord) {
  const parts = chord.toLowerCase().split('+');
  let mainKey = '';
  const modMap = { alt: 1, option: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, command: 4, shift: 8 };
  let modifiers = 0;

  for (const part of parts) {
    if (modMap[part] !== undefined) {
      modifiers |= modMap[part];
    } else {
      mainKey = part;
    }
  }

  if (mainKey) {
    const keyDef = getKeyCode(mainKey);
    if (keyDef) await pressKey(tabId, keyDef, modifiers);
  }
}
