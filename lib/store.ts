// ============================================================
// CityPulse — Zustand Global Store
// All game state + UI state live here.
// Components are presentational — they read from here and call actions.
// The turn interval runs here, not in a component.
// ============================================================

'use client';

import { create } from 'zustand';
import { personaResidents } from './personas';
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
import { simulateTurn, enactPolicy, rollEvent, advanceDate, rollWeather } from './mockEngine';
import { getGroupReactions } from './mockAgents';
import {
  connectToBackend, overlayCity, overlayNeighborhoods, updateAgentGroups, toDisplayTurn,
} from './backend';
import type { BackendLink } from './backend';
import { createDecision, resolveTurn, getNeighborhoods, ApiClientError } from '@/src/lib/apiClient';

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
  mapViewport: { x: -80, y: 40, zoom: 0.65 },
};

// ------ Store Interface -------------------------------------

interface CityPulseStore extends GameState {
  // Derived / convenience
  weather: { condition: WeatherCondition; tempC: number };

  // Backend link. 'offline' = API/DB unreachable, running on the local mock engine.
  backend: { status: 'idle' | 'connecting' | 'connected' | 'offline'; error: string | null };
  backendLink: BackendLink | null;
  resolvingTurn: boolean;
  connectBackend: () => Promise<void>;

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
  residents: personaResidents,
  agentGroups: initialAgentGroups,
  policies: initialPolicies,
  bridges: initialBridges,
  activeEvents: initialEvents,
  eventLog: [],
  decisionHistory: [],
  snapshots: initialSnapshots,
  consequenceQueue: [],

  weather: { condition: 'sunny', tempC: 18 },
  ui: defaultUI,

  turnIntervalId: null,
  lastSnapshot: null,

  backend: { status: 'idle', error: null },
  backendLink: null,
  resolvingTurn: false,

  // ------ Backend connection --------------------------------

  connectBackend: async () => {
    const status = get().backend.status;
    if (status === 'connecting' || status === 'connected') return;
    set({ backend: { status: 'connecting', error: null } });
    try {
      const { city, neighborhoods, policies } = get();
      const world = await connectToBackend({ city, neighborhoods, policies });
      set(state => ({
        backend: { status: 'connected', error: null },
        backendLink: world.link,
        city: world.city,
        neighborhoods: world.neighborhoods,
        // Anything the DB already has a decision for is in force; don't let it be enacted twice.
        policies: state.policies.map(p =>
          world.decidedLocalPolicyIds.has(p.id)
            ? { ...p, status: 'active' as const, turnEnacted: world.decidedLocalPolicyIds.get(p.id) }
            : p
        ),
        // Charts restart from the database's current state rather than mixing in mock history.
        snapshots: [buildSnapshot(world.city, world.neighborhoods, [])],
        lastSnapshot: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.info(`[CityPulse] Backend unavailable — running on the local mock engine. (${message})`);
      set({ backend: { status: 'offline', error: message } });
    }
  },

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
    if (get().backendLink) {
      void advanceViaBackend(get, set);
      return;
    }
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

    const { backendLink } = get();
    const backendPolicyId = backendLink?.policyIdByLocalId[policyId];
    if (backendLink && backendPolicyId) {
      void enactViaBackend(get, set, backendLink, policy, backendPolicyId);
      return;
    }

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

// ------ Backend-connected actions ---------------------------
// Module-level (not store members) so the store interface stays the public
// surface; they only touch state through get/set.

type Get = () => CityPulseStore;
type Set = (fn: (state: CityPulseStore) => Partial<CityPulseStore>) => void;

function buildSnapshot(city: City, neighborhoods: Neighborhood[], activeEvents: GameEvent[]): SimulationSnapshot {
  return {
    turn: city.turn,
    treasury: city.treasury,
    revenue: city.revenue,
    expenses: city.expenses,
    happiness: city.happiness,
    approval: city.approval,
    population: city.population,
    averageRent: city.averageRent,
    neighborhoodHappiness: Object.fromEntries(neighborhoods.map(n => [n.id, n.happiness])),
    neighborhoodRent: Object.fromEntries(neighborhoods.map(n => [n.id, n.averageRent])),
    activeEventIds: activeEvents.filter(e => !e.resolved).map(e => e.id),
  };
}

/**
 * Queues the policy as a decision for the current turn. The engine applies
 * its effects when the turn resolves, so nothing about the city changes here
 * — the policy is marked active and the player is told when it will land.
 */
async function enactViaBackend(
  get: Get, set: Set, link: BackendLink, policy: Policy, backendPolicyId: string,
) {
  let alreadyQueued = false;
  try {
    await createDecision(link.cityId, backendPolicyId);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 409) {
      alreadyQueued = true; // double click, or decided earlier this turn
    } else {
      get().showToast(`✗ Could not enact "${policy.name}": ${err instanceof Error ? err.message : 'request failed'}`, 'error');
      return;
    }
  }

  const { city, residents } = get();
  const before = {
    treasury: city.treasury, happiness: city.happiness,
    approval: city.approval, revenue: city.revenue,
  };
  const decision: DecisionHistory = {
    id: `dec-${policy.id}-${city.turn}`,
    policyId: policy.id,
    policyName: policy.name,
    turn: city.turn,
    cityStateBefore: before,
    cityStateAfter: before, // patched with the real result when the turn resolves
    residentReactions: getGroupReactions(residents, policy),
    economicSummary: `Upfront cost: $${policy.upfrontCost.toLocaleString()}. Recurring: $${Math.abs(policy.recurringCost).toLocaleString()}/turn.`,
  };

  set(state => ({
    policies: state.policies.map(p =>
      p.id === policy.id ? { ...p, status: 'active' as const, turnEnacted: city.turn } : p
    ),
    decisionHistory: alreadyQueued ? state.decisionHistory : [...state.decisionHistory, decision],
  }));

  get().showToast(
    alreadyQueued
      ? `"${policy.name}" is already queued for this turn`
      : `✓ "${policy.name}" queued — takes effect when the turn resolves`,
    alreadyQueued ? 'info' : 'success',
  );
}

/**
 * Resolves one turn on the server, then rebuilds the canonical parts of the
 * client state from the database. The calendar, weather, events and agent
 * sentiment are client-only and advance locally.
 */
async function advanceViaBackend(get: Get, set: Set) {
  const link = get().backendLink;
  if (!link || get().resolvingTurn) return; // one in-flight resolve at a time (autoplay ticks can overlap)

  set(() => ({ resolvingTurn: true }));
  try {
    const result = await resolveTurn(link.cityId);
    const dbNeighborhoods = await getNeighborhoods(link.cityId);

    const { city: prevCity, neighborhoods: prevNeighborhoods, agentGroups, activeEvents, snapshots, decisionHistory } = get();

    const cityAfter = overlayCity(prevCity, result.city, link);
    const neighborhoods = overlayNeighborhoods(prevNeighborhoods, dbNeighborhoods, link);
    const { day, season, year } = advanceDate(prevCity.day, prevCity.season, prevCity.year);
    const nextCity: City = { ...cityAfter, day, season, year };

    const stillActive = activeEvents.filter(e => !e.resolved && e.startTurn >= nextCity.turn - 3);
    const newEvent = rollEvent(nextCity.turn, nextCity.season);
    const nextEvents = newEvent ? [...stillActive, newEvent] : stillActive;

    // Fill in the real outcome of decisions that just resolved.
    const appliedLocalIds = new Set(
      result.applied_decisions.map(d => link.localIdByPolicyId[d.policy_id]).filter(Boolean)
    );
    const after = {
      treasury: nextCity.treasury, happiness: nextCity.happiness,
      approval: nextCity.approval, revenue: nextCity.revenue,
    };
    const history = decisionHistory.map(d =>
      appliedLocalIds.has(d.policyId) && d.turn === toDisplayTurn(result.previous_turn)
        ? { ...d, cityStateAfter: after }
        : d
    );

    set(state => ({
      city: nextCity,
      neighborhoods,
      agentGroups: updateAgentGroups(agentGroups, neighborhoods),
      activeEvents: nextEvents,
      eventLog: newEvent ? [...state.eventLog, newEvent] : state.eventLog,
      decisionHistory: history,
      snapshots: [...snapshots, buildSnapshot(nextCity, neighborhoods, nextEvents)].slice(-30),
      weather: rollWeather(nextCity.season),
      lastSnapshot: snapshots[snapshots.length - 1] ?? null,
    }));

    if (newEvent) {
      get().showToast(`⚡ ${newEvent.pittsburghFlavor}`, 'warning');
    } else if (result.applied_decisions.length > 0) {
      get().showToast(`✓ ${result.applied_decisions.map(d => d.policy_name).join(', ')} took effect`, 'success');
    }
  } catch (err) {
    get().stopPlaying();
    get().showToast(`✗ Turn failed: ${err instanceof Error ? err.message : 'request failed'}`, 'error');
  } finally {
    set(() => ({ resolvingTurn: false }));
  }
}

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
