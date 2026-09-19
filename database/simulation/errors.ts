/**
 * Typed errors for the simulation engine. Kept as distinct classes (rather
 * than error codes/strings) so API routes can `instanceof`-check them into
 * the right HTTP status without parsing messages.
 */

export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** `resolveTurn` was called with a city id that has no matching row. */
export class CityNotFoundError extends SimulationError {}

/** A `decisions` row points at a `policy_id` with no matching `policies` row. */
export class PolicyNotFoundError extends SimulationError {}

/** `policies.effects.version` is not a version this interpreter understands. */
export class UnsupportedEffectsVersionError extends SimulationError {}

/**
 * `policies.effects` fails structural validation — an unknown op, a
 * non-numeric target field, a target field the PolicyEffects contract doesn't
 * permit (including derived aggregate fields), or a missing `set` block.
 */
export class MalformedPolicyEffectsError extends SimulationError {}

/** A `simulation_snapshots` row already exists for (city_id, turn). */
export class SnapshotAlreadyExistsError extends SimulationError {}
