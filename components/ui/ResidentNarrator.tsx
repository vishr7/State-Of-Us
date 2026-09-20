'use client';

import { useEffect, useRef, useState } from 'react';
import ResidentPortrait from './ResidentPortrait';
import { useAgenda } from '../gameplay/DailyAgenda';
import { useCityPulseStore, selectPolicyLock } from '@/lib/store';

export function PolicyProgress() {
  const lock = useCityPulseStore(selectPolicyLock);
  const busy = useCityPulseStore(s => s.resolvingTurn || s.submittingPolicy || s.backend.status === 'connecting' || s.backend.status === 'idle');
  if (!lock) return null;
  return <div className="policy-progress" role="status">
    <span aria-hidden="true">◷</span><span className="flex-1">{lock}</span>
    <button disabled={busy} onClick={() => useAgenda.getState().setOpen(true)}>{busy ? 'Please wait…' : 'Review daily agenda →'}</button>
  </div>;
}

export default function ResidentNarrator() {
  const announcement = useCityPulseStore(s => s.announcements[0]);
  const generating = useCityPulseStore(s => s.insightsPending > 0);
  const dismiss = useCityPulseStore(s => s.dismissAnnouncement);
  const otherPanel = useCityPulseStore(s => s.ui.showTownHall || s.ui.selectedResidentId !== null);
  const otherDialogue = otherPanel;
  const speaker = announcement?.speaker ?? 'assistant';
  const speakerName = announcement?.label ?? (speaker === 'mayor' ? 'Mayor' : speaker === 'news' ? 'News anchor' : speaker === 'resident' ? 'Resident' : 'City assistant');
  const portrait = speaker === 'mayor' ? 'mayor-professional' : speaker === 'news' ? 'news-anchor' : 'assistant';
  const day = useCityPulseStore(s => s.city.turn);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<'loading' | 'speaking' | 'ready' | 'error'>('ready');
  const [error, setError] = useState('');
  const [replay, setReplay] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { setMuted(localStorage.getItem('resident-voice-muted') === 'true'); }, []);
  useEffect(() => {
    if (!announcement || otherDialogue) { setStatus('ready'); return; }
    const controller = new AbortController();
    let url: string | undefined;
    let audio: HTMLAudioElement | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (!controller.signal.aborted && useCityPulseStore.getState().announcements[0]?.id === announcement!.id) dismiss();
    };
    const captions = () => { timer = setTimeout(finish, Math.max(6000, announcement!.text.split(/\s+/).length * 350)); };
    setStatus(muted ? 'ready' : 'loading'); setError('');
    async function speak() {
      try {
        const response = await fetch('/api/resident-speech', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: announcement!.text.slice(0, 900), speaker }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        });
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || 'Voice unavailable. Captions are still available.');
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        audio = new Audio(url); audioRef.current = audio;
        audio.onended = finish;
        audio.onerror = () => { setStatus('error'); setError('Audio unavailable · captions advance automatically.'); captions(); };
        try { await audio.play(); if (!controller.signal.aborted) setStatus('speaking'); }
        catch { if (!controller.signal.aborted) { setStatus('error'); setError('Press Replay to enable voice · captions advance automatically.'); captions(); } }
      } catch (reason) {
        if (!controller.signal.aborted) { setStatus('error'); setError(reason instanceof Error ? reason.message : 'Voice unavailable.'); captions(); }
      }
    }
    if (muted) captions(); else void speak();
    return () => { clearTimeout(timer); controller.abort(); if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); } audioRef.current = null; if (url) URL.revokeObjectURL(url); };
  }, [announcement?.id, muted, replay, otherDialogue, dismiss, speaker]);

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
    setMuted(false); localStorage.setItem('resident-voice-muted', 'false'); setReplay(v => v + 1);
  };
  if (!announcement || otherDialogue) return null;
  return <aside className={`mayor-scene ${status === 'speaking' ? 'is-speaking' : ''} ${announcement.duet || (speaker === 'resident' && announcement.tour?.startsWith('district:')) ? 'is-duet' : ''}`} aria-label={`${speakerName} briefing`}>
    <div className="mayor-scene-shade" aria-hidden="true" />
    <div className="mayor-character" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {speaker === 'resident' ? <ResidentPortrait id={announcement.residentId ?? announcement.label ?? "resident"} age={announcement.residentAge} /> : <img src={`/avatars/${portrait}.png`} alt="" />}
    </div>
    {speaker === 'resident' && announcement.tour?.startsWith('district:') && <div className="dialogue-partner" aria-hidden="true"><img src="/avatars/news-anchor.png" alt="" /></div>}
    {announcement.duet && <div className="dialogue-partner" aria-hidden="true"><img src={`/avatars/${speaker === 'mayor' ? 'assistant' : 'mayor-professional'}.png`} alt="" /></div>}
    <div className="mayor-dialogue">
      <div className="mayor-nameplate"><span className="mayor-seal" aria-hidden="true">✦</span><div><h3>{speakerName}</h3><span>CITY OF PITTSBURGH · DAY {day}</span></div></div>

      <div className="mayor-dialogue-heading">{announcement?.kind === 'warning' ? 'CITY UPDATE' : announcement?.kind === 'success' ? 'POLICY BRIEFING' : announcement?.kind === 'error' ? 'ACTION NEEDED' : speaker === 'resident' ? 'RESIDENT VIEWPOINT' : speaker === 'news' ? 'CITY INTERVIEW' : speaker === 'assistant' ? 'YOUR DAILY GAMEPLAN' : 'MAYOR’S ASSESSMENT'}</div>
      <p className="mayor-caption" aria-live="polite">{announcement?.text ?? (generating ? 'I’m reviewing the decision and listening to how residents feel…' : 'Let’s plan our next move. Explore the five proposals below, review where the money goes, and choose a plan for Pittsburgh.')}</p>
      {error && !muted && <div className="mayor-voice-error" role="status">{error}</div>}
      <div className="mayor-controls">
        <span className="mayor-speaking"><span className="resident-voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>{muted ? 'Captions only' : status === 'loading' ? 'Preparing voice…' : status === 'speaking' ? 'Speaking' : announcement?.speechSource === 'gemini' ? 'Gemini-transcribed briefing' : announcement?.source === 'nemotron' ? 'Nemotron briefing' : 'Voice briefing'}</span>
        <button onClick={toggleMute} aria-label={muted ? `Unmute ${speakerName} voice` : `Mute ${speakerName} voice`}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={playAgain} disabled={!announcement || status === 'loading'}>Replay</button>

      </div>
    </div>
  </aside>;
}
