import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/**
 * Copies server-side field errors onto the form. Returns the general message to show
 * (or null when every error was attached to a field).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: Path<T>[],
): string | null {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  let unplaced = false;
  for (const [field, message] of Object.entries(error.fields)) {
    if ((fields as string[]).includes(field)) setError(field as Path<T>, { type: 'server', message });
    else unplaced = true;
  }
  return Object.keys(error.fields).length === 0 || unplaced ? error.message : null;
}
