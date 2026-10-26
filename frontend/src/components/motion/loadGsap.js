/**
 * GSAP + ScrollTrigger, loaded on demand (after first paint) so they are never on the
 * critical path. The promise is shared, so the library loads once.
 */
let loading: Promise<typeof import('./gsap')> | null = null;

export const loadGsap = () => (loading ??= import('./gsap'));

/** Re-measures scroll animations after a layout change, if GSAP has been loaded at all. */
export function refreshScrollTriggers(): void {
  void loading?.then(({ ScrollTrigger }) => ScrollTrigger.refresh());
}
