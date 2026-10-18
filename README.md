# SiteMind — interactive 3D product demonstration

Three synchronized panels driven by one simulated timeline (`src/sim`):

- **Left** – connected construction site (React Three Fiber): drones, cameras, sensors and wearables sending live data.
- **Middle** – close-up cartoon scenes: missing hard hat and exclusion-zone breach (Level 14), trip hazard (L7 Room 8), timber flooring progress (L9 Room 12).
- **Right** – the SiteMind application (React + CSS + Framer Motion): live alerts, activity feed, site overview and the auto-updating programme.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # production build in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

`sitemind-demo.html` is a prebuilt single-file copy: open it in any modern browser to play the demo without installing anything.

Controls: Space play/pause · ←/→ seek 5s · R restart · F full screen. Scenario buttons above the timeline replay individual events.

All panel state is derived from `sim.t` (see `src/sim/timeline.ts` for every event beat), so scrubbing, replaying and looping stay in sync.
