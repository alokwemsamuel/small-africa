import { useCallback, useState } from 'react';
import { payWithPaystack } from './paystack';
import { SimulatedPayment } from './SimulatedPayment';

/**
 * Opens Paystack's secure popup, or the clearly labelled simulated one in development and the
 * demo. Render `popup` somewhere in the page. Whatever happens, the caller asks the server.
 */
/**
 * @returns {{ open: (payment: object, info: { amountKobo: number, email: string, reference: string })
 *   => Promise<{ kind: 'simulated', outcome: 'success' | 'failed' | 'abandoned' } | { kind: 'paystack' }>,
 *   popup: import('react').ReactNode }} simulated runs report the guest's choice; Paystack always
 *   needs a server-side verify
 */
export function usePaymentPopup() {
  const [sim, setSim] = useState(null);

  const open = useCallback(async (payment, info) => {
    if (payment.provider === 'simulated') {
      const outcome = await new Promise((resolve) => setSim({ ...info, resolve }));
      setSim(null);
      return { kind: 'simulated', outcome };
    }
    await payWithPaystack(payment.accessCode);
    return { kind: 'paystack' };
  }, []);

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
