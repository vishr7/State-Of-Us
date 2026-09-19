'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const GameDashboard = dynamic(() => import('./GameDashboard'), {
  ssr: false,
  loading: () => <div className="start-loading" role="status">Welcome to Pittsburgh…</div>,
});

export default function StartScreen() {
  const [started, setStarted] = useState(false);
  if (started) return <GameDashboard />;

  return (
    <main className="start-screen" aria-labelledby="start-title">
      <img className="start-art" src="/images/start-city.png" alt="" fetchPriority="high" />
      <div className="start-shade" aria-hidden="true" />
      <div className="start-location"><span aria-hidden="true">✦</span> PITTSBURGH, PENNSYLVANIA</div>
      <p className="start-motto">People make a city.<br /><span>You shape its future.</span></p>
      <div className="start-content">
        <p className="start-eyebrow"><span /> PEOPLE. POLICY. POSSIBILITY. <span /></p>
        <h1 id="start-title" className="start-title">State <em>of</em> <strong>US<span>.</span></strong></h1>
        <p className="start-description">A city of different people.<br className="start-mobile-break" /> A future we build together.</p>
        <button className="start-play" onClick={() => setStarted(true)}>
          <svg width="19" height="22" viewBox="0 0 19 22" fill="none" aria-hidden="true"><path d="M2 1.5v19L17 11 2 1.5Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span>Play</span>
          <span className="start-play-arrow" aria-hidden="true">→</span>
        </button>
        <p className="start-invitation">Your city. Our tomorrow.</p>
      </div>
      <footer className="start-footer"><span>STATE OF US <span className="start-footer-dot">/</span> A CITY SIMULATION</span><span>Every choice has a neighborhood.</span></footer>
    </main>
  );
}
