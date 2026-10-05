'use strict';

const STATES = Object.freeze({
  READY: 'READY',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
  DISABLED: 'DISABLED'
});

const VALID_STATES = new Set(
  Object.values(STATES)
);

function createSubsystemRegistry(names) {
  if (!Array.isArray(names)) {
    throw new TypeError(
      'subsystem names must be an array'
    );
  }

  const entries = new Map();

  for (const name of names) {
    if (entries.has(name)) {
      throw new TypeError(
        `duplicate subsystem: ${name}`
      );
    }

    entries.set(
      name,
      STATES.DISABLED
    );
  }

  function requireKnown(name) {
    if (!entries.has(name)) {
      throw new TypeError(
        `unknown subsystem: ${name}`
      );
    }
  }

  function get(name) {
    requireKnown(name);
    return entries.get(name);
  }

  function set(name, state) {
    requireKnown(name);

    if (!VALID_STATES.has(state)) {
      throw new TypeError(
        `invalid subsystem state: ${state}`
      );
    }

    entries.set(name, state);
  }

  function snapshot() {
    return Object.freeze(
      Object.fromEntries(entries)
    );
  }

  function overall() {
    const states = [...entries.values()];

    if (states.includes(STATES.FAILED)) {
      return STATES.FAILED;
    }

    if (states.includes(STATES.DEGRADED)) {
      return STATES.DEGRADED;
    }

    if (states.includes(STATES.READY)) {
      return STATES.READY;
    }

    return STATES.DISABLED;
  }

  return Object.freeze({
    get,
    set,
    snapshot,
    overall
  });
}

module.exports = {
  STATES,
  createSubsystemRegistry
};
