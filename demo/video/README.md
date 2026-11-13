# Rehearsal demo video (HyperFrames)

83-second, 1920x1080 demo video built with [HyperFrames](https://github.com/heygen-com/hyperframes)
(HeyGen's open-source HTML-to-video framework). `index.html` is the whole composition: nine
timed `<section class="clip">` scenes plus one paused GSAP timeline registered on
`window.__timelines["main"]`.

## Rebuild

```bash
export PATH=$HOME/.local/node/bin:$PATH   # Node >= 22, ffmpeg on PATH

# 1. Real artifacts: run the dashboard and a live experiment
npm run dev                                # repo root, http://localhost:3000
curl -X POST localhost:3000/api/experiments -H 'content-type: application/json' \
  -d '{"url":"https://ai.engineer/code/2026","goal":"find the conference schedule"}'
curl -X POST localhost:3000/api/experiments/<id>/run
cd demo/video && node scripts/capture.mjs <id>   # writes assets/dashboard.png (full page; crop to the top 2000x1250)
cp ../../data/evidence/<id>_desktop_d0.png assets/aie-site.png

# 2. Check, preview, render
npx hyperframes@0.9.42 lint .
npx hyperframes@0.9.42 snapshot --at 5,20,40
npx hyperframes@0.9.42 render --quality standard -o out/rehearsal-demo.mp4
```

The numbers on screen (30 states, 400 edges, 0/10 browser runs passed, 42 findings) come from
experiment `exp_f07cd3a8`, run on 2026-11-13 against the live site.
