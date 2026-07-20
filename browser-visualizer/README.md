# Golden Lines Browser Visualizer

This folder contains a standalone browser-only implementation of the video visualizer using JavaScript and Mediabunny.

## What it does

- Loads a local audio file in the browser
- Decodes and analyzes the audio with the Web Audio API
- Renders a live preview on a canvas
- Exports an MP4 directly in the browser with Mediabunny

## Run it

```bash
cd browser-visualizer
npm install
npm run dev
```

If you use Live Server or another static server, open `browser-visualizer/index.html` from that folder so the relative module path resolves correctly.

This folder also uses an import map so the `mediabunny` bare specifier resolves in the browser without a bundler.

## Notes

- Preview and export use the same rendering logic.
- Export is intentionally separate so you can inspect the look first, then generate the final video.
- This is a clean browser-first port; the original Processing sketch is left untouched.
