import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useSite } from '@/hooks/useMenu';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useSeo } from '@/lib/seo';
import { whatsappLink } from '@/lib/whatsapp';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const schema = z.object({
  name: z.string().trim().min(1, { error: 'Your name is required.' }).max(160),
  email: z.email({ error: 'Enter a valid email address.' }),
  phone: z.string().trim().max(20),
  subject: z.string().trim().min(1, { error: 'Add a subject.' }).max(160),
  message: z.string().trim().min(10, { error: 'Tell us a little more (at least 10 characters).' }).max(3000),
  website: z.string(), // honeypot
});

export function ContactPage() {
  useSeo({
    title: 'Contact',
    description:
      'Visit, call or WhatsApp Small Africa in Victoria Island, Lagos. Opening hours, directions and contact form.',
  });
  const { data } = useSite();
  const r = data?.restaurant;
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Come and find us"
        intro="Questions, feedback or a special request: we reply within one working day."
      />
      <div className="container-luxe grid gap-14 pb-24 lg:grid-cols-[1fr_1.3fr]">
        <aside className="flex flex-col gap-10">
          <section aria-labelledby="visit-h">
            <h2 id="visit-h" className="text-3xl">
              Visit
            </h2>
            <address className="text-secondary mt-3 leading-relaxed not-italic">
              {r?.address ?? 'Victoria Island, Lagos'}
            </address>
            <MapEmbed query={r?.map_embed_query ?? 'Victoria Island, Lagos'} />
          </section>
          <section aria-labelledby="hours-h">
            <h2 id="hours-h" className="text-3xl">
              Opening hours
            </h2>
            <dl className="text-secondary mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
              {data?.openingHours.map((h) => (
                <div key={h.dayOfWeek} className="contents">
                  <dt>{DAYS[h.dayOfWeek]}</dt>
                  <dd>
                    {h.isClosed ? 'Closed' : `${h.opensAt} – ${h.closesAt === '23:59' ? 'late' : h.closesAt}`}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="call-h">
            <h2 id="call-h" className="text-3xl">
              Call or message
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              <li>
                <a href={`tel:${(r?.phone ?? '').replace(/\s/g, '')}`} className="text-accent underline">
                  {r?.phone}
                </a>
              </li>
              <li>
                <a
                  href={whatsappLink(r?.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  WhatsApp us
                </a>
              </li>
              <li>
                <a href={`mailto:${r?.email ?? 'hello@smallafrica.ng'}`} className="text-accent underline">
                  {r?.email ?? 'hello@smallafrica.ng'}
                </a>
              </li>
            </ul>
          </section>
        </aside>
        <section
          aria-labelledby="form-h"
          className="border-line bg-surface-raised rounded-md border p-6 sm:p-10"
        >
          <h2 id="form-h" className="text-3xl">
            Send us a message
          </h2>
          <ContactForm />
        </section>
      </div>
    </>
  );
}

/** Click-to-load map: no request to Google until the visitor asks (privacy and speed). */
function MapEmbed({ query }) {
  const [show, setShow] = useState(false);
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  return (
    <div className="border-line mt-4 overflow-hidden rounded-md border">
      {show ? (
        <iframe
          title="Map showing Small Africa"
          src={src}
          className="aspect-[4/3] w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="bg-surface-raised flex aspect-[4/3] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-muted text-sm">The map is provided by Google and loads only when you choose.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => setShow(true)}>
              Show map
            </Button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent self-center text-sm underline"
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactForm() {
  const [done, setDone] = useState(null);
  const [formError, setFormError] = useState(null);
  const { register, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', phone: '', subject: '', message: '', website: '' },
  });
  const e = formState.errors;
  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const r = await api('/contact', {
        method: 'POST',
        body: { ...v, phone: v.phone || null },
      });
      setDone(r.message);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['name', 'email', 'phone', 'subject', 'message']));
    }
  });
  if (done)
    return (
      <Alert tone="success" title="Message sent" className="mt-6">
        {done}
      </Alert>
    );
  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Your name" autoComplete="name" error={e.name?.message} {...register('name')} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={e.email?.message}
          {...register('email')}
        />
        <TextField
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          error={e.phone?.message}
          {...register('phone')}
        />
        <TextField label="Subject" error={e.subject?.message} {...register('subject')} />
      </div>
      <label className="flex flex-col gap-2">
        <span className="eyebrow text-muted">Message</span>
        <textarea
          rows={6}
          aria-invalid={e.message ? true : undefined}
          className="border-input bg-surface-inset text-primary focus:border-accent rounded-sm border px-4 py-3 focus:outline-none"
          {...register('message')}
        />
        {e.message && (
          <span className="text-danger text-sm" role="alert">
            {e.message.message}
          </span>
        )}
      </label>
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Leave this empty
          <input tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>
      <Button type="submit" size="lg" loading={formState.isSubmitting} className="self-start">
        Send message
      </Button>
    </form>
  );
}
