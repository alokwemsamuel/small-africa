import { useSearchParams } from 'react-router-dom';
import HeroScene from './HeroScene';

/**
 * DEV-ONLY page used by design/tools/render-hero.mjs to export the hero poster and video.
 * Not registered in production builds. The nested data-theme pins the theme regardless of
 * the visitor's saved appearance.
 */
export default function HeroCapture() {
  const [params] = useSearchParams();
  const theme = params.get('theme') === 'light' ? 'light' : 'dark';
  return (
    <div data-theme={theme} className="bg-surface fixed inset-0 z-[100]">
      <div className="bg-pattern absolute inset-0 opacity-[0.04]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_62%_45%,rgba(201,162,75,0.18),transparent_60%)]" />
      <HeroScene theme={theme} capture onRevealed={() => {}} />
    </div>
  );
}
