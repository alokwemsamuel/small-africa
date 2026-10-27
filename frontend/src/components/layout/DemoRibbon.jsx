import { useState } from 'react';

/**
 * Shown only in the demo build: says plainly that nothing is real, and lets the presenter
 * start over with today's data. The demo code loads only in that build.
 */
export function DemoRibbon() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    // Build-time constant: other builds drop the import below, so they ship no demo code or data.
    if (import.meta.env.VITE_DEMO_MODE !== 'true') return;
    setBusy(true);
    const { resetDemo } = await import('@/lib/demo');
    await resetDemo();
    window.location.assign(import.meta.env.BASE_URL);
  };

  const link = 'underline underline-offset-2 hover:no-underline disabled:opacity-60';
  return (
    <div
      role="note"
      className="bg-accent-fill/95 tracking-overline text-on-accent flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-xs font-semibold uppercase"
    >
      {/* Short on phones so the ribbon stays one line above the header. */}
      <span className="sm:hidden">Demo · nothing is real</span>
      <span className="hidden sm:inline">Demo version: no real payments or bookings</span>
      {confirming ? (
        <span className="flex items-center gap-2 tracking-normal normal-case">
          Start over with fresh data?
          <button type="button" className={link} onClick={reset} disabled={busy}>
            {busy ? 'Resetting…' : 'Yes, reset'}
          </button>
          <button type="button" className={link} onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={`${link} tracking-normal normal-case`}
          onClick={() => setConfirming(true)}
        >
          Reset demo data
        </button>
      )}
    </div>
  );
}
