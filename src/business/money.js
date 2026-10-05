'use strict';

function assertMinorUnits(value, options = {}) {
  if (!Number.isInteger(value)) {
    throw new TypeError('money minor units must be an integer');
  }

  if (!Number.isSafeInteger(value)) {
    throw new RangeError('money minor units must be a safe integer');
  }

  if (!options.allowNegative && value < 0) {
    throw new RangeError('money minor units must be non-negative');
  }

  return value;
}

module.exports = {
  assertMinorUnits,
};
