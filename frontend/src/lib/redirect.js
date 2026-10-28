/** A full-page navigation (away from the single-page app), e.g. to a sign-in provider. Wrapped so tests can watch it. */
export function redirectTo(url) {
  window.location.assign(url);
}
