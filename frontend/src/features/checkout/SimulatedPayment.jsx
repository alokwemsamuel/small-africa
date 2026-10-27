import { useEffect, useRef } from 'react';
import { formatNaira } from '@/lib/format';

/**
 * Stand-in for the Paystack popup when the backend uses the simulated gateway (local
 * development and the client demo). Clearly labelled: no real money moves.
 */
export function SimulatedPayment({ amountKobo, email, reference, onResult }) {
  const dialog = useRef(null);
  const payBtn = useRef(null);
  useEffect(() => {
    dialog.current?.showModal();
    payBtn.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="sim-pay-title"
      onCancel={(e) => {
        e.preventDefault();
        onResult('abandoned');
      }}
      className="m-auto w-[min(420px,92vw)] rounded-lg bg-white p-0 text-[#0E0C0A] backdrop:bg-black/70"
    >
      <div className="border-b border-black/10 bg-[#f5f7fa] px-6 py-4">
        <p className="text-xs font-semibold tracking-wide text-[#3c4b5d] uppercase">
          Test payment · simulated
        </p>
        <h2 id="sim-pay-title" className="mt-1 font-sans text-lg font-bold">
          Pay {formatNaira(amountKobo)}
        </h2>
        <p className="text-sm text-[#4a5568]">
          {email} · {reference}
        </p>
      </div>
      <div className="flex flex-col gap-3 p-6 text-sm">
        <p className="rounded-md bg-[#fff7e6] p-3 text-[#7a4b00]">
          This is a simulated checkout for testing and demos. No card is charged. With live keys, Paystack’s
          secure popup appears here instead.
        </p>
        <button
          ref={payBtn}
          type="button"
          onClick={() => onResult('success')}
          className="min-h-11 rounded-md bg-[#0ba4db] font-semibold text-white hover:bg-[#0991c2]"
        >
          Pay {formatNaira(amountKobo)}
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onResult('failed')}
            className="min-h-10 flex-1 rounded-md border border-black/15 hover:bg-black/5"
          >
            Simulate decline
          </button>
          <button
            type="button"
            onClick={() => onResult('abandoned')}
            className="min-h-10 flex-1 rounded-md border border-black/15 hover:bg-black/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
