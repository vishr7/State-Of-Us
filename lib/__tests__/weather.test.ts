import { describe, expect, it } from 'vitest';
import { celsiusToFahrenheit, formatTemperature } from '../weather';

describe('temperature display', () => {
  it('converts Celsius to Fahrenheit', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(15)).toBe(59);
    expect(celsiusToFahrenheit(20)).toBe(68);
    expect(celsiusToFahrenheit(-4)).toBe(25);
    expect(celsiusToFahrenheit(100)).toBe(212);
  });
  it('formats with the unit', () => expect(formatTemperature(15)).toBe('59°F'));
});
