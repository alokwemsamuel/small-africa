// Renders the 3D hero to a poster (WebP) and a seamless 10-second loop (MP4 + WebM) per theme,
// using the real HeroScene in capture mode with deterministic frame stepping.
//
// Needs: the frontend dev server running (cd frontend && npm run dev) and ffmpeg on PATH.
// Run:   npm run hero
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const BASE = process.env.DEV_URL ?? 'http://localhost:5173';
const OUT = resolve(import.meta.dirname, '..', '..', 'frontend', 'public', 'hero');
const FPS = 25;
const LOOP_START = 4; // camera intro and cloche lift are finished by now
const LOOP_SECONDS = 10; // one leaf-to-leaf rotation: seamless
const W = 1600;
const H = 900;

const browserPath = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!browserPath) throw new Error('No Chromium browser found; set BROWSER');

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: browserPath,
  headless: true,
  protocolTimeout: 0, // software WebGL screenshots can be slow; never time out
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--hide-scrollbars'],
});

// HERO_THEMES=light renders one theme only. Don't edit frontend files while rendering:
// Vite's hot reload would restart the capture page.
const themes = (process.env.HERO_THEMES ?? 'dark,light').split(',');
for (const theme of themes) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/__hero-capture?theme=${theme}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof window.__heroAdvance === 'function', { timeout: 60_000 });
  const advanceTo = async (from, to) => {
    for (let t = from; t <= to + 1e-9; t += 1 / FPS) await page.evaluate((x) => window.__heroAdvance(x), t);
  };

  // Warm up the simulation (steam needs history), then capture.
  await advanceTo(0, LOOP_START);
  const frames = join(tmpdir(), `sa-hero-${theme}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const total = FPS * LOOP_SECONDS;
  for (let i = 0; i < total; i++) {
    await page.evaluate((x) => window.__heroAdvance(x), LOOP_START + i / FPS);
    const buf = await page.screenshot({ type: 'png' });
    await sharp(buf).jpeg({ quality: 92 }).toFile(join(frames, `f${String(i).padStart(4, '0')}.jpg`));
    if (i === Math.round(FPS * 3)) {
      // Poster: three seconds into the loop (cloche up, steam rising).
      await sharp(buf).webp({ quality: 72 }).toFile(join(OUT, `poster-${theme}.webp`));
    }
    if (i % 50 === 0) console.log(theme, `frame ${i}/${total}`);
  }
  await page.close();

  const input = ['-y', '-framerate', String(FPS), '-i', join(frames, 'f%04d.jpg'), '-vf', 'scale=1280:-2', '-an'];
  execFileSync('ffmpeg', [...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, `hero-${theme}.mp4`)], { stdio: 'ignore' });
  execFileSync('ffmpeg', [...input, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', join(OUT, `hero-${theme}.webm`)], { stdio: 'ignore' });
  rmSync(frames, { recursive: true, force: true });
  for (const f of [`poster-${theme}.webp`, `hero-${theme}.mp4`, `hero-${theme}.webm`]) {
    console.log(`  ${f}: ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} KB`);
  }
}
await browser.close();
