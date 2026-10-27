import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { useMe } from '@/hooks/useAuth';
import { formatTime, lagosNow } from '@/lib/lagosTime';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { applyServerErrors } from '@/lib/forms';
import { useSeo } from '@/lib/seo';
import { reservationsApi } from '@/features/reservations/api';
import { ReservationConfirmation } from '@/features/reservations/components/ReservationConfirmation';
import { useHydrated } from '@/lib/hydration';

const MAX_ONLINE_PARTY = 12;
const MAX_DAYS_AHEAD = 60;

const OCCASIONS = [
  ['none', 'No special occasion'],
  ['birthday', 'Birthday'],
  ['anniversary', 'Anniversary'],
  ['date_night', 'Date night'],
  ['business', 'Business dinner'],
  ['celebration', 'Celebration'],
  ['other', 'Something else'],
];

const phone = /^(\+?234|0)[789][01]\d{8}$|^\+[1-9]\d{7,14}$/;
const detailsSchema = z.object({
  name: z.string().trim().min(1, { error: 'Your name is required.' }).max(160),
  email: z.email({ error: 'Enter a valid email address.' }),
  phone: z
    .string()
    .trim()
    .refine((v) => phone.test(v.replace(/[\s\-()]/g, '')), { error: 'Enter a valid phone number.' }),
  occasion: z.enum(OCCASIONS.map(([v]) => v)),
  notes: z.string().trim().max(500),
});

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function ReservationsPage() {
  useSeo({
    title: 'Reservations',
    description:
      'Book a table at Small Africa, Victoria Island: main dining room, terrace, private room or chef’s counter.',
  });
  const { data: user } = useMe();
  const today = lagosNow();
  const hydrated = useHydrated();
  const [date, setDate] = useState(ymd(today));
  const [party, setParty] = useState(2);
  const [slot, setSlot] = useState(null);
  const [booked, setBooked] = useState(null);
  const [error, setError] = useState(null);

  const availability = useQuery({
    queryKey: ['reservations', 'availability', date, party],
    queryFn: ({ signal }) => reservationsApi.availability(date, party, signal),
    enabled: party <= MAX_ONLINE_PARTY && !!date,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  useEffect(() => setSlot(null), [date, party]);

  const form = useForm({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: '', email: '', phone: '', occasion: 'none', notes: '' },
  });
  useEffect(() => {
    if (user)
      form.reset({
        ...form.getValues(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone ?? '',
      });
  }, [user, form]);

  const submit = form.handleSubmit(async (d) => {
    if (!slot) return;
    setError(null);
    try {
      const result = await reservationsApi.book({
        date,
        time: slot.time,
        party_size: party,
        area: slot.area,
        occasion: d.occasion,
        notes: d.notes || null,
        name: d.name,
        email: d.email,
        phone: d.phone,
      });
      setBooked(result);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('Someone just took that table. Please choose another time.');
        setSlot(null);
        void availability.refetch();
      } else {
        setError(applyServerErrors(e, form.setError, ['name', 'email', 'phone', 'occasion', 'notes']));
      }
    }
  });

  if (booked)
    return (
      <ReservationConfirmation reservation={booked.reservation} manageToken={booked.manageToken} isNew />
    );

  const maxDate = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + MAX_DAYS_AHEAD));
  const a = availability.data;
  const anyFree = a?.areas.some((ar) => ar.fitsParty && ar.slots.some((s) => s.available));
  const e = form.formState.errors;

  return (
    <>
      <PageHeader
        eyebrow="Reservations"
        title="Reserve your table"
        intro="Choose a day and party size to see live availability. Tables are held for 15 minutes past your booking time."
        photo="ambience/chandelier-room"
      />
      <div className="container-luxe flex flex-col gap-8 pb-24">
        <section
          aria-labelledby="when-title"
          className="border-line bg-surface-raised rounded-md border p-6 sm:p-8"
        >
          <h2 id="when-title" className="text-2xl">
            When and how many?
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:max-w-2xl">
            <TextField
              label="Date"
              type="date"
              // Today's date is only known in the browser: the pre-built page leaves these empty.
              min={hydrated ? ymd(today) : undefined}
              max={hydrated ? maxDate : undefined}
              value={hydrated ? date : ''}
              onChange={(ev) => setDate(ev.target.value)}
              required
            />
            <label className="flex flex-col gap-2">
              <span className="eyebrow text-muted">Guests</span>
              <select
                value={party}
                onChange={(ev) => setParty(Number(ev.target.value))}
                className="border-input bg-surface-raised text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none"
              >
                {Array.from({ length: MAX_ONLINE_PARTY }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'guest' : 'guests'}
                  </option>
                ))}
                <option value={MAX_ONLINE_PARTY + 1}>More than {MAX_ONLINE_PARTY}</option>
              </select>
            </label>
          </div>
        </section>

        {party > MAX_ONLINE_PARTY ? (
          <Alert tone="info" title="Planning something bigger?">
            For parties over {MAX_ONLINE_PARTY}, our events team will tailor the room and menu.{' '}
            <Link to="/events" className="text-accent underline">
              Send an event enquiry
            </Link>
            .
          </Alert>
        ) : (
          <section
            aria-labelledby="slots-title"
            aria-busy={availability.isFetching}
            className="flex flex-col gap-5"
          >
            <h2 id="slots-title" className="text-2xl">
              Available tables
            </h2>
            {availability.isPending && <Spinner label="Checking availability" />}
            {availability.error && <Alert tone="error">{availability.error.message}</Alert>}
            {a?.closed && <Alert tone="info">We’re closed on this day. Please choose another date.</Alert>}
            {a && !a.closed && !anyFree && (
              <Alert tone="info">
                Fully booked for {party} on this day. Try another date, or call us to join the waitlist.
              </Alert>
            )}
            {a && !a.closed && (
              <div className="grid gap-5 md:grid-cols-2">
                {a.areas
                  .filter((ar) => ar.fitsParty)
                  .map((ar) => (
                    <fieldset key={ar.slug} className="border-line bg-surface-raised rounded-md border p-5">
                      <legend className="sr-only">{ar.name}</legend>
                      <p className="font-serif text-xl" aria-hidden="true">
                        {ar.name}
                      </p>
                      <p className="text-secondary mt-1 text-sm">{ar.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {ar.slots.map((s) => {
                          const selected = slot?.area === ar.slug && slot.time === s.time;
                          return (
                            <button
                              key={s.time}
                              type="button"
                              disabled={!s.available}
                              aria-pressed={selected}
                              aria-label={`${ar.name} at ${formatTime(s.time)}${s.available ? '' : ', unavailable'}`}
                              onClick={() => setSlot({ area: ar.slug, time: s.time })}
                              className={cn(
                                'min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors',
                                selected
                                  ? 'border-accent-fill bg-accent-fill text-on-accent'
                                  : 'border-line hover:border-accent text-primary',
                                'disabled:text-muted disabled:hover:border-line disabled:cursor-not-allowed disabled:line-through disabled:opacity-60',
                              )}
                            >
                              {formatTime(s.time)}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))}
              </div>
            )}
          </section>
        )}

        {slot && party <= MAX_ONLINE_PARTY && (
          <form
            onSubmit={submit}
            noValidate
            aria-labelledby="details-title"
            className="border-line bg-surface-raised rounded-md border p-6 sm:p-8"
          >
            <h2 id="details-title" className="text-2xl">
              Your details
            </h2>
            <p className="text-secondary mt-1 text-sm">
              {a?.areas.find((ar) => ar.slug === slot.area)?.name} · {formatTime(slot.time)} ·{' '}
              {new Date(`${date}T12:00:00`).toLocaleDateString('en-NG', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              · {party} {party === 1 ? 'guest' : 'guests'}
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <TextField
                label="Full name"
                autoComplete="name"
                error={e.name?.message}
                {...form.register('name')}
              />
              <TextField
                label="Phone"
                type="tel"
                autoComplete="tel"
                error={e.phone?.message}
                {...form.register('phone')}
              />
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                hint="Your confirmation and manage link go here."
                error={e.email?.message}
                {...form.register('email')}
              />
              <label className="flex flex-col gap-2">
                <span className="eyebrow text-muted">Occasion</span>
                <select
                  {...form.register('occasion')}
                  className="border-input bg-surface-raised text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none"
                >
                  {OCCASIONS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 sm:col-span-2">
                <span className="eyebrow text-muted">Requests (optional)</span>
                <textarea
                  rows={3}
                  placeholder="Allergies, high chair, a quiet corner…"
                  className="border-input bg-surface-raised text-primary focus:border-accent rounded-sm border px-4 py-3 focus:outline-none"
                  {...form.register('notes')}
                />
              </label>
            </div>
            {error && (
              <Alert tone="error" className="mt-5">
                {error}
              </Alert>
            )}
            <Button type="submit" size="lg" className="mt-6" loading={form.formState.isSubmitting}>
              Confirm reservation
            </Button>
          </form>
        )}
        {!slot && error && <Alert tone="error">{error}</Alert>}
      </div>
    </>
  );
}
