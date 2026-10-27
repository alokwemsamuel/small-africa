const KEY = 'sa-device';

/**
 * A random, anonymous id for this browser, used only to stop one person claiming many
 * referral rewards. The server stores a keyed hash of it, never the id itself.
 */
export function deviceId() {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null; // storage blocked: the referral still works, just without this check
  }
}
