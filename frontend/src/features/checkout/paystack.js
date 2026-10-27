/**
 * Paystack Inline (v2). The script loads only when the guest pays; card details are entered
 * in Paystack's own secure popup and never touch our servers.
 */

const SCRIPT = 'https://js.paystack.co/v2/inline.js';
let loading = null;

function load() {
  if (window.PaystackPop) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Paystack could not be loaded. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens the Paystack popup; resolves "success" or "cancelled". The server verifies either way. */
export async function payWithPaystack(accessCode) {
  await load();
  return new Promise((resolve, reject) => {
    new window.PaystackPop().resumeTransaction(accessCode, {
      onSuccess: () => resolve('success'),
      onCancel: () => resolve('cancelled'),
      onError: (e) => reject(e instanceof Error ? e : new Error('Payment could not be completed.')),
    });
  });
}
