import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Reveal } from '@/components/motion/Reveal';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Photo } from '@/components/ui/Photo';
import { TextField } from '@/components/ui/TextField';
import { useSite } from '@/hooks/useMenu';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { formatNaira } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { useHydrated } from '@/lib/hydration';

const PACKAGE_PHOTOS = {
  'private-dining': 'ambience/private-dining',
  corporate: 'ambience/chandelier-room',
  celebration: 'ambience/celebration-hall',
};

const phone = /^(\+?234|0)[789][01]\d{8}$|^\+[1-9]\d{7,14}$/;
const schema = z.object({
  name: z.string().trim().min(1, { error: 'Your name is required.' }).max(160),
  email: z.email({ error: 'Enter a valid email address.' }),
  phone: z
    .string()
    .trim()
    .refine((v) => phone.test(v.replace(/[\s\-()]/g, '')), { error: 'Enter a valid phone number.' }),
  company: z.string().trim().max(160),
  event_type: z.enum(['private_dining', 'corporate', 'wedding', 'birthday', 'other'], {
    error: 'Choose an event type.',
  }),
  package: z.string(),
  event_date: z.string().min(1, { error: 'Choose a date.' }),
  guests: z.coerce
    .number({ error: 'Enter the number of guests.' })
    .int()
    .min(2, { error: 'At least 2 guests.' })
    .max(500),
  message: z.string().max(2000),
});

export function EventsPage() {
  useSeo({
    title: 'Events & Catering',
    description:
      'Private dining for up to 16, corporate lunches and dinners, weddings and celebrations for up to 200 guests at Small Africa, Lagos.',
  });
  const { data } = useSite();
  return (
    <>
      <PageHeader
        eyebrow="Events & catering"
        title="Celebrations, three kitchens deep"
        photo="ambience/celebration-hall"
        intro="From an intimate birthday dinner to a 200-guest wedding, our events team builds a menu across all three kitchens and looks after every detail."
      />
      <section aria-labelledby="packages-h" className="container-luxe py-20">
        <h2 id="packages-h" className="text-4xl sm:text-5xl">
          Packages
        </h2>
        <Reveal stagger={0.12} as="ul" className="mt-10 grid gap-6 lg:grid-cols-3">
          {data?.eventPackages.map((p) => (
            <li
              key={p.slug}
              className="border-line bg-surface-raised flex flex-col overflow-hidden rounded-md border"
            >
              <Photo
                name={PACKAGE_PHOTOS[p.slug] ?? 'ambience/dining-room'}
                sizes="(min-width: 1024px) 33vw, 100vw"
                className="aspect-[16/10]"
              />
              <div className="flex flex-1 flex-col gap-4 p-6">
                <h3 className="text-3xl">{p.name}</h3>
                <p className="text-secondary">{p.summary}</p>
                <p className="text-accent font-semibold">
                  from {formatNaira(p.pricePerGuestKobo)}{' '}
                  <span className="text-muted text-sm font-normal">per guest</span>
                </p>
                <p className="text-muted text-sm">
                  {p.minGuests}–{p.maxGuests} guests
                </p>
                <ul className="text-secondary mt-2 flex flex-col gap-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-accent" aria-hidden="true">
                        ◆
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </Reveal>
      </section>
      <section aria-labelledby="enquire-h" className="bg-surface-raised py-20">
        <div className="container-luxe grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow text-accent">Enquire</p>
            <h2 id="enquire-h" className="mt-4 text-4xl sm:text-5xl">
              Tell us about your event
            </h2>
            <p className="text-secondary mt-6 text-lg leading-relaxed">
              Our events team replies within one working day with availability and a tailored proposal. Prefer
              to talk? WhatsApp us any time.
            </p>
          </div>
          <EnquiryForm packages={data?.eventPackages.map((p) => ({ slug: p.slug, name: p.name })) ?? []} />
        </div>
      </section>
    </>
  );
}

function EnquiryForm({ packages }) {
  const [done, setDone] = useState(null);
  const [formError, setFormError] = useState(null);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const hydrated = useHydrated(); // the pre-built page doesn't know tomorrow's date
  const { register, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      company: '',
      event_type: 'private_dining',
      package: '',
      event_date: '',
      guests: '',
      message: '',
    },
  });
  const e = formState.errors;
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const r = await api('/events/enquiries', {
        method: 'POST',
        body: { ...v, company: v.company || null, package: v.package || null, message: v.message || null },
      });
      setDone(r.message);
    } catch (err) {
      setFormError(
        applyServerErrors(err, setError, [
          'name',
          'email',
          'phone',
          'event_type',
          'event_date',
          'guests',
          'message',
        ]),
      );
    }
  });
  if (done)
    return (
      <Alert tone="success" title="Enquiry received">
        {done}
      </Alert>
    );
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Your name" autoComplete="name" error={e.name?.message} {...register('name')} />
        <TextField
          label="Company (optional)"
          autoComplete="organization"
          error={e.company?.message}
          {...register('company')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={e.email?.message}
          {...register('email')}
        />
        <TextField
          label="Phone"
          type="tel"
          autoComplete="tel"
          error={e.phone?.message}
          {...register('phone')}
        />
        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Event type</span>
          <select
            className="border-input bg-surface-inset text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none"
            {...register('event_type')}
          >
            <option value="private_dining">Private dining</option>
            <option value="corporate">Corporate</option>
            <option value="wedding">Wedding</option>
            <option value="birthday">Birthday / celebration</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Package (optional)</span>
          <select
            className="border-input bg-surface-inset text-primary focus:border-accent min-h-12 rounded-sm border px-4 focus:outline-none"
            {...register('package')}
          >
            <option value="">Not sure yet</option>
            {packages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="Date"
          type="date"
          min={hydrated ? tomorrow : undefined}
          error={e.event_date?.message}
          {...register('event_date')}
        />
        <TextField
          label="Guests"
          type="number"
          inputMode="numeric"
          min={2}
          max={500}
          error={e.guests?.message}
          {...register('guests')}
        />
      </div>
      <label className="flex flex-col gap-2">
        <span className="eyebrow text-muted">Tell us more (optional)</span>
        <textarea
          rows={4}
          className="border-input bg-surface-inset text-primary placeholder:text-muted focus:border-accent rounded-sm border px-4 py-3 focus:outline-none"
          placeholder="Occasion, budget, dietary needs, timings…"
          {...register('message')}
        />
      </label>
      <Button type="submit" size="lg" loading={formState.isSubmitting} className="self-start">
        Send enquiry
      </Button>
    </form>
  );
}
