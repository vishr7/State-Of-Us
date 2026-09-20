'use client';

import { useEffect, useState } from 'react';
import TopBar from './TopBar';
import DailyAgenda from '../gameplay/DailyAgenda';
import MiniMap from '../sidebar/MiniMap';
import RightSidebar from '../sidebar/RightSidebar';
import Toast from '../ui/Toast';
import NeighborhoodDrawer from '../modals/NeighborhoodDrawer';
import BridgeModal from '../modals/BridgeModal';
import ResidentModal from '../modals/ResidentModal';
import PolicyBrowserModal from '../modals/PolicyBrowserModal';
import AnalyticsModal from '../modals/AnalyticsModal';
import TownHallModal from '../modals/TownHallModal';
import { useCityPulseStore } from '@/lib/store';

import CityCanvas from '../map/CityCanvas';
import WeatherOverlay from '../map/WeatherOverlay';
import ResidentNarrator from '../ui/ResidentNarrator';

/**
 * GameDashboard — the single full-screen layout shell.
 * Layout:
 *   TopBar (full width, 64px)
 *   CityCanvas with floating minimap | RightSidebar
 *   The map fills all remaining height below the header.
 */
export default function GameDashboard() {
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);
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

      {/* MAIN CONTENT: canvas | right sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Center — city canvas fills remaining space */}
        <div ref={setMapContainer} className="flex-1 min-w-0 overflow-hidden relative isolate">
          <CityCanvas />
          <WeatherOverlay />
          <div className="absolute top-3 left-4 z-20 w-[184px]" aria-label="City minimap">
            <MiniMap />
          </div>
          <div className="city-gameplan">
            <ResidentNarrator />
            <DailyAgenda transitionContainer={mapContainer} />
          </div>
        </div>

        <RightSidebar />
      </div>

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
