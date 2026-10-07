import { AppError } from '../utils/errorHandler.js';

export function assertReplaceSafety(type, incomingCount, existingCount, options = {}) {
  if (
    incomingCount === 0
    && existingCount > 0
    && options.allowEmptyWipe !== true
  ) {
    throw new AppError(
      `Sync would delete all ${existingCount} existing "${type}" records. `
      + 'Re-stage the data, or resend with confirm: true if this is intentional.',
      409,
    );
  }
}
