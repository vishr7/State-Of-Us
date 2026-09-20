'use client';

import { memo, useEffect, useId, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { demolitionFrame, DEMOLITION_SECONDS, IMPACT_PROGRESS, BUILDING_PIECES } from './demolitionScene';
import styles from './WreckingBallDemolition.module.css';

export interface WreckingBallDemolitionProps {
  width?: number | string;
  height?: number | string;
  autoPlay?: boolean;
  loop?: boolean;
  onImpact?: () => void;
  onComplete?: () => void;
  className?: string;
  showReplayButton?: boolean;
}

/** Same 4x4 atlas cells as CityCanvas; viewBox crops without copying or modifying art. */
const Sprite = memo(function Sprite({ index, x, y, size }: { index: number; x: number; y: number; size: number }) {
  return <svg x={x} y={y} width={size} height={size} viewBox={`${index % 4 * 320} ${Math.floor(index / 4) * 320} 320 320`} overflow="hidden">
    <image href="/sprites/city-atlas.png" width="1280" height="1280" />
  </svg>;
});

export default function WreckingBallDemolition({ width = '100%', height = 'auto', autoPlay = true, loop = false,
  onImpact, onComplete, className, showReplayButton = true }: WreckingBallDemolitionProps) {
  const id = useId();
  // Browser preferences are deliberately unread until the hydration commit.
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [play, setPlay] = useState(0);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'fall' | 'impact' | 'complete'>('ready');
  const callbacks = useRef({ onImpact, onComplete });
  useEffect(() => { callbacks.current = { onImpact, onComplete }; }, [onImpact, onComplete]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(preference.matches);
    // Read once per mount: changing OS settings cannot restart an in-flight play or double callbacks.
  }, []);
  const running = autoPlay || play > 0;
  useEffect(() => {
    if (reduced === null) return;
    if (!running) { setProgress(0); setPhase('ready'); return; }
    setProgress(reduced ? 1 : 0);
    setPhase('fall');
    let impacted = false;
    let replay: ReturnType<typeof setTimeout> | undefined;
    const playback = animate(0, 1, {
      duration: reduced ? .15 : DEMOLITION_SECONDS, ease: 'linear',
      onUpdate: (value) => {
        if (!reduced) setProgress(value);
        if (!impacted && value >= IMPACT_PROGRESS) {
          impacted = true; setPhase('impact'); callbacks.current.onImpact?.();
        }
      },
      onComplete: () => {
        setProgress(1); setPhase('complete');
        if (loop && !reduced) replay = setTimeout(() => setPlay((value) => value + 1), 1000);
        callbacks.current.onComplete?.();
      },
    });
    return () => { playback.stop(); clearTimeout(replay); };
  }, [running, play, reduced, loop]);

  const frame = demolitionFrame(progress);
  const status = phase === 'complete' ? 'Demolition complete' : phase === 'impact' ? 'Building coming down' : phase === 'fall' ? 'Demolition in progress' : 'Ready for demolition';
  return <div className={`${styles.root} ${className ?? ''}`} style={{ width, maxWidth: '100%' }}>
    <svg className={styles.scene} viewBox="235 0 430 395" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby={`${id}-title`} style={{ width: '100%', height }}>
      <title id={`${id}-title`}>{`Wrecking ball demolition — ${status.toLowerCase()}`}</title>
      <defs>
        {BUILDING_PIECES.map((piece, part) => <clipPath id={`${id}-part-${part}`} key={part}><rect x={piece.x} y={piece.y} width={piece.width} height={piece.height} /></clipPath>)}
        <clipPath id={`${id}-base`}><rect x="350" y="319" width="270" height="51" /></clipPath>
      </defs>
      <rect width="720" height="440" fill="#d4d1bc" />
      <path d="M0 275L360 95 720 275 360 455Z" fill="#718e51" stroke="#647c4b" strokeWidth="2" />
      <path d="M0 306L360 126 720 306 720 342 360 162 0 342Z" fill="#bcb9a9" />
      <path d="M0 314L360 134 720 314 720 333 360 153 0 333Z" fill="#59616a" />
      <path d="M0 325L360 145 720 325" fill="none" stroke="#d0cbb6" strokeWidth="2" strokeDasharray="13 12" />
      <Sprite index={12} x={240} y={130} size={130} />
      <Sprite index={6} x={519} y={64} size={164} />
      <Sprite index={13} x={270} y={48} size={120} />
      <path d="M280 314l180-90 204 102-180 90Z" fill="#b4a58e" stroke="#e2d6ba" strokeWidth="5" />
      <path d="M298 315l166-82 180 91-164 82Z" fill="#a1967f" />

      {/* Preserve the original sidewalk/landscaping while six facade sections detach progressively. */}
      <g clipPath={`url(#${id}-base)`}><Sprite index={4} x={350} y={100} size={270} /></g>
      <g transform={`translate(0 ${319 * frame.compression}) scale(1 ${1 - frame.compression})`}>
      {BUILDING_PIECES.map((piece, part) => <g key={part} opacity={frame.parts[part].opacity}
        transform={`translate(${frame.shake + frame.parts[part].x} ${frame.parts[part].y}) rotate(${frame.parts[part].rotate} ${piece.x + piece.width / 2} ${piece.y + piece.height})`}>
        <g clipPath={`url(#${id}-part-${part})`}><Sprite index={4} x={350} y={100} size={270} /></g>
      </g>)}
      </g>
      <path d="M478 150l-13 27 11 15-23 25 11 18-21 25 12 21-10 32" stroke="#483f3b" strokeWidth="3" fill="none" opacity={frame.crack} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - frame.crack} />
      <g opacity={frame.rubble} transform={`translate(0 ${frame.settle})`}>
        <path d="M381 329l29-28 29 7 22-31 28 27 29-12 38 32-72 36Z" fill="#8b7e70" stroke="#635e57" strokeWidth="2" />
        {Array.from({ length: 20 }, (_, i) => {
          const x = 389 + i % 5 * 30 + (Math.floor(i / 5) % 2) * 10;
          const y = 313 + Math.floor(i / 5) * 9 - i % 3 * 8;
          return <g key={i}><path d={`M${x} ${y}l12-6 13 6-12 6Z`} fill={i % 3 ? '#bc8c67' : '#838d98'} />
            <path d={`M${x} ${y}v7l13 6v-7Zm13 6 12-6v7l-12 6Z`} fill={i % 3 ? '#88664f' : '#56616e'} /></g>;
        })}
        <path d="M438 301l25-16 21 12-26 17Z" fill="#65758a" stroke="#b7b8ad" strokeWidth="2" />
        <path d="M443 298l21-9m-16 15 21-10" stroke="#8c99a6" strokeWidth="2" />
      </g>

      {/* One heavy steel ball, translated vertically through impact and settling. */}
      <g transform={`translate(${frame.ball.x} ${frame.ball.y})`}>
        <path d="M-16-28h32l12 12v32L16 28h-32l-12-12v-32Z" fill="#34414c" stroke="#202c35" strokeWidth="3" />
        <path d="M-23-14l10-10H9L-5-15-17 4h-8Z" fill="#849398" />
        <path d="M3 24h11l10-10V-5" fill="none" stroke="#526472" strokeWidth="5" />
        <path d="M-15-18h11m-16 6h7" stroke="#bdc5bf" strokeWidth="3" />
      </g>
      <path d="M444 149l-14-9m20 19-20 3m80-13 14-9m-17 20 18 4" stroke="#f0d9a2" strokeWidth="4" opacity={frame.flash} />
      {frame.debris.map((piece, i) => <path key={i} d="M0 0l7-3 5 4-7 3Z" fill={i % 2 ? '#b48463' : '#7c8693'} opacity={piece.opacity}
        transform={`translate(${piece.x} ${piece.y}) rotate(${piece.rotate})`} />)}
      {[0, 1, 2, 3, 4, 5].map((i) => <g key={i} opacity={frame.dust * .65} transform={`translate(${371 + i * 31 + (i - 2) * frame.scatter * 8} ${316 - frame.scatter * 31 - i % 2 * 11}) scale(${.5 + frame.scatter})`}>
        <path d="M-24-8h8v-9h24v5h12v10h7v19H14v7h-29v-7h-13V-1h4Z" fill={i % 2 ? '#c5b394' : '#d8c8a8'} />
        <path d="M-16-7h10v-5H8v6h-9v5h-15Z" fill="#e3d6b8" />
      </g>)}
      <path d="M346 350l37 19m180-17 37-19" stroke="#5f574b" strokeWidth="8" />
      <path d="M346 346l37 19m180-17 37-19" stroke="#e4b850" strokeWidth="8" strokeDasharray="8 5" />
    </svg>
    <div className={styles.controls}>
      <span role="status" aria-live="polite">{status}</span>
      {showReplayButton && <button type="button" className={styles.button} disabled={phase === 'fall' || phase === 'impact'} onClick={() => setPlay((value) => value + 1)}>
        {phase === 'ready' ? 'Start demolition' : 'Replay animation'}
      </button>}
    </div>
  </div>;
}
