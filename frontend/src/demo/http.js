import { ApiError } from '@/lib/api';

/** The API's error responses (HttpError / ValidationError), as the client sees them. */
export const fail = {
  fields: (fields, message = 'Please check the highlighted fields.') =>
    new ApiError(422, 'validation_failed', message, fields),
  field: (field, message) => fail.fields({ [field]: message }),
  badRequest: (message, code = 'bad_request') => new ApiError(400, code, message),
  unauthorized: (message = 'Please sign in to continue.') => new ApiError(401, 'unauthenticated', message),
  forbidden: (message = "You don't have permission to do that.") => new ApiError(403, 'forbidden', message),
  notFound: (message = 'We couldn’t find that.') => new ApiError(404, 'not_found', message),
  conflict: (message, code = 'conflict') => new ApiError(409, code, message),
};

/** PHP regex literal ('/^a$/i' or '#^https://#') to a RegExp. */
function phpRegex(src) {
  const delim = src[0];
  const end = src.lastIndexOf(delim);
  return new RegExp(src.slice(1, end), src.slice(end + 1).replace(/[^imsu]/g, ''));
}

function parseRules(rules) {
  const out = {};
  // regex rules may contain '|' so it must be last, as in the API.
  const m = /\|?regex:(.+)$/.exec(rules);
  if (m) {
    out.regex = m[1];
    rules = rules.slice(0, -m[0].length);
  }
  for (const rule of rules.split('|').filter(Boolean)) {
    const [name, ...arg] = rule.split(':');
    out[name] = arg.join(':');
  }
  return out;
}

const PHONE = /^(\+?234|0)[789][01]\d{8}$|^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalisePhone(phone) {
  const digits = phone.replace(/[\s\-()]/g, '');
  const local = /^0([789][01]\d{8})$/.exec(digits) ?? /^234([789][01]\d{8})$/.exec(digits);
  return local ? `+234${local[1]}` : digits;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function check(value, r, label, data) {
  const inList = () =>
    r.in !== undefined && !r.in.split(',').includes(String(value)) ? `${label} is not a valid option.` : null;
  if ('int' in r) {
    if (!(Number.isInteger(value) || (typeof value === 'string' && /^-?\d+$/.test(value)))) {
      return `${label} must be a whole number.`;
    }
    const n = Number(value);
    if (r.min !== undefined && n < Number(r.min)) return `${label} must be at least ${r.min}.`;
    if (r.max !== undefined && n > Number(r.max)) return `${label} must be at most ${r.max}.`;
    return inList();
  }
  if ('bool' in r) {
    return [true, false, 0, 1, '0', '1', 'true', 'false'].includes(value)
      ? null
      : `${label} must be yes or no.`;
  }
  if (typeof value !== 'string') return `${label} must be text.`;
  const len = [...value].length;
  if (r.min !== undefined && len < Number(r.min)) return `${label} must be at least ${r.min} characters.`;
  if (r.max !== undefined && len > Number(r.max)) return `${label} must be at most ${r.max} characters.`;
  if ('email' in r && (!EMAIL.test(value) || len > 191)) return 'Enter a valid email address.';
  if ('phone' in r && !PHONE.test(value.replace(/[\s\-()]/g, ''))) {
    return 'Enter a valid phone number, e.g. 0803 123 4567 or +234 803 123 4567.';
  }
  if ('date' in r && !validDate(value)) return `${label} must be a valid date.`;
  if ('time' in r && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return `${label} must be a valid time (HH:MM).`;
  if (r.regex !== undefined && !phpRegex(r.regex).test(value)) return `${label} has an invalid format.`;
  if (r.same !== undefined && data[r.same] !== value) return `${label} does not match.`;
  return inList();
}

function cast(value, r) {
  if ('int' in r) return Number(value);
  if ('bool' in r) return [true, 1, '1', 'true'].includes(value);
  if ('email' in r) return value.toLowerCase();
  if ('phone' in r) return normalisePhone(value);
  return value;
}

/**
 * Port of App\Support\Validator: same rules, messages and normalisation. Returns only the
 * declared fields; fields that were sent empty come back as null, absent fields stay absent.
 */
export function validate(data, rules, labels = {}) {
  const clean = {};
  const errors = {};
  for (const [field, ruleString] of Object.entries(rules)) {
    const r = parseRules(ruleString);
    const label = labels[field] ?? field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
    let value = data[field] ?? null;
    if (typeof value === 'string') value = value.trim();
    const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if ('required' in r) errors[field] = `${label} is required.`;
      else if (field in data) clean[field] = null;
      continue;
    }
    const error = check(value, r, label, data);
    if (error) errors[field] = error;
    else clean[field] = cast(value, r);
  }
  if (Object.keys(errors).length) throw fail.fields(errors);
  return clean;
}

/** Validates query-string parameters (values arrive as strings). */
export function validateQuery(query, rules, labels) {
  return validate(Object.fromEntries(query.entries()), rules, labels);
}

/** '₦12,500' from kobo (Notifier::naira). */
export function naira(kobo) {
  return `₦${Math.trunc(kobo / 100).toLocaleString('en-US')}`;
}
