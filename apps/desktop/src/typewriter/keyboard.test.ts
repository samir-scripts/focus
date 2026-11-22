import { describe, expect, it } from 'vitest';
import { keys } from './keyboard.json';
import { FloatClock } from './float';

it('maps every US physical key once in operator-left-to-right row order', () => {
  const rows = [
    'Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal',
    'KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP',
    'KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote',
    'ShiftLeft KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash ShiftRight',
    'Space',
  ];
  expect(keys.map(({ id, code, row, slot }) => [id, code, row, slot])).toEqual(
    rows.flatMap((codes, row) => codes.split(' ').map((code, slot) => [code, code, row, slot])),
  );
  expect(keys.filter(k => k.code.startsWith('Key')).map(k => k.legend).join('')).toBe('QWERTYUIOPASDFGHJKLZXCVBNM');
  expect(keys.filter(k => k.shifted).map(k => k.shifted).join('')).toBe('!@#$%^&*()_+:"<>?');
  expect(keys.filter(k => k.shifted).map(k => k.legend).join('')).toBe('1234567890-=;\',./');
});

describe('ambient float', () => {
  it('is centered at rest and peaks six CSS pixels in either direction once per six seconds', () => {
    const clock = new FloatClock();
    clock.set('offscreen', false, 100);
    expect(clock.offset(100)).toBe(0);
    expect(clock.offset(1600)).toBeCloseTo(6);
    expect(clock.offset(4600)).toBeCloseTo(-6);
    expect(clock.offset(6100)).toBeCloseTo(0);
  });

  it('holds the last presented position through overlapping pauses and resumes without a jump', () => {
    const clock = new FloatClock();
    clock.set('offscreen', false, 0);
    const shown = clock.offset(1000);
    clock.set('hidden', true, 1040);
    clock.set('toner', true, 1530);
    clock.set('hidden', false, 2000);
    expect(clock.running).toBe(false);
    expect(clock.offset(2500)).toBe(shown);
    clock.set('toner', false, 3000);
    expect(clock.offset(3000)).toBe(shown);
    expect(clock.offset(3500)).toBeCloseTo(6);
  });

  it('centers reduced motion even if toner was paused mid-bob', () => {
    const clock = new FloatClock();
    clock.set('offscreen', false, 0);
    expect(clock.offset(1500)).toBeCloseTo(6);
    clock.set('toner', true, 1500);
    clock.set('reduced', true, 1750);
    expect(clock.offset(2500)).toBe(0);
    expect(clock.running).toBe(false);
  });
});
