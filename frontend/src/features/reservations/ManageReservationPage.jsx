import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useSeo } from '@/lib/seo';
import { reservationsApi } from './api';
import { ReservationConfirmation } from './ReservationConfirmation';

/** The "manage your booking" link from the confirmation email: /reservations/:code?t=… */
export function ManageReservationPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  useSeo({ title: 'Your reservation' });
  const { data, isPending, error } = useQuery({
    queryKey: ['reservation', code, token],
    queryFn: ({ signal }) => reservationsApi.get(code, token, signal),
  });

  if (isPending) {
    return (
      <div className="container-luxe grid min-h-[50vh] place-items-center">
        <Spinner label="Loading your reservation" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <>
        <PageHeader eyebrow="Reservations" title="We couldn’t find that booking" />
        <div className="container-luxe flex flex-col items-start gap-6 pb-24">
          <p className="text-secondary max-w-prose">
            Use the link in your confirmation email, or sign in to see your reservations.
          </p>
          <ButtonLink to="/reservations">Book a table</ButtonLink>
        </div>
      </>
    );
  }
  return <ReservationConfirmation key={data.code} reservation={data} manageToken={token} />;
}
