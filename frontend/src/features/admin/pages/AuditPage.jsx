import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../api';
import { AdminHeader, CheckField, Empty, Loading, Pager, Panel, SearchBox, SelectField } from '../ui';
import { fmt, tdClass, thClass } from '../format';

const AREAS = [
  ['', 'Everything'],
  ['order', 'Orders'],
  ['reservation', 'Reservations'],
  ['menu', 'Menu'],
  ['loyalty', 'Interest Account'],
  ['wallet', 'Wallet top-ups'],
  ['coupon', 'Coupons'],
  ['review', 'Reviews'],
  ['settings', 'Settings'],
  ['staff', 'Staff'],
  ['auth', 'Sign-ins and accounts'],
];

export function AuditPage() {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [staffOnly, setStaffOnly] = useState(true);
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['admin', 'audit', action, q, staffOnly, page],
    queryFn: ({ signal }) => adminApi.audit({ action, q, staff: staffOnly ? 1 : null, page }, signal),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Audit log"
        intro="Every admin action and security event, with who, when and from where. Entries can’t be edited or deleted."
      />
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Area"
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          options={AREAS}
          className="w-56"
        />
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Person or reference"
        />
        <CheckField
          label="Staff actions only"
          checked={staffOnly}
          onChange={(v) => {
            setStaffOnly(v);
            setPage(1);
          }}
        />
      </div>
      <Panel>
        {!data ? (
          <Loading error={error} />
        ) : data.items.length === 0 ? (
          <Empty>No entries.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem]">
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    When
                  </th>
                  <th scope="col" className={thClass}>
                    Who
                  </th>
                  <th scope="col" className={thClass}>
                    Action
                  </th>
                  <th scope="col" className={thClass}>
                    On
                  </th>
                  <th scope="col" className={thClass}>
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className={`${tdClass} whitespace-nowrap`}>{fmt.dateTime(e.at)}</td>
                    <td className={tdClass}>
                      {e.actor ? e.actor.name : <span className="text-muted">System / guest</span>}
                      {e.ip && <span className="text-muted block text-xs">{e.ip}</span>}
                    </td>
                    <td className={`${tdClass} font-mono text-xs`}>{e.action}</td>
                    <td className={tdClass}>
                      {e.entityType && (
                        <>
                          {fmt.label(e.entityType)} <span className="font-mono text-xs">{e.entityId}</span>
                        </>
                      )}
                    </td>
                    <td className={`${tdClass} max-w-sm`}>
                      {e.meta && (
                        <code
                          className="text-secondary block truncate text-xs"
                          title={JSON.stringify(e.meta)}
                        >
                          {JSON.stringify(e.meta)}
                        </code>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </Panel>
    </div>
  );
}
