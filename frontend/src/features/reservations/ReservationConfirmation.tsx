import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { formatTime } from '@/features/checkout/schedule';
import { icsFor, longDate, reservationsApi, type Reservation } from './api';

const STATUS_LABEL: Record<Reservation['status'], string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'Missed',
};

function downloadIcs(r: Reservation) {
  const url = URL.createObjectURL(new Blob([icsFor(r)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `small-africa-${r.code}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shown straight after booking, and on the emailed manage link. */
export function ReservationConfirmation({
  reservation: initial,
  manageToken,
  isNew = false,
}: {
  reservation: Reservation;
  manageToken: string | null;
  isNew?: boolean;
}) {
  const [r, setR] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upcoming = r.status === 'pending' || r.status === 'confirmed';

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      setR(await reservationsApi.cancel(r.code, manageToken));
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={`Reservation ${r.code}`}
        title={
          r.status === 'cancelled'
            ? 'Reservation cancelled'
            : isNew
              ? `See you soon, ${r.name.split(' ')[0]}`
              : 'Your reservation'
        }
        intro={isNew ? 'We’ve emailed your confirmation with a link to manage this booking.' : undefined}
      />
      <div className="container-luxe pb-24">
        <section className="border-line bg-surface-raised max-w-2xl rounded-md border p-6 sm:p-8">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Item label="Date">{longDate(r.date)}</Item>
            <Item label="Time">{formatTime(r.time)}</Item>
            <Item label="Guests">{r.partySize}</Item>
            <Item label="Seating">{r.area?.name ?? 'Main dining room'}</Item>
            <Item label="Status">{STATUS_LABEL[r.status]}</Item>
            <Item label="Booking code">
              <span className="font-mono tracking-wider">{r.code}</span>
            </Item>
            {r.notes && (
              <div className="sm:col-span-2">
                <Item label="Requests">{r.notes}</Item>
              </div>
            )}
          </dl>
          {r.status === 'cancelled' && !isNew && (
            <Alert tone="info" className="mt-6">
              This booking is cancelled. We hope to welcome you another time.
            </Alert>
          )}
          {error && (
            <Alert tone="error" className="mt-6">
              {error}
            </Alert>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {upcoming && (
              <Button variant="secondary" onClick={() => downloadIcs(r)}>
                Add to calendar
              </Button>
            )}
            {upcoming && !confirming && (
              <Button variant="ghost" onClick={() => setConfirming(true)}>
                Cancel booking
              </Button>
            )}
            {r.status === 'cancelled' && <ButtonLink to="/reservations">Book another table</ButtonLink>}
          </div>
          {upcoming && confirming && (
            <div
              role="group"
              aria-label="Confirm cancellation"
              className="border-line mt-6 flex flex-col gap-4 border-t pt-6"
            >
              <p>
                Cancel your table for {r.partySize} on {longDate(r.date)}?
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="danger" loading={busy} onClick={cancel}>
                  Yes, cancel it
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep my booking
                </Button>
              </div>
            </div>
          )}
          <p className="text-muted mt-8 text-sm">
            Running late or need to change the time? Call or WhatsApp us with your booking code. We hold
            tables for 15 minutes.
          </p>
        </section>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="mt-1 text-lg">{children}</dd>
    </div>
  );
}
