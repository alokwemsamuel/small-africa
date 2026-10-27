import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderRoutes } from '@/test/utils';
import { Hero } from './Hero';

/** Answers media queries from a list of the ones that should match. */
function media(matching) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: matching.some((m) => query.includes(m)),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeEach(() => {
  play.mockClear();
  pause.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'connection');
});

const render = () => renderRoutes([{ path: '/', element: <Hero /> }]);
const sources = (c) => [...c.querySelectorAll('video source')].map((s) => s.getAttribute('src'));

describe('Hero', () => {
  it('plays the 1920×1080 loop on desktop, muted and inline, with a pause button', async () => {
    media([]);
    const { container } = render();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Three kitchens.One table.');
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    const video = container.querySelector('video');
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('loop');
    expect(sources(container)).toEqual(['/hero/hero-1920.webm', '/hero/hero-1920.mp4']);
    expect(play).toHaveBeenCalled();

    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Pause background video' });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
    await user.click(button);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play background video' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('uses the vertical 720×1280 cut on phones', async () => {
    media(['orientation: portrait']);
    const { container } = render();
    await waitFor(() =>
      expect(sources(container)).toEqual(['/hero/hero-720x1280.webm', '/hero/hero-720x1280.mp4']),
    );
  });

  it('shows only the poster with reduced motion', async () => {
    media(['prefers-reduced-motion']);
    const { container } = render();
    expect(container.querySelector('picture img')).toHaveAttribute('src', '/hero/poster-1920.webp');
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.queryByRole('button', { name: /background video/ })).not.toBeInTheDocument();
  });

  it('shows only the poster with Data Saver on', async () => {
    media([]);
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    const { container } = render();
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('offers Play when the browser refuses to autoplay', async () => {
    media([]);
    play.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')));
    render();
    expect(await screen.findByRole('button', { name: 'Play background video' })).toBeInTheDocument();
  });
});
