import { useCallback, useState } from 'react';
import { payWithPaystack } from './paystack';
import { SimulatedPayment } from './SimulatedPayment';

export interface PaymentStart {
  provider: 'paystack' | 'simulated';
  reference: string;
  accessCode: string;
  authorizationUrl: string | null;
}

/** Simulated runs report the guest's choice; Paystack always needs a server-side verify. */
export type PopupResult =
  { kind: 'simulated'; outcome: 'success' | 'failed' | 'abandoned' } | { kind: 'paystack' };

/**
 * Opens Paystack's secure popup, or the clearly labelled simulated one in development and the
 * demo. Render `popup` somewhere in the page. Whatever happens, the caller asks the server.
 */
export function usePaymentPopup() {
  const [sim, setSim] = useState<{
    amountKobo: number;
    email: string;
    reference: string;
    resolve: (o: 'success' | 'failed' | 'abandoned') => void;
  } | null>(null);

  const open = useCallback(
    async (
      payment: PaymentStart,
      info: { amountKobo: number; email: string; reference: string },
    ): Promise<PopupResult> => {
      if (payment.provider === 'simulated') {
        const outcome = await new Promise<'success' | 'failed' | 'abandoned'>((resolve) =>
          setSim({ ...info, resolve }),
        );
        setSim(null);
        return { kind: 'simulated', outcome };
      }
      await payWithPaystack(payment.accessCode);
      return { kind: 'paystack' };
    },
    [],
  );

  const popup = sim ? (
    <SimulatedPayment
      amountKobo={sim.amountKobo}
      email={sim.email}
      reference={sim.reference}
      onResult={sim.resolve}
    />
  ) : null;

  return { open, popup };
}
