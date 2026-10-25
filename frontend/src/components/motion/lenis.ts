import type Lenis from 'lenis';

let instance: Lenis | null = null;

export function setLenis(l: Lenis | null) {
  instance = l;
}

/** Scrolls to top through Lenis when active, natively otherwise. */
export function scrollToTop() {
  if (instance) instance.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}
