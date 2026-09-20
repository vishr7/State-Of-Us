'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { drawCitizen } from '../map/residentWalkers';
import { PROTESTORS, PROTEST_SECONDS, protestFrame } from './protestScene';
import styles from './ProtestEventAnimation.module.css';

export interface ProtestEventAnimationProps {
  width?: number | string;
  height?: number | string;
  autoPlay?: boolean;
  loop?: boolean;
  onComplete?: () => void;
  className?: string;
  showReplayButton?: boolean;
}

function Sprite({ index, x, y, size }: { index: number; x: number; y: number; size: number }) {
  return <svg x={x} y={y} width={size} height={size} viewBox={`${index % 4 * 320} ${Math.floor(index / 4) * 320} 320 320`} overflow="hidden">
    <image href="/sprites/city-atlas.png" width="1280" height="1280" />
  </svg>;
}

function paintCrowd(ctx: CanvasRenderingContext2D, seconds: number) {
  ctx.clearRect(0, 0, 360, 280);
  PROTESTORS.forEach((person, index) => {
    const frame = protestFrame(seconds, index);
    ctx.save(); ctx.globalAlpha = frame.opacity;
    ctx.translate(frame.x, frame.y); ctx.scale(1.65, 1.65);
    ctx.save(); ctx.scale(person.facing, 1);
    drawCitizen(ctx, `protest-citizen-${index}`, person.color, frame.stride);
    ctx.restore();
    if (person.sign >= 0) {
      ctx.save(); ctx.translate(3, -6); ctx.rotate(frame.wave);
      ctx.globalAlpha *= frame.raise;
      ctx.translate(0, 7 * (1 - frame.raise));
      ctx.fillStyle = '#70533b'; ctx.fillRect(0, -20, 1.3, 21);
      ctx.fillStyle = '#675b49'; ctx.fillRect(-7, -25, 17, 11);
      ctx.fillStyle = person.sign === 1 ? '#e8c372' : '#eee3c9'; ctx.fillRect(-6, -24, 15, 9);
      ctx.fillStyle = '#40554e';
      // Large, wordless pixel symbols: equality, a home, and a heart.
      if (person.sign === 0) { ctx.fillRect(-3, -22, 9, 2); ctx.fillRect(-3, -18, 9, 2); }
      else if (person.sign === 1) {
        ctx.fillRect(-3, -20, 9, 4); ctx.fillRect(-1, -22, 5, 2); ctx.fillRect(1, -23, 1, 1);
        ctx.fillStyle = '#e8c372'; ctx.fillRect(0, -19, 2, 3);
      } else { ctx.fillRect(-3, -22, 3, 3); ctx.fillRect(2, -22, 3, 3); ctx.fillRect(-2, -20, 6, 2); ctx.fillRect(0, -18, 2, 2); }
      ctx.restore();
    }
    ctx.restore();
  });
}

export default function ProtestEventAnimation({ width = '100%', height = 'auto', autoPlay = true,
  loop = false, onComplete, className = '', showReplayButton = true }: ProtestEventAnimationProps) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onComplete);
  const [play, setPlay] = useState(0);
  const [status, setStatus] = useState('Ready to gather');
  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    // Fixed backing coordinates also keep the canvas aligned with SVG letterboxing.
    element.width = 1080; element.height = 840;
    ctx.scale(3, 3);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let completed = false;
    const running = autoPlay || play > 0;
    const finish = () => {
      paintCrowd(ctx, PROTEST_SECONDS); setStatus('Citizens gathered in protest');
      if (running && !completed) {
        completed = true;
        if (loop && !preference.matches) timer = setTimeout(() => setPlay(value => value + 1), 1200);
        callback.current?.();
      }
    };
    const onPreference = () => {
      if (preference.matches) { cancelAnimationFrame(raf); clearTimeout(timer); finish(); }
    };
    preference.addEventListener('change', onPreference);
    if (preference.matches) finish();
    else if (!running) { paintCrowd(ctx, 0); setStatus('Ready to gather'); }
    else {
      setStatus('Citizens gathering');
      let start: number | undefined;
      const tick = (time: number) => {
        start ??= time;
        const seconds = (time - start) / 1000;
        paintCrowd(ctx, seconds);
        if (seconds >= PROTEST_SECONDS) finish();
        else raf = requestAnimationFrame(tick);
      };
      paintCrowd(ctx, 0);
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); preference.removeEventListener('change', onPreference); };
  }, [autoPlay, loop, play]);

  return <div className={`${styles.root} ${className}`} style={{ width }}>
    <div className={styles.scene} style={{ height }} role="img" aria-labelledby={`${id}-title`}>
      <svg className={styles.art} viewBox="0 0 360 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect width="360" height="280" fill="#d4d1bc" />
        <path d="M0 155 180 65 360 155V280H0Z" fill="#718e51" />
        <path d="M0 205 180 115 360 205V250L180 160 0 250Z" fill="#bcb9a9" />
        <path d="M0 216 180 126 360 216V240L180 150 0 240Z" fill="#59616a" />
        <path d="M0 228 180 138 360 228" stroke="#d0cbb6" strokeWidth="2" strokeDasharray="10 10" fill="none" />
        <Sprite index={12} x={9} y={77} size={100} />
        <Sprite index={6} x={260} y={86} size={94} />
        <path d="M43 226 180 158 324 228 230 275 135 272Z" fill="#b4a58e" stroke="#e2d6ba" strokeWidth="3" />
        <Sprite index={14} x={81} y={12} size={208} />
      </svg>
      <canvas ref={canvas} className={styles.crowd} width={1080} height={840} aria-hidden="true" />
      <span id={`${id}-title`} className={styles.status}>Citizens with protest signs outside the civic hall. {status}.</span>
    </div>
    <div className={showReplayButton ? styles.controls : styles.status}>
      <span role="status" aria-live="polite">{status}</span>
      {showReplayButton && <button type="button" className={styles.button} onClick={() => setPlay(value => value + 1)}>
        {status === 'Ready to gather' ? 'Start protest' : 'Replay animation'}
      </button>}
    </div>
  </div>;
}
