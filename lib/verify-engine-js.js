// CityPulse Engine Verification — pure JS, no imports needed
// Tests the same logic as mockEngine.ts in isolation.
// Run: node lib/verify-engine-js.js

'use strict';

// === Inline the core engine logic (mirrors mockEngine.ts exactly) ===

const SEASONS = ['spring', 'summer', 'fall', 'winter'];

function advanceSeason(season) {
  const i = SEASONS.indexOf(season);
  return SEASONS[(i + 1) % 4];
}

function advanceDate(day, season, year) {
  if (day < 30) return { day: day + 1, season, year };
  const nextSeason = advanceSeason(season);
  const nextYear = nextSeason === 'spring' ? year + 1 : year;
  return { day: 1, season: nextSeason, year: nextYear };
}

const WEATHER_BY_SEASON = {
  spring: ['overcast', 'overcast', 'rain', 'partly_cloudy', 'sunny', 'fog'],
  summer: ['sunny', 'sunny', 'partly_cloudy', 'overcast', 'rain', 'partly_cloudy'],
  fall:   ['overcast', 'partly_cloudy', 'rain', 'fog', 'sunny', 'overcast'],
  winter: ['snow', 'overcast', 'snow', 'fog', 'overcast', 'partly_cloudy'],
};

function rollWeather(season) {
  const pool = WEATHER_BY_SEASON[season];
  const condition = pool[Math.floor(Math.random() * pool.length)];
  const baseTemps = { spring:[8,18], summer:[22,32], fall:[5,16], winter:[-4,4] };
  const [lo, hi] = baseTemps[season];
  const tempC = Math.round(lo + Math.random() * (hi - lo));
  return { condition, tempC };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function applyDelta(obj, field, delta) {
  const result = { ...obj };
  if (typeof result[field] === 'number') {
    result[field] = result[field] + delta;
  }
  return result;
}

function enactPolicy(city, neighborhoods, policy, currentTurn) {
  let updatedCity = { ...city };
  let updatedNeighborhoods = [...neighborhoods];
  const queuedEffects = [];

  for (const effect of policy.effects) {
    if (effect.turnsDelay === 0) {
      if (effect.affectedNeighborhoods.length === 0) {
        updatedCity = applyDelta(updatedCity, effect.field, effect.delta);
      } else {
        updatedNeighborhoods = updatedNeighborhoods.map(n => {
          if (!effect.affectedNeighborhoods.includes(n.id)) return n;
          return applyDelta(n, effect.field, effect.delta);
        });
      }
    } else {
      queuedEffects.push({
        id: `qe-${policy.id}-${effect.field}-${currentTurn}`,
        sourcePolicyId: policy.id,
        turnsRemaining: effect.turnsDelay,
        effects: [effect],
        description: `${policy.name}: ${effect.label}`,
      });
    }
  }

  updatedCity = { ...updatedCity, treasury: updatedCity.treasury - policy.upfrontCost };
  return { updatedCity, updatedNeighborhoods, queuedEffects };
}

function tickConsequenceQueue(queue, city, neighborhoods) {
  let c = { ...city };
  let ns = [...neighborhoods];
  const remaining = [];
  const fired = [];

  for (const item of queue) {
    const ticked = { ...item, turnsRemaining: item.turnsRemaining - 1 };
    if (ticked.turnsRemaining <= 0) {
      for (const eff of item.effects) {
        if (eff.affectedNeighborhoods.length === 0) {
          c = applyDelta(c, eff.field, eff.delta);
        } else {
          ns = ns.map(n => eff.affectedNeighborhoods.includes(n.id) ? applyDelta(n, eff.field, eff.delta) : n);
        }
      }
      fired.push(ticked.description);
    } else {
      remaining.push(ticked);
    }
  }
  return { updatedCity: c, updatedNeighborhoods: ns, remainingQueue: remaining, firedDescriptions: fired };
}

function simulateTurn(city, neighborhoods, queue) {
  const { updatedCity: cityQ, updatedNeighborhoods: nsQ, remainingQueue, firedDescriptions } = tickConsequenceQueue(queue, city, neighborhoods);
  let c = { ...cityQ };
  let ns = [...nsQ];

  // Rent pressure
  ns = ns.map(n => {
    const demandPressure = 0;
    const supplyEffect = n.vacancyRate * 0.04;
    const rentChangePct = (demandPressure - supplyEffect) * (1 + n.gentrificationPressure * 0.5);
    const newRent = Math.round(n.averageRent * (1 + rentChangePct));
    const rentersHappinessDelta = rentChangePct > 0 ? Math.round(-rentChangePct * 100 * n.renterFraction * 15) : Math.round(-rentChangePct * 100 * n.renterFraction * 8);
    return { ...n, averageRent: newRent, happiness: clamp(n.happiness + rentersHappinessDelta, 0, 100) };
  });

  c = {
    ...c,
    happiness: clamp(Math.round(ns.reduce((s, n) => s + n.happiness, 0) / ns.length), 0, 100),
    averageRent: Math.round(ns.reduce((s, n) => s + n.averageRent, 0) / ns.length),
    population: c.population + Math.round((Math.random() - 0.3) * 50),
    treasury: c.treasury + c.revenue - c.expenses,
    turn: c.turn + 1,
  };

  const approvalDelta = (65 - c.approval) * 0.05 + (Math.random() - 0.5) * 4;
  c = { ...c, approval: clamp(Math.round(c.approval + approvalDelta), 0, 100) };

  const { day, season, year } = advanceDate(city.day, city.season, city.year);
  c = { ...c, day, season, year };

  const weather = rollWeather(c.season);
  return { updatedCity: c, updatedNeighborhoods: ns, remainingQueue, firedDescriptions, weather };
}

function rollEvent(turn, season, probability = 0.20) {
  if (Math.random() > probability) return null;
  const events = [
    { title: 'Bridge Fails Inspection', flavor: 'Liberty Bridge closes indefinitely after cracks found.' },
    { title: 'Hillside Landslide', flavor: 'Landslide closes Grandview Ave. Three homes evacuated.' },
    { title: 'Pittsburgh Named Top City', flavor: 'Condé Nast: "Pittsburgh is the most livable city in America."' },
    { title: 'Winter Storm', flavor: 'Snow emergency declared. 14 inches overnight.' },
    { title: 'Mon Valley Mill Layoffs', flavor: 'U.S. Steel Clairton to cut 650 workers.' },
  ];
  return events[Math.floor(Math.random() * events.length)];
}

// === Seed data inline (key figures from mockData.ts) ===

const city = {
  id: 'pittsburgh', name: 'Pittsburgh', turn: 1, year: 3, day: 12, season: 'spring',
  population: 302000, metroPopulation: 2370000, unemploymentRate: 0.048,
  treasury: 2480000, revenue: 2910000, expenses: 2430000,
  happiness: 72, approval: 68, transitScore: 58, safetyScore: 64, environmentScore: 55,
  housingSupply: 148000, averageRent: 1340,
  bridgeConditionAvg: 61, riverFloodRisk: 0.12, airQualityIndex: 74, taxExemptPropertyShare: 0.42,
};

const neighborhoods = [
  { id: 'lawrenceville', name: 'Lawrenceville', happiness: 68, averageRent: 1540, renterFraction: 0.72, vacancyRate: 0.07, gentrificationPressure: 0.75, transitAccess: 70 },
  { id: 'homewood', name: 'Homewood', happiness: 42, averageRent: 740, renterFraction: 0.55, vacancyRate: 0.28, gentrificationPressure: 0.12, transitAccess: 72 },
  { id: 'shadyside', name: 'Shadyside', happiness: 81, averageRent: 1980, renterFraction: 0.61, vacancyRate: 0.05, gentrificationPressure: 0.30, transitAccess: 62 },
];

const buswayPolicy = {
  id: 'pol-busway-extension', name: 'East Busway Frequency Increase',
  upfrontCost: 400000,
  effects: [
    { label: 'Transit access +12', delta: 12, field: 'transitAccess', isPositive: true, turnsDelay: 1, affectedNeighborhoods: ['homewood'] },
    { label: 'Lower-income happiness +6', delta: 6, field: 'happiness', isPositive: true, turnsDelay: 1, affectedNeighborhoods: ['homewood'] },
  ],
};

// === Run Verification ===

console.log('=== CityPulse Engine Verification ===\n');
console.log('INITIAL STATE:');
console.log(`  Treasury: $${city.treasury.toLocaleString()}`);
console.log(`  Happiness: ${city.happiness}`);
console.log(`  Approval: ${city.approval}%`);
console.log(`  Population: ${city.population.toLocaleString()}`);
console.log(`  Avg Rent: $${city.averageRent}/mo\n`);

// Enact policy
console.log(`ENACTING: "${buswayPolicy.name}" (cost: $${buswayPolicy.upfrontCost.toLocaleString()})`);
let { updatedCity, updatedNeighborhoods, queuedEffects } = enactPolicy(city, neighborhoods, buswayPolicy, 0);
let queue = queuedEffects;
console.log(`  Treasury after: $${updatedCity.treasury.toLocaleString()} (expected: $${(city.treasury - buswayPolicy.upfrontCost).toLocaleString()})`);
console.log(`  Treasury delta correct: ${updatedCity.treasury === city.treasury - buswayPolicy.upfrontCost ? '✓ PASS' : '✗ FAIL'}`);
console.log(`  Queued effects: ${queue.length} (expected 2)\n`);

let c = updatedCity;
let ns = updatedNeighborhoods;

// Run 5 turns
console.log('SIMULATING 5 TURNS:\n');
for (let t = 1; t <= 5; t++) {
  const result = simulateTurn(c, ns, queue);
  c = result.updatedCity;
  ns = result.updatedNeighborhoods;
  queue = result.remainingQueue;
  const event = rollEvent(t, c.season);

  console.log(`  Turn ${t} (${c.season} day ${c.day}, Year ${c.year}):`);
  console.log(`    Treasury: $${c.treasury.toLocaleString()} | Revenue: $${c.revenue.toLocaleString()} | Expenses: $${c.expenses.toLocaleString()}`);
  console.log(`    Budget delta/turn: +$${(c.revenue - c.expenses).toLocaleString()}`);
  console.log(`    Happiness: ${c.happiness} | Approval: ${c.approval}% | Pop: ${c.population.toLocaleString()}`);
  console.log(`    Avg Rent: $${c.averageRent}/mo`);
  console.log(`    Lawrenceville rent: $${ns.find(n => n.id === 'lawrenceville').averageRent}/mo`);
  console.log(`    Homewood rent: $${ns.find(n => n.id === 'homewood').averageRent}/mo`);
  console.log(`    Weather: ${result.weather.condition} ${result.weather.tempC}°C`);
  if (result.firedDescriptions.length > 0) {
    console.log(`    ✓ Delayed effects fired: ${result.firedDescriptions.join(', ')}`);
    const homewood = ns.find(n => n.id === 'homewood');
    console.log(`    Homewood transit after effect: ${homewood.transitAccess}`);
  }
  if (event) {
    console.log(`    ⚡ EVENT: ${event.title}`);
  }
  console.log(`    Queue remaining: ${queue.length}`);
  console.log();
}

// Assertions
const allPassed = [];

// 1. Treasury went down after enact
allPassed.push({ name: 'Treasury reduced after enact', pass: updatedCity.treasury === city.treasury - buswayPolicy.upfrontCost });
// 2. Turns advanced
allPassed.push({ name: 'Turn counter advanced', pass: c.turn > city.turn });
// 3. Happiness is still in range
allPassed.push({ name: 'Happiness in 0-100 range', pass: c.happiness >= 0 && c.happiness <= 100 });
// 4. Treasury increased over turns (revenue > expenses)
allPassed.push({ name: 'Treasury grew over turns (rev > exp)', pass: c.treasury > updatedCity.treasury });
// 5. Queue should be empty (all 2 effects fired within 1 turn)
allPassed.push({ name: 'Consequence queue drained', pass: queue.length === 0 });

console.log('=== ASSERTIONS ===');
allPassed.forEach(a => console.log(`  ${a.pass ? '✓ PASS' : '✗ FAIL'}: ${a.name}`));
const passCount = allPassed.filter(a => a.pass).length;
console.log(`\n${passCount}/${allPassed.length} assertions passed`);
if (passCount === allPassed.length) {
  console.log('\n✅ Engine Verification PASSED — safe to build UI\n');
} else {
  console.log('\n❌ Engine Verification FAILED — fix before building UI\n');
  process.exit(1);
}
