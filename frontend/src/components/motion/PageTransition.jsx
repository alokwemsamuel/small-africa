import { useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Soft fade-and-rise when the route changes (CSS animation; instant with reduced motion).
 * The landing page of a visit appears without animation so nothing delays the first paint.
 */
export function PageTransition({ children }) {
  const { pathname } = useLocation();
  const landing = useRef(pathname).current;
  const animate = pathname !== landing;
  return (
    <div key={pathname} className={animate ? 'rise-in' : undefined}>
      {children}
    </div>
  );
}
