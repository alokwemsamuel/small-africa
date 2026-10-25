import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { adminApi, type ContactMessage, type Enquiry } from '../api';
import { AdminHeader, Empty, Loading, Pager, Panel, SelectField, StatusPill } from '../ui';
import { fmt } from '../format';

export function EnquiriesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'messages' ? 'messages' : 'events';
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Enquiries & messages"
        intro="Event and catering enquiries, and messages from the contact form."
      />
      <div role="tablist" aria-label="Enquiry type" className="border-line flex gap-1 border-b">
        {(['events', 'messages'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setParams(t === 'messages' ? { tab: t } : {}, { replace: true })}
            className={cn(
              '-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold',
              tab === t ? 'border-accent text-accent' : 'text-secondary border-transparent',
            )}
          >
            {t === 'events' ? 'Events & catering' : 'Contact messages'}
          </button>
        ))}
      </div>
      {tab === 'events' ? <Events /> : <Messages />}
    </div>
  );
}

function Events() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['admin', 'enquiries', status, page],
    queryFn: ({ signal }) => adminApi.enquiries({ status, page }, signal),
    placeholderData: keepPreviousData,
  });
  const move = async (e: Enquiry, s: Enquiry['status']) => {
    await adminApi.updateEnquiry(e.id, s);
    void qc.invalidateQueries({ queryKey: ['admin', 'enquiries'] });
    toast(`${e.name}: ${fmt.label(s).toLowerCase()}`);
  };
  return (
    <>
      <SelectField
        label="Status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          ['', 'All'],
          ['new', 'New'],
          ['contacted', 'Contacted'],
          ['quoted', 'Quoted'],
          ['booked', 'Booked'],
          ['closed', 'Closed'],
        ]}
        className="w-48"
      />
      {!data ? (
        <Loading error={error} />
      ) : data.items.length === 0 ? (
        <Empty>No enquiries.</Empty>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((e) => (
            <li key={e.id}>
              <Panel>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{e.name}</span>
                  <StatusPill status={e.status} />
                  <span className="text-secondary text-sm">
                    {fmt.label(e.eventType)} · {fmt.date(e.eventDate)} · {e.guests} guests
                    {e.package && ` · ${e.package}`}
                    {e.budgetKobo && ` · budget ${formatNaira(e.budgetKobo)}`}
                  </span>
                  <span className="text-muted ml-auto text-xs">Received {fmt.dateTime(e.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm">
                  <a href={`mailto:${e.email}`} className="text-accent underline">
                    {e.email}
                  </a>{' '}
                  ·{' '}
                  <a href={`tel:${e.phone}`} className="text-accent underline">
                    {e.phone}
                  </a>
                  {e.company && ` · ${e.company}`}
                </p>
                {e.message && <p className="text-secondary mt-2 text-sm whitespace-pre-line">{e.message}</p>}
                <SelectField
                  label="Move to"
                  value={e.status}
                  onChange={(v) => move(e, v as Enquiry['status'])}
                  options={[
                    ['new', 'New'],
                    ['contacted', 'Contacted'],
                    ['quoted', 'Quoted'],
                    ['booked', 'Booked'],
                    ['closed', 'Closed'],
                  ]}
                  className="mt-3 w-44"
                />
              </Panel>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </>
  );
}

function Messages() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['admin', 'messages', status, page],
    queryFn: ({ signal }) => adminApi.messages({ status, page }, signal),
    placeholderData: keepPreviousData,
  });
  const move = async (m: ContactMessage, s: ContactMessage['status']) => {
    await adminApi.updateMessage(m.id, s);
    void qc.invalidateQueries({ queryKey: ['admin', 'messages'] });
  };
  return (
    <>
      <SelectField
        label="Status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={[
          ['', 'Inbox'],
          ['new', 'New'],
          ['read', 'Read'],
          ['replied', 'Replied'],
          ['archived', 'Archived'],
        ]}
        className="w-48"
      />
      {!data ? (
        <Loading error={error} />
      ) : data.items.length === 0 ? (
        <Empty>No messages.</Empty>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((m) => (
            <li key={m.id}>
              <Panel>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{m.subject}</span>
                  <StatusPill status={m.status} />
                  <span className="text-muted ml-auto text-xs">{fmt.dateTime(m.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm">
                  {m.name} ·{' '}
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent('Re: ' + m.subject)}`}
                    onClick={() => m.status === 'new' && move(m, 'read')}
                    className="text-accent underline"
                  >
                    {m.email}
                  </a>
                  {m.phone && (
                    <>
                      {' '}
                      ·{' '}
                      <a href={`tel:${m.phone}`} className="text-accent underline">
                        {m.phone}
                      </a>
                    </>
                  )}
                </p>
                <p className="text-secondary mt-2 text-sm whitespace-pre-line">{m.message}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {m.status !== 'read' && (
                    <button type="button" className="text-accent underline" onClick={() => move(m, 'read')}>
                      Mark read
                    </button>
                  )}
                  {m.status !== 'replied' && (
                    <button
                      type="button"
                      className="text-accent underline"
                      onClick={() => move(m, 'replied')}
                    >
                      Mark replied
                    </button>
                  )}
                  {m.status !== 'archived' && (
                    <button
                      type="button"
                      className="text-accent underline"
                      onClick={() => move(m, 'archived')}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </>
  );
}
