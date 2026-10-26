// Builds the cinematic hero video and posters from the two Pexels clips in design/video/.
//
//   cd design/tools && npm run hero-video
//
// Sources (Pexels licence, free for commercial use; originals are not committed):
//   design/video/3769032-hd_1920_1080_25fps.mp4  https://www.pexels.com/video/3769032/  (cloche reveal)
//   design/video/3769033-hd_1920_1080_25fps.mp4  https://www.pexels.com/video/3769033/  (consommé pour)
//
// Edit: the cloche reveal (first 3.8s, graded to match) crossfades into the pour; the end crossfades
// back into the start for a seamless loop; the loop is rotated so its first frame is the poster
// frame (mid-pour), so swapping the poster for the video is invisible. Outputs, all muted with no
// audio track, go to frontend/public/hero/:
//   hero-1920.mp4 / .webm         1920×1080 desktop
//   hero-720x1280.mp4 / .webm     720×1280 vertical crop for phones (food kept centred)
//   poster-1920.avif / .webp, poster-1280.webp, poster-720x1280.avif / .webp
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../video');
const work = join(src, 'build'); // git-ignored intermediates
const out = resolve(here, '../../frontend/public/hero');
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });

const CLOCHE = join(src, '3769032-hd_1920_1080_25fps.mp4');
const POUR = join(src, '3769033-hd_1920_1080_25fps.mp4');
for (const f of [CLOCHE, POUR]) if (!existsSync(f)) throw new Error(`Missing source clip: ${f}`);

const CLOCHE_LEN = 3.8; // after ~3.8s the clip fills with fog
const FADE = 1.0; // both crossfades
const POUR_LEN = 8.8;
const POSTER_IN_POUR = 3.5; // the sharpest mid-pour frame
// Grade for the cloche shot so it sits next to the pour (darker, more contrast, neutral whites).
const GRADE = 'curves=preset=strong_contrast,eq=saturation=1.12:brightness=-0.02,colorbalance=rm=0.03:bm=-0.02';
const MAX_BYTES = 4 * 1024 * 1024;

const master = CLOCHE_LEN + POUR_LEN - FADE; // cloche → pour
const loop = master - FADE; // after folding the end into the start
// Loop time of the poster frame: pour starts at (CLOCHE_LEN - FADE) in the master; loop time = master time - FADE.
const rotateAt = CLOCHE_LEN - FADE + POSTER_IN_POUR - FADE;

function ffmpeg(args, label) {
  process.stdout.write(`• ${label}… `);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${label}`);
  console.log('done');
}

// 1. Edit + seamless loop + rotation, as a near-lossless master.
const masterFile = join(work, 'hero-master.mp4');
ffmpeg(
  [
    '-i', CLOCHE, '-i', POUR,
    '-filter_complex',
    [
      `[0:v]trim=0:${CLOCHE_LEN},setpts=PTS-STARTPTS,${GRADE},format=yuv420p[a]`,
      `[1:v]trim=0:${POUR_LEN},setpts=PTS-STARTPTS,format=yuv420p[b]`,
      `[a][b]xfade=transition=fade:duration=${FADE}:offset=${CLOCHE_LEN - FADE}[m]`,
      `[m]split[m1][m2]`,
      `[m1]trim=0:${FADE},setpts=PTS-STARTPTS[head]`,
      `[m2]trim=${FADE}:${master},setpts=PTS-STARTPTS[body]`,
      // The end of the body fades into the head, whose last frame is the body's first: seamless.
      `[body][head]xfade=transition=fade:duration=${FADE}:offset=${master - 2 * FADE}[loop]`,
      `[loop]split[l1][l2]`,
      `[l1]trim=${rotateAt}:${loop},setpts=PTS-STARTPTS[late]`,
      `[l2]trim=0:${rotateAt},setpts=PTS-STARTPTS[early]`,
      `[late][early]concat=n=2:v=1:a=0,fps=25[v]`,
    ].join(';'),
    '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '10', '-preset', 'medium', '-pix_fmt', 'yuv420p', masterFile,
  ],
  `master (${loop.toFixed(1)}s loop)`,
);

// 2. Web encodes. Phones get a 9:16 crop around the centre, where the food sits in both shots.
const variants = [
  { name: 'hero-1920', vf: 'scale=1920:1080:flags=lanczos', x264: 24, vp9: 34 },
  { name: 'hero-720x1280', vf: 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=720:1280:flags=lanczos', x264: 23, vp9: 33 },
];
for (const v of variants) {
  let crf = v.x264;
  for (;;) {
    ffmpeg(
      ['-i', masterFile, '-vf', v.vf, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'slow', '-crf', String(crf),
        '-pix_fmt', 'yuv420p', '-g', '50', '-movflags', '+faststart', join(out, `${v.name}.mp4`)],
      `${v.name}.mp4 (crf ${crf})`,
    );
    if (statSync(join(out, `${v.name}.mp4`)).size <= MAX_BYTES || crf >= 34) break;
    crf += 2;
  }
  let q = v.vp9;
  for (;;) {
    ffmpeg(
      ['-i', masterFile, '-vf', v.vf, '-an', '-c:v', 'libvpx-vp9', '-crf', String(q), '-b:v', '0', '-row-mt', '1', '-deadline', 'good',
        '-cpu-used', '2', '-g', '50', join(out, `${v.name}.webm`)],
      `${v.name}.webm (crf ${q})`,
    );
    if (statSync(join(out, `${v.name}.webm`)).size <= MAX_BYTES || q >= 46) break;
    q += 3;
  }
}

// 3. Posters from the master's first frame (= the video's first frame).
const frame = join(work, 'poster.png');
ffmpeg(['-i', masterFile, '-frames:v', '1', frame], 'poster frame');
const img = sharp(frame);
await img.clone().resize(1920, 1080).avif({ quality: 52, effort: 6 }).toFile(join(out, 'poster-1920.avif'));
await img.clone().resize(1920, 1080).webp({ quality: 80, effort: 6 }).toFile(join(out, 'poster-1920.webp'));
await img.clone().resize(1280, 720).webp({ quality: 80, effort: 6 }).toFile(join(out, 'poster-1280.webp'));
const w = Math.round((1080 * 9) / 16);
const crop = img.clone().extract({ left: Math.round((1920 - w) / 2), top: 0, width: w, height: 1080 }).resize(720, 1280);
await crop.clone().avif({ quality: 52, effort: 6 }).toFile(join(out, 'poster-720x1280.avif'));
await crop.clone().webp({ quality: 80, effort: 6 }).toFile(join(out, 'poster-720x1280.webp'));

for (const f of ['hero-1920.mp4', 'hero-1920.webm', 'hero-720x1280.mp4', 'hero-720x1280.webm', 'poster-1920.avif', 'poster-1920.webp', 'poster-1280.webp', 'poster-720x1280.avif', 'poster-720x1280.webp']) {
  const kb = statSync(join(out, f)).size / 1024;
  console.log(`${f.padEnd(24)} ${kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : Math.round(kb) + ' KB'}`);
}
