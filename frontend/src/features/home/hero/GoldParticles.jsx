import { useEffect, useRef } from 'react';

interface Mote {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  phase: number;
  alpha: number;
}

/**
 * Subtle gold dust drifting up through the hero light. A single 2D canvas (no WebGL), about
 * 40 motes on desktop and 22 on phones, drawn only while the hero is on screen and the tab is
 * visible. `running` lets the hero's pause button stop it too.
 */
export function GoldParticles({ running, className }: { running: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !running) return;

    let w = 0;
    let h = 0;
    let motes: Mote[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const spawn = (anywhere: boolean): Mote => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 1.8,
      vy: 6 + Math.random() * 14, // px per second, upwards
      drift: 4 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.25 + Math.random() * 0.5,
    });
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 640 ? 22 : 40;
      motes = Array.from({ length: count }, () => spawn(true));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    io.observe(el);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y -= m.vy * dt;
        m.phase += dt * 0.8;
        const x = m.x + Math.sin(m.phase) * m.drift;
        // Fade in from the bottom and out towards the top.
        const life = Math.max(0, Math.min(1, m.y / (h * 0.25), (h - m.y) / (h * 0.15)));
        const twinkle = 0.75 + 0.25 * Math.sin(m.phase * 3);
        const g = ctx.createRadialGradient(x, m.y, 0, x, m.y, m.r * 3);
        g.addColorStop(0, `rgba(240, 214, 140, ${m.alpha * life * twinkle})`);
        g.addColorStop(1, 'rgba(201, 162, 75, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, m.y, m.r * 3, 0, Math.PI * 2);
        ctx.fill();
        if (m.y < -10) Object.assign(m, spawn(false));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      ctx.clearRect(0, 0, w, h);
    };
  }, [running]);

  return <canvas ref={canvas} aria-hidden="true" className={className} />;
}
