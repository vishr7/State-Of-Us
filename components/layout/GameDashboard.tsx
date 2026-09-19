'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import TopBar from './TopBar';
import LeftSidebar from '../sidebar/LeftSidebar';
import RightSidebar from '../sidebar/RightSidebar';
import BottomPanel from './BottomPanel';
import MapSkeleton from '../map/MapSkeleton';
import Toast from '../ui/Toast';
import NeighborhoodDrawer from '../modals/NeighborhoodDrawer';
import BridgeModal from '../modals/BridgeModal';
import ResidentModal from '../modals/ResidentModal';
import PolicyBrowserModal from '../modals/PolicyBrowserModal';
import AnalyticsModal from '../modals/AnalyticsModal';
import TownHallModal from '../modals/TownHallModal';
import { useCityPulseStore } from '@/lib/store';

import CityCanvas from '../map/CityCanvas';
import ResidentNarrator, { PolicyProgress } from '../ui/ResidentNarrator';

/**
 * GameDashboard — the single full-screen layout shell.
 * Layout:
 *   TopBar (full width, 64px)
 *   ┌─────────────┬────────────────────┬─────────────────┐
 *   │ LeftSidebar │    CityCanvas      │  RightSidebar   │
 *   │  (200px)    │  (flex-1, fills)  │    (320px)      │
 *   └─────────────┴────────────────────┴─────────────────┘
 *   BottomPanel (full width, 150px)
 */
export default function GameDashboard() {
  const ui = useCityPulseStore(s => s.ui);
  const connectBackend = useCityPulseStore(s => s.connectBackend);

  // Load the canonical city from the API; falls back to the local mock engine if it is unreachable.
  useEffect(() => {
    void connectBackend();
  }, [connectBackend]);

  return (
    <div className="flex flex-col h-screen overflow-hidden no-select" style={{ background: '#0A1628' }}>
      {/* TOP BAR */}
      <TopBar />

      {/* MAIN CONTENT: left sidebar | canvas | right sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />

        {/* Center — city canvas fills remaining space */}
        <div className="flex-1 overflow-hidden relative">
          <CityCanvas />
          <ResidentNarrator />
        </div>

        <RightSidebar />
      </div>

      {/* BOTTOM PANEL */}
      <PolicyProgress />
      <BottomPanel />

      {/* TOAST NOTIFICATIONS */}
      <Toast />

      {/* MODALS — rendered over everything */}
      {ui.selectedNeighborhoodId && <NeighborhoodDrawer />}
      {ui.selectedBridgeId && <BridgeModal />}
      {ui.selectedResidentId && <ResidentModal />}
      {ui.showPolicyBrowser && <PolicyBrowserModal />}
      {ui.showAnalytics && <AnalyticsModal />}
      {ui.showTownHall && <TownHallModal />}
    </div>
  );
}
