import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatNaira } from '@/lib/format';
import { adminApi } from '../api';
import { AdminHeader, Empty, Loading, Pager, Panel, SearchBox, SelectField } from '../ui';
import { fmt, tdClass, thClass } from '../format';

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const set = (k, v) =>
    setParams(
      (p) => {
        if (v) p.set(k, v);
        else p.delete(k);
        if (k !== 'page') p.delete('page');
        return p;
      },
      { replace: true },
    );
  const filters = {
    q: params.get('q'),
    tier: params.get('tier'),
    sort: params.get('sort'),
    page: Number(params.get('page') ?? 1),
  };
  const { data, error } = useQuery({
    queryKey: ['admin', 'customers', filters],
    queryFn: ({ signal }) => adminApi.customers(filters, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader title="Customers" intro="Registered guests and their Interest Accounts." />
      <div className="flex flex-wrap items-end gap-3">
        <form
          className="flex min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set('q', q.trim());
          }}
        >
          <SearchBox value={q} onChange={setQ} placeholder="Name, email, phone or referral code" />
        </form>
        <SelectField
          label="Tier"
          value={filters.tier ?? ''}
          onChange={(v) => set('tier', v)}
          options={[
            ['', 'All tiers'],
            ['bronze', 'Bronze'],
            ['silver', 'Silver'],
            ['gold', 'Gold'],
            ['black_diamond', 'Black Diamond'],
          ]}
          className="w-44"
        />
        <SelectField
          label="Sort by"
          value={filters.sort ?? ''}
          onChange={(v) => set('sort', v)}
          options={[
            ['', 'Newest'],
            ['spend', '12-month spend'],
            ['wallet', 'Dining credit'],
            ['points', 'Points'],
            ['recent', 'Last visit'],
          ]}
          className="w-44"
        />
      </div>
      <Panel>
        {!data ? (
          <Loading error={error} />
        ) : data.items.length === 0 ? (
          <Empty>No customers match.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[48rem]">
              <thead>
                <tr>
                  <th scope="col" className={thClass}>
                    Customer
                  </th>
                  <th scope="col" className={thClass}>
                    Tier
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    12-month spend
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Dining credit
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Points
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Orders
                  </th>
                  <th scope="col" className={thClass}>
                    Last visit
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td className={tdClass}>
                      <Link
                        to={`/admin/customers/${c.id}`}
                        className="hover:text-accent font-semibold underline-offset-4 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="text-muted block text-xs">{c.email}</span>
                    </td>
                    <td className={tdClass}>{fmt.label(c.tier)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{formatNaira(c.spend12mKobo)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{formatNaira(c.walletKobo)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{fmt.number(c.points)}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>{c.orders}</td>
                    <td className={tdClass}>{fmt.date(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={(p) => set('page', String(p))} />}
      </Panel>
    </div>
  );
}
