import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '../api';
import { Loading } from '../ui';
import { fmt } from '../format';

/**
 * Kitchen ticket: a plain black-on-white page sized for an 80mm receipt printer (it also prints
 * fine on A4). Opens the print dialog automatically.
 */
export function OrderTicketPage() {
  const { reference = '' } = useParams();
  const { data: o, error } = useQuery({
    queryKey: ['admin', 'order', reference],
    queryFn: ({ signal }) => adminApi.order(reference, signal),
  });
  useEffect(() => {
    if (o) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [o]);
  if (!o) return <Loading error={error} />;
  return (
    <div className="mx-auto max-w-[80mm] bg-white p-3 font-mono text-[13px] leading-snug text-black print:p-0">
      <p className="text-center text-base font-bold">SMALL AFRICA · KITCHEN</p>
      <p className="text-center text-2xl font-bold">{o.reference}</p>
      <p className="text-center font-bold uppercase">
        {o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
        {o.scheduledFor ? ` · for ${fmt.dateTime(o.scheduledFor)}` : ' · ASAP'}
      </p>
      <p className="text-center">Placed {fmt.dateTime(o.placedAt)}</p>
      <hr className="my-2 border-dashed border-black" />
      <ul>
        {o.items?.map((i, n) => (
          <li key={n} className="mb-2">
            <p className="font-bold">
              {i.quantity} × {i.name}
            </p>
            {i.portion && <p> {i.portion.name}</p>}
            {i.addons.map((a) => (
              <p key={a.id}> + {a.name}</p>
            ))}
            {i.containsPork && <p> ** CONTAINS PORK **</p>}
            {i.note && <p> NOTE: {i.note}</p>}
          </li>
        ))}
      </ul>
      {o.notes && (
        <>
          <hr className="my-2 border-dashed border-black" />
          <p className="font-bold">CUSTOMER NOTE:</p>
          <p>{o.notes}</p>
        </>
      )}
      <hr className="my-2 border-dashed border-black" />
      <p>{o.customer.name}</p>
      <p>{o.customer.phone}</p>
      {o.address && <p>{[o.address.line1, o.address.landmark, o.address.area].filter(Boolean).join(', ')}</p>}
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-4 w-full border border-black py-2 print:hidden"
      >
        Print again
      </button>
    </div>
  );
}
