'use client';

import { useEffect, useRef, useState } from 'react';
import { useCityPulseStore, selectPolicyLock } from '@/lib/store';

export function PolicyProgress() {
  const lock = useCityPulseStore(selectPolicyLock);
  const advance = useCityPulseStore(s => s.advanceTurn);
  const busy = useCityPulseStore(s => s.resolvingTurn || s.submittingPolicy || s.backend.status === 'connecting' || s.backend.status === 'idle');
  if (!lock) return null;
  return <div className="policy-progress" role="status">
    <span aria-hidden="true">◷</span><span className="flex-1">{lock}</span>
    <button disabled={busy} onClick={advance}>{busy ? 'Please wait…' : 'Advance one turn →'}</button>
  </div>;
}

export default function ResidentNarrator() {
  const announcement = useCityPulseStore(s => s.announcements[0]);
  const waiting = useCityPulseStore(s => s.announcements.length);
  const dismiss = useCityPulseStore(s => s.dismissAnnouncement);
  const otherDialogue = useCityPulseStore(s => s.ui.showTownHall || s.ui.selectedResidentId !== null);
  const day = useCityPulseStore(s => s.city.turn);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<'loading' | 'speaking' | 'ready' | 'error'>('ready');
  const [error, setError] = useState('');
  const [replay, setReplay] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { setMuted(localStorage.getItem('resident-voice-muted') === 'true'); }, []);
  useEffect(() => {
    if (!announcement || muted || otherDialogue) { setStatus('ready'); return; }
    const controller = new AbortController();
    let url: string | undefined;
    let audio: HTMLAudioElement | undefined;
    setStatus('loading'); setError('');
    async function speak() {
      try {
        const response = await fetch('/api/resident-speech', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: announcement!.text.slice(0, 900) }), signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || 'Voice unavailable. Captions are still available.');
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        audio = new Audio(url); audioRef.current = audio;
        audio.onended = () => setStatus('ready');
        audio.onerror = () => { setStatus('error'); setError('Audio could not play. Try replay.'); };
        try { await audio.play(); if (!controller.signal.aborted) setStatus('speaking'); }
        catch { if (!controller.signal.aborted) { setStatus('error'); setError('Press Replay to enable the Mayor’s voice.'); } }
      } catch (reason) {
        if (!controller.signal.aborted) { setStatus('error'); setError(reason instanceof Error ? reason.message : 'Voice unavailable.'); }
      }
    }
    void speak();
    return () => { controller.abort(); if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); } audioRef.current = null; if (url) URL.revokeObjectURL(url); };
  }, [announcement?.id, muted, replay, otherDialogue]);

  useEffect(() => {
    if (!announcement || otherDialogue) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [announcement?.id, dismiss, otherDialogue]);

  const toggleMute = () => {
    const next = !muted; setMuted(next); localStorage.setItem('resident-voice-muted', String(next));
  };
  const playAgain = () => {
    const audio = audioRef.current;
    if (audio && !muted) {
      audio.currentTime = 0;
      void audio.play().then(() => { setStatus('speaking'); setError(''); }).catch(() => { setStatus('error'); setError('Playback blocked. Try again.'); });
    } else { setMuted(false); localStorage.setItem('resident-voice-muted', 'false'); setReplay(v => v + 1); }
  };
  if (!announcement || otherDialogue) return null;
  return <aside className={`mayor-scene ${status === 'speaking' ? 'is-speaking' : ''}`} aria-label="Mayor's briefing">
    <div className="mayor-scene-shade" aria-hidden="true" />
    <div className="mayor-character" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avatars/mayor-professional.png" alt="" />
    </div>
    <div className="mayor-dialogue">
      <div className="mayor-nameplate"><span className="mayor-seal" aria-hidden="true">✦</span><div><h3>Mayor</h3><span>CITY OF PITTSBURGH · DAY {day}</span></div></div>
      <button aria-label="Dismiss Mayor's briefing" onClick={dismiss} className="mayor-close">×</button>
      <div className="mayor-dialogue-heading">{announcement.kind === 'warning' ? 'CITY UPDATE' : announcement.kind === 'success' ? 'POLICY BRIEFING' : announcement.kind === 'error' ? 'ACTION NEEDED' : 'FROM THE MAYOR’S OFFICE'}</div>
      <p className="mayor-caption" aria-live="polite">{announcement.text}</p>
      {error && !muted && <div className="mayor-voice-error" role="status">{error}</div>}
      <div className="mayor-controls">
        <span className="mayor-speaking"><span className="resident-voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>{muted ? 'Captions only' : status === 'loading' ? 'Preparing voice…' : status === 'speaking' ? 'Speaking' : announcement.speechSource === 'gemini' ? 'Gemini-transcribed briefing' : announcement.source === 'nemotron' ? 'Nemotron briefing' : 'Voice briefing'}</span>
        <button onClick={toggleMute} aria-label={muted ? 'Unmute Mayor voice' : 'Mute Mayor voice'}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={playAgain} disabled={status === 'loading'}>Replay</button>
        <button className="mayor-continue" onClick={dismiss}>{waiting > 1 ? `Next (${waiting - 1})` : 'Continue'} <span aria-hidden="true">▸</span></button>
      </div>
    </div>
  </aside>;
}
