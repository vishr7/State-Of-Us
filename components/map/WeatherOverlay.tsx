'use client';
import { useCityPulseStore } from '@/lib/store';

export default function WeatherOverlay() {
  const weather = useCityPulseStore(s => s.weather);
  return <>
    {weather.condition === 'rain' && <div className="map-rain" aria-hidden="true">
      {Array.from({ length: 65 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${-(i % 17) * .19}s`, animationDuration: `${.65 + (i % 5) * .12}s`, opacity: .2 + (i % 4) * .12 }} />)}
    </div>}
    <div className="map-weather" role="status">{weather.condition === 'rain' ? '🌧 Rain' : '☀ Clear'} · {weather.tempC}°C</div>
  </>;
}
