// Run with node --test scripts/test-personas.cjs; reuse the project's TypeScript compiler.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
};
const test = require('node:test');
const assert = require('node:assert/strict');
const { personaResidents } = require('../lib/personas.ts');
const { createWalkers, walkerPosition, isWalkable } = require('../components/map/residentWalkers.ts');

test('100 distinct adult dataset residents map to complete game profiles', () => {
  assert.equal(personaResidents.length,100);
  assert.equal(new Set(personaResidents.map(r=>r.id)).size,100);
  for (const resident of personaResidents) {
    assert.ok(resident.age >= 18);
    assert.ok(resident.persona.uuid);
    assert.ok(resident.name && resident.occupation);
    assert.ok(Number.isFinite(resident.annualIncome));
    assert.ok(resident.housingSensitivity >= 0 && resident.housingSensitivity <= 1);
  }
});
test('walker routes are deterministic, contiguous, and confined to streets, including loop seams', () => {
  const walkers = createWalkers(personaResidents);
  assert.deepEqual(walkers,createWalkers(personaResidents));
  assert.equal(walkers.length,100);
  for (const walker of walkers) {
    assert.ok(walker.route.length > 1);
    walker.route.forEach((tile,i) => {
      assert.ok(isWalkable(tile.x,tile.y));
      const next = walker.route[(i+1)%walker.route.length];
      assert.equal(Math.abs(next.x-tile.x)+Math.abs(next.y-tile.y),1);
    });
    for (const time of [0,1,10,100,10000]) {
      const point = walkerPosition(walker,time);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
    assert.notDeepEqual(walkerPosition(walker,0),walkerPosition(walker,1));
  }
});
test('pointer hit testing chooses the nearest resident and rejects empty space', () => {
  const { hitTestWalker } = require('../components/map/residentWalkers.ts');
  const points=[{id:'a',x:10,y:10},{id:'b',x:18,y:10}];
  assert.equal(hitTestWalker(points,11,10),'a');
  assert.equal(hitTestWalker(points,17,10),'b');
  assert.equal(hitTestWalker(points,100,100),null);
  assert.equal(hitTestWalker([],0,0),null);
});
