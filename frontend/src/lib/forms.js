import { ApiError } from './api';

/**
 * Copies server-side field errors onto the form. Returns the general message to show
 * (or null when every error was attached to a field).
 */
export function applyServerErrors(error, setError, fields) {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  let unplaced = false;
  for (const [field, message] of Object.entries(error.fields)) {
    if (fields.includes(field)) setError(field, { type: 'server', message });
    else unplaced = true;
  }
  return Object.keys(error.fields).length === 0 || unplaced ? error.message : null;
}
