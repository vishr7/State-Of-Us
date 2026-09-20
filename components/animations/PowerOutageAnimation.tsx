'use client';

import { memo, useEffect, useId, useRef, useState } from 'react';
import { OUTAGE_LAMPS, OUTAGE_SECONDS, OUTAGE_WINDOWS, powerOutageFrame } from './powerOutageScene';
import styles from './PowerOutageAnimation.module.css';

export interface PowerOutageAnimationProps {
  width?: number | string;
  height?: number | string;
  autoPlay?: boolean;
  loop?: boolean;
  onComplete?: () => void;
  className?: string;
  showReplayButton?: boolean;
  showEmergencyLights?: boolean;
}

const Sprite = memo(function Sprite({ index, x, y, size }: { index: number; x: number; y: number; size: number }) {
  return <svg x={x} y={y} width={size} height={size} viewBox={`${index % 4 * 320} ${Math.floor(index / 4) * 320} 320 320`} overflow="hidden">
    <image href="/sprites/city-atlas.png" width="1280" height="1280" />
  </svg>;
});

export default function PowerOutageAnimation({ width = '100%', height = 'auto', autoPlay = true,
  loop = false, onComplete, className = '', showReplayButton = true, showEmergencyLights = true }: PowerOutageAnimationProps) {
  const id = useId();
  const callback = useRef(onComplete);
  const [play, setPlay] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState('Power available');
  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let completed = false;
    const running = autoPlay || play > 0;
    const finish = () => {
      setSeconds(OUTAGE_SECONDS); setStatus('Power outage');
      if (running && !completed) {
        completed = true;
        if (loop && !preference.matches) timer = setTimeout(() => setPlay(value => value + 1), 1400);
        callback.current?.();
      }
    };
    const onPreference = () => {
      if (preference.matches) { cancelAnimationFrame(raf); clearTimeout(timer); finish(); }
    };
    preference.addEventListener('change', onPreference);
    if (preference.matches) finish();
    else if (!running) { setSeconds(0); setStatus('Power available'); }
    else {
      setSeconds(0); setStatus('Power interruption');
      let start: number | undefined;
      const tick = (time: number) => {
        start ??= time;
        const elapsed = (time - start) / 1000;
        if (elapsed >= OUTAGE_SECONDS) finish();
        else { setSeconds(elapsed); raf = requestAnimationFrame(tick); }
      };
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); preference.removeEventListener('change', onPreference); };
  }, [autoPlay, loop, play]);

  const frame = powerOutageFrame(seconds);
  return <div className={`${styles.root} ${className}`} style={{ width }}>
    <svg className={styles.scene} style={{ height }} viewBox="0 0 360 280" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{`Neighborhood power outage — ${status.toLowerCase()}`}</title>
      <desc id={`${id}-description`}>Apartment windows and streetlamps lose power, leaving the block dark{showEmergencyLights ? ' with a small amber backup light' : ''}.</desc>
      <rect width="360" height="280" fill="#b9b8a5" />
      <path d="M0 149 180 59 360 149V280H0Z" fill="#718e51" />
      <path d="M0 215 180 125 360 215V259L180 169 0 259Z" fill="#bcb9a9" />
      <path d="M0 224 180 134 360 224V249L180 159 0 249Z" fill="#59616a" />
      <path d="M0 237 180 147 360 237" stroke="#d0cbb6" strokeWidth="2" strokeDasharray="10 10" fill="none" />
      <Sprite index={13} x={260} y={130} size={90} />
      <Sprite index={4} x={40} y={10} size={260} />
      {/* Twilight shading preserves facade texture; only local lights flicker. */}
      <rect width="360" height="280" fill="#0c1d34" opacity={frame.shade} />
      <g transform="translate(40 10) scale(.8125)">
        {OUTAGE_WINDOWS.map((window, index) => <g key={index} transform={`translate(${window.x} ${window.y})`}>
          <path d={`M0 0l7 ${window.side * 3}v14l-7 ${-window.side * 3}Z`} fill="#172b38" opacity=".8" />
          <g opacity={frame.windows[index]}>
            <path d={`M0 0l7 ${window.side * 3}v14l-7 ${-window.side * 3}Z`} fill="#e8bb64" />
            <path d={`M1 2l2 ${window.side}v10l-2 ${-window.side}Z`} fill="#f3dba1" />
            <path d={`M0 7l7 ${window.side * 3}`} stroke="#8d774d" strokeWidth="1" />
          </g>
        </g>)}
      </g>
      <g transform="translate(40 10) scale(.8125)">
        {OUTAGE_LAMPS.map((lamp, index) => <g key={index} transform={`translate(${lamp.x} ${lamp.y})`}>
          <path d="M-13 33 0 27 13 33 0 39Z" fill="#e8c372" opacity={frame.lamps[index] * .12} />
          <path d="M-3-4h6v8h-6Z" fill="#172c3b" />
          <path d="M-3-4h6v8h-6Z" fill="#edcf86" opacity={frame.lamps[index]} />
        </g>)}
      </g>
      {/* Compact utility box uses the map's slate/steel palette. */}
      <g transform="translate(297 236)">
        <path d="M0-23 9-27 18-23 9-19Z" fill="#65736e" />
        <path d="M0-23 9-19V0L0-4Z" fill="#43534f" />
        <path d="M9-19 18-23V-4L9 0Z" fill="#283b3e" />
        <path d="M3-17v8m3-7v8" stroke="#253637" />
        <path d="M10-27v-4m5 5 3-3m-10 2-3-3" stroke="#eed9a0" strokeWidth="2" opacity={frame.spark} />
      </g>
      {showEmergencyLights && <g opacity={frame.backup} aria-hidden="true">
        <path d="M221 220 235 227 221 234 207 227Z" fill="#d69a48" opacity=".12" />
        <path d="M221 204h5v4h-5Z" fill="#6d5032" />
        <path d="M222 205h3v2h-3Z" fill="#edb85e" />
      </g>}
    </svg>
    <div className={showReplayButton ? styles.controls : styles.status}>
      <span role="status" aria-live="polite">{status}</span>
      {showReplayButton && <button type="button" className={styles.button} onClick={() => setPlay(value => value + 1)}>
        {status === 'Power available' ? 'Start outage' : 'Replay animation'}
      </button>}
    </div>
  </div>;
}
