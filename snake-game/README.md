# Snake Game

A classic Snake game built with vanilla HTML, CSS, and JavaScript. It runs entirely in the browser — no build step, backend, dependencies, API keys, or network access required.

## Features

- 20 × 20 playfield with smooth, interpolated snake movement
- Score, best score, and speed level displayed in the HUD
- Snake grows with every food item; speed increases as you eat
- Optional **wrap-around walls** mode (cross an edge and reappear on the other side)
- Start, pause/resume, and restart controls
- Arrow keys, WASD, mobile D-pad, and swipe controls
- Synthesised sound effects with a mute toggle
- Best score and preferences saved in `localStorage`
- Responsive dark neon design for desktop, tablet, and mobile

## Run the game locally

### Option 1 — open the file directly

Double-click `index.html`, or drag it into a browser window. No server is required.

### Option 2 — local static server (recommended)

From inside the project folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

You can use any static file server instead of Python. There is nothing to install or build.

## Controls

| Action | Control |
| --- | --- |
| Start game | **Start Game** button, or Space / Enter |
| Steer | Arrow keys or **W A S D** |
| Pause / resume | **Pause / Resume** button, Space, or P |
| Restart | **Restart** button, or R |
| Start new run after game over | **Restart Game** button, or Enter |
| Toggle sound | Speaker button in the top-right corner |
| Mobile steering | On-screen D-pad or swipe on the board |
| Wrap-around mode | Toggle **Wrap-around walls** before starting |

## Project structure

```text
snake-game/
├── index.html
├── README.md
├── css/
│   └── styles.css
└── js/
    ├── game.js
    └── sound.js
```

- **`index.html`** — page structure, HUD, canvas, overlays, controls
- **`css/styles.css`** — theme, layout, responsive rules, animations
- **`js/game.js`** — game loop, movement, collisions, scoring, rendering, input, storage
- **`js/sound.js`** — Web Audio sound effects (no audio files needed)

All visuals are drawn on the canvas, and all sounds are synthesised at runtime, so there are no external assets or network requests.

## Notes

- Sound is unlocked by the first click or key press, as required by browser autoplay rules.
- Best score, sound preference, and wrap-around preference are stored locally under keys beginning with `snakeGame.`. Clear the site's data to reset them.
- Requires a modern browser with Canvas, `requestAnimationFrame`, and Web Audio support.
