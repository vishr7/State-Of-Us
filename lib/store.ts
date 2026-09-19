// ============================================================
// CityPulse — Zustand Global Store
// All game state + UI state live here.
// Components are presentational — they read from here and call actions.
// The turn interval runs here, not in a component.
// ============================================================

'use client';

import { create } from 'zustand';
import {
  GameState, City, Neighborhood, Resident, AgentGroup,
  Policy, Bridge, GameEvent, SimulationSnapshot, QueuedEffect,
  UIState, CategoryId, DecisionHistory, WeatherCondition, Season,
} from './types';
import {
  initialCity, initialNeighborhoods, initialResidents,
  initialAgentGroups, initialPolicies, initialBridges,
  initialEvents, initialSnapshots,
} from './mockData';
import { simulateTurn, enactPolicy, rollEvent } from './mockEngine';
import { getGroupReactions } from './mockAgents';

// ------ Default UI State ------------------------------------

const defaultUI: UIState = {
  activeCategoryId: 'housing',
  isPlaying: false,
  selectedNeighborhoodId: null,
  selectedBridgeId: null,
  selectedResidentId: null,
  showPolicyBrowser: false,
  showAnalytics: false,
  showTownHall: false,
  toastMessage: null,
  toastType: 'info',
  mapViewport: { x: 0, y: 0, zoom: 1 },
};

// ------ Store Interface -------------------------------------

interface CityPulseStore extends GameState {
  // Derived / convenience
  weather: { condition: WeatherCondition; tempC: number };

  // Turn control
  turnIntervalId: ReturnType<typeof setInterval> | null;
  startPlaying: () => void;
  stopPlaying: () => void;
  advanceTurn: () => void;

  // Policy actions
  enactPolicyById: (policyId: string) => void;

  // UI actions
  setActiveCategory: (id: CategoryId) => void;
  selectNeighborhood: (id: string | null) => void;
  selectBridge: (id: string | null) => void;
  selectResident: (id: string | null) => void;
  setPolicyBrowser: (open: boolean) => void;
  setAnalytics: (open: boolean) => void;
  setTownHall: (open: boolean) => void;
  showToast: (message: string, type: UIState['toastType']) => void;
  clearToast: () => void;
  setMapViewport: (vp: Partial<UIState['mapViewport']>) => void;

  // Snapshot delta helpers (for animated count-ups)
  lastSnapshot: SimulationSnapshot | null;
}

// ------ Store Implementation --------------------------------

export const useCityPulseStore = create<CityPulseStore>((set, get) => ({
  // Initial game state
  city: initialCity,
  neighborhoods: initialNeighborhoods,
  residents: initialResidents,
  agentGroups: initialAgentGroups,
  policies: initialPolicies,
  bridges: initialBridges,
  activeEvents: initialEvents,
  eventLog: [],
  decisionHistory: [],
  snapshots: initialSnapshots,
  consequenceQueue: [],

  weather: { condition: 'overcast', tempC: 14 },
  ui: defaultUI,

  turnIntervalId: null,
  lastSnapshot: null,

  // ------ Turn Control --------------------------------------

  startPlaying: () => {
    const existing = get().turnIntervalId;
    if (existing) return; // already running

    // Advance one turn every 4 seconds
    const id = setInterval(() => {
      get().advanceTurn();
    }, 4000);

    set(state => ({
      turnIntervalId: id,
      ui: { ...state.ui, isPlaying: true },
    }));
  },

  stopPlaying: () => {
    const id = get().turnIntervalId;
    if (id) clearInterval(id);
    set(state => ({
      turnIntervalId: null,
      ui: { ...state.ui, isPlaying: false },
    }));
  },

  advanceTurn: () => {
    const { city, neighborhoods, agentGroups, activeEvents, consequenceQueue, snapshots, policies } = get();

    // Run active policy recurring costs
    const activeRecurring = policies.filter(p => p.status === 'active' && p.recurringCost !== 0);
    let cityWithRecurring = { ...city };
    for (const p of activeRecurring) {
      // recurringCost negative = revenue gain, positive = extra expense
      cityWithRecurring = {
        ...cityWithRecurring,
        treasury: cityWithRecurring.treasury - p.recurringCost,
      };
    }

    // Run simulation
    const result = simulateTurn(
      cityWithRecurring,
      neighborhoods,
      agentGroups,
      activeEvents,
      consequenceQueue,
    );

    // Resolve events older than 3 turns
    const stillActive = activeEvents.filter(
      e => !e.resolved && e.startTurn >= result.updatedCity.turn - 3
    );

    // Roll for a new random event
    let newEvent: GameEvent | null = null;
    let newActiveEvents = stillActive;
    const eventRoll = rollEvent(result.updatedCity.turn, result.updatedCity.season);
    if (eventRoll) {
      newEvent = eventRoll;
      newActiveEvents = [...stillActive, newEvent];
    }

    // Push snapshot (keep last 30)
    const newSnapshots = [...snapshots, result.snapshot].slice(-30);

    set(state => ({
      city: result.updatedCity,
      neighborhoods: result.updatedNeighborhoods,
      agentGroups: result.updatedAgentGroups,
      consequenceQueue: result.remainingQueue,
      activeEvents: newActiveEvents,
      eventLog: newEvent ? [...state.eventLog, newEvent] : state.eventLog,
      snapshots: newSnapshots,
      weather: result.weather,
      lastSnapshot: snapshots[snapshots.length - 1] ?? null,
    }));

    // Show event banner
    if (newEvent) {
      get().showToast(`⚡ ${newEvent.pittsburghFlavor}`, 'warning');
    }

    // Show queued effect firings
    if (result.firedEffectDescriptions.length > 0) {
      get().showToast(`✓ ${result.firedEffectDescriptions[0]}`, 'success');
    }
  },

  // ------ Policy Actions ------------------------------------

  enactPolicyById: (policyId: string) => {
    const { city, neighborhoods, policies, consequenceQueue, residents, decisionHistory } = get();
    const policy = policies.find(p => p.id === policyId);
    if (!policy || policy.status !== 'proposed') return;

    // Apply enact
    const result = enactPolicy(city, neighborhoods, policy, city.turn);

    // Get agent reactions
    const reactions = getGroupReactions(residents, policy);

    // Record decision
    const decision: DecisionHistory = {
      id: `dec-${policyId}-${city.turn}`,
      policyId: policy.id,
      policyName: policy.name,
      turn: city.turn,
      cityStateBefore: {
        treasury: city.treasury,
        happiness: city.happiness,
        approval: city.approval,
        revenue: city.revenue,
      },
      cityStateAfter: {
        treasury: result.updatedCity.treasury,
        happiness: result.updatedCity.happiness,
        approval: result.updatedCity.approval,
        revenue: result.updatedCity.revenue,
      },
      residentReactions: reactions,
      economicSummary: `Upfront cost: $${policy.upfrontCost.toLocaleString()}. Recurring: $${Math.abs(policy.recurringCost).toLocaleString()}/turn.`,
    };

    // Mark policy active
    const updatedPolicies = policies.map(p =>
      p.id === policyId
        ? { ...p, status: 'active' as const, turnEnacted: city.turn }
        : p
    );

    set(state => ({
      city: result.updatedCity,
      neighborhoods: result.updatedNeighborhoods,
      policies: updatedPolicies,
      consequenceQueue: [...consequenceQueue, ...result.queuedEffects],
      decisionHistory: [...state.decisionHistory, decision],
    }));

    get().showToast(`✓ "${policy.name}" enacted — $${policy.upfrontCost.toLocaleString()} deducted`, 'success');
  },

  // ------ UI Actions ----------------------------------------

  setActiveCategory: (id) =>
    set(state => ({ ui: { ...state.ui, activeCategoryId: id } })),

  selectNeighborhood: (id) =>
    set(state => ({ ui: { ...state.ui, selectedNeighborhoodId: id } })),

  selectBridge: (id) =>
    set(state => ({ ui: { ...state.ui, selectedBridgeId: id } })),

  selectResident: (id) =>
    set(state => ({ ui: { ...state.ui, selectedResidentId: id } })),

  setPolicyBrowser: (open) =>
    set(state => ({ ui: { ...state.ui, showPolicyBrowser: open } })),

  setAnalytics: (open) =>
    set(state => ({ ui: { ...state.ui, showAnalytics: open } })),

  setTownHall: (open) =>
    set(state => ({ ui: { ...state.ui, showTownHall: open } })),

  showToast: (message, type) => {
    set(state => ({ ui: { ...state.ui, toastMessage: message, toastType: type } }));
    // Auto-clear after 4 seconds
    setTimeout(() => {
      get().clearToast();
    }, 4000);
  },

  clearToast: () =>
    set(state => ({ ui: { ...state.ui, toastMessage: null } })),

  setMapViewport: (vp) =>
    set(state => ({
      ui: {
        ...state.ui,
        mapViewport: { ...state.ui.mapViewport, ...vp },
      },
    })),
}));

// ------ Convenience Selectors (memoized externally) ---------

export const selectPoliciesByCategory = (state: CityPulseStore, category: CategoryId) =>
  state.policies.filter(p => p.category === category);

export const selectActiveNeighborhood = (state: CityPulseStore) =>
  state.neighborhoods.find(n => n.id === state.ui.selectedNeighborhoodId) ?? null;

export const selectActiveBridge = (state: CityPulseStore) =>
  state.bridges.find(b => b.id === state.ui.selectedBridgeId) ?? null;

export const selectActiveResident = (state: CityPulseStore) =>
  state.residents.find(r => r.id === state.ui.selectedResidentId) ?? null;

export const selectFeaturedResident = (state: CityPulseStore) =>
  state.residents[0]; // Could rotate based on turn

export const selectProposedPolicies = (state: CityPulseStore) =>
  state.policies.filter(p => p.status === 'proposed');

export const selectTurnDateLabel = (state: CityPulseStore) => {
  const { day, season, year } = state.city;
  const seasonName = season.charAt(0).toUpperCase() + season.slice(1);
  return `${seasonName} ${day}, Year ${year}`;
};
