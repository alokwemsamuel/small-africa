import { useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'sa-cookie-notice';

function dismissed() {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Informational notice. We only use an essential session cookie and local preferences
 * (no tracking), so there is nothing to consent to; we simply tell people.
 */
export function CookieNotice() {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;
  const close = () => {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };
  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="border-line bg-surface-raised fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-md border p-5 shadow-2xl shadow-black/30 sm:bottom-6 sm:left-6 sm:mx-0"
    >
      <p className="text-secondary text-sm leading-relaxed">
        We use one essential cookie to keep you signed in and secure, and store your basket and appearance
        settings on this device. No advertising or tracking cookies.{' '}
        <Link to="/privacy#cookies" className="text-accent underline">
          How we use cookies
        </Link>
      </p>
      <button
        type="button"
        onClick={close}
        className="bg-accent-fill text-on-accent hover:bg-accent-fill-hover mt-4 rounded-full px-5 py-2 text-xs font-semibold tracking-wide uppercase"
      >
        Got it
      </button>
    </div>
  );
}
