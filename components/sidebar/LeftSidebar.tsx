'use client';

import { useCityPulseStore, selectTurnDateLabel } from '@/lib/store';
import CategoryNav from './CategoryNav';
import MiniMap from './MiniMap';
import { WeatherCondition } from '@/lib/types';
import { formatTemperature } from '@/lib/weather';

// ------ Weather icon mapping --------------------------------

function WeatherIcon({ condition }: { condition: WeatherCondition }) {
  const icons: Record<WeatherCondition, string> = {
    sunny: '☀️',
    partly_cloudy: '⛅',
    overcast: '☁️',
    rain: '🌧️',
    fog: '🌫️',
    snow: '❄️',
  };
  return <span className="text-base">{icons[condition]}</span>;
}

const conditionLabel: Record<WeatherCondition, string> = {
  sunny: 'Sunny',
  partly_cloudy: 'Partly Cloudy',
  overcast: 'Overcast',
  rain: 'Raining',
  fog: 'Foggy',
  snow: 'Snowing',
};

// ------ LeftSidebar -----------------------------------------

export default function LeftSidebar() {
  const dateLabel = useCityPulseStore(selectTurnDateLabel);
  const weather = useCityPulseStore(s => s.weather);

  return (
    <div
      className="flex flex-col gap-2 py-3 px-2 flex-shrink-0 overflow-y-auto"
      style={{
        width: 200,
        background: '#0A1628',
        borderRight: '1px solid #1E3050',
      }}
    >
      {/* Category Nav */}
      <CategoryNav />

      {/* Minimap */}
      <MiniMap />

      {/* Date + Weather */}
      <div
        className="rounded-xl px-3 py-2 mt-1"
        style={{ background: '#162236', border: '1px solid #1E3050' }}
      >
        <div className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>
          {dateLabel}
        </div>
        <div className="flex items-center gap-1.5">
          <WeatherIcon condition={weather.condition} />
          <span className="text-xs" style={{ color: '#64748B' }}>
            {conditionLabel[weather.condition]}
          </span>
          <span className="text-xs font-bold ml-auto" style={{ color: '#F0F4FA' }}>
            {formatTemperature(weather.tempC)}
          </span>
        </div>
      </div>
    </div>
  );
}
