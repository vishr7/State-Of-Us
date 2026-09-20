import { expect, it } from 'vitest';
import { dailyWeather } from './weather';
it('keeps the opening clear and guarantees rain on day three', () => {
  expect(dailyWeather(1).condition).toBe('sunny');
  expect(dailyWeather(2).condition).toBe('sunny');
  expect(dailyWeather(3).condition).toBe('rain');
});
it('keeps forecasts stable and approximately ten percent rainy thereafter', () => {
  let count = 0;
  for (let day = 4; day < 10004; day++) {
    expect(dailyWeather(day, 'city')).toEqual(dailyWeather(day, 'city'));
    if (dailyWeather(day, 'city').condition === 'rain') count++;
  }
  expect(count).toBeGreaterThan(850);
  expect(count).toBeLessThan(1150);
});
