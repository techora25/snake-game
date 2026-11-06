/* ==========================================================================
   Snake Game — game logic & rendering
   Pure JavaScript, no dependencies. The snake moves on a 20x20 grid and is
   rendered on a canvas with frame interpolation so motion looks smooth.
   ========================================================================== */

'use strict';

(() => {
  const GRID = { cols: 20, rows: 20 };
  const SPEED = { base: 150, min: 65, step: 5, levelEvery: 3 };
  const START_LENGTH = 4;
  const TAU = Math.PI * 2;
  const STORAGE = {
    highScore: 'snakeGame.highScore',
    sound: 'snakeGame.sound',
    wrap: 'snakeGame.wrap',
  };

  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEY_DIRECTIONS = {
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };

  const PARTICLE_COLORS = ['#4ade80', '#a3e635', '#fca5a5', '#f97316'];

  /* ------------------------------ Helpers ------------------------------ */

  function readStorage(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (error) {
      /* Storage can be unavailable (private mode / disabled); the game still works. */
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /** Pick the shortest way around a wrapped axis (e.g. 19 -> 0 is +1). */
  function shortestDelta(delta, size) {
    if (delta > size / 2) return delta - size;
    if (delta < -size / 2) return delta + size;
    return delta;
  }

  /**
   * Walk along a polyline and return `count` points spaced `spacing` apart.
   * Used to place body segments smoothly between grid steps.
   */
  function samplePath(points, count, spacing) {
    if (points.length === 0) return [];
    const result = [{ x: points[0].x, y: points[0].y }];
    let segmentStart = points[0];
    let index = 1;
    let travelled = 0;
    let target = spacing;

    while (result.length < count && index < points.length) {
      const segmentEnd = points[index];
      const dx = segmentEnd.x - segmentStart.x;
      const dy = segmentEnd.y - segmentStart.y;
      const length = Math.hypot(dx, dy);

      if (length === 0) {
        index += 1;
        segmentStart = segmentEnd;
        continue;
      }

      if (travelled + length >= target) {
        const ratio = (target - travelled) / length;
        result.push({
          x: segmentStart.x + dx * ratio,
          y: segmentStart.y + dy * ratio,
        });
        target += spacing;
      } else {
        travelled += length;
        segmentStart = segmentEnd;
        index += 1;
      }
    }

    const last = points[points.length - 1];
    while (result.length < count) {
      result.push({ x: last.x, y: last.y });
    }
    return result;
  }

  /* ------------------------------ Game ------------------------------ */

  class SnakeGame {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

      this.ui = {
        board: document.getElementById('board'),
        overlay: document.getElementById('overlay'),
        overlayKicker: document.getElementById('overlayKicker'),
        overlayTitle: document.getElementById('overlayTitle'),
        overlayText: document.getElementById('overlayText'),
        overlayBtn: document.getElementById('overlayBtn'),
        overlayHint: document.getElementById('overlayHint'),
        finalWrap: document.getElementById('finalWrap'),
        finalScore: document.getElementById('finalScore'),
        bestNote: document.getElementById('bestNote'),
        wrapSettings: document.getElementById('wrapSettings'),
        wrapToggle: document.getElementById('wrapToggle'),
        score: document.getElementById('score'),
        highScore: document.getElementById('highScore'),
        level: document.getElementById('level'),
        startBtn: document.getElementById('startBtn'),
        pauseBtn: document.getElementById('pauseBtn'),
        pauseLabel: document.getElementById('pauseLabel'),
        restartBtn: document.getElementById('restartBtn'),
        soundBtn: document.getElementById('soundBtn'),
      };

      this.sound = new window.SoundBoard(readStorage(STORAGE.sound, 'on') !== 'off');
      this.highScore = Math.max(0, parseInt(readStorage(STORAGE.highScore, '0'), 10) || 0);
      this.wrapMode = readStorage(STORAGE.wrap, 'off') === 'on';

      this.state = 'idle';
      this.size = 0;
      this.cell = 20;
      this.pad = 8;
      this.lastFrame = 0;
      this.resizeObserver = null;

      this.resize();
      this.bindEvents();
      this.updateSoundButton();
      this.reset();

      this.loop = this.loop.bind(this);
      this.lastFrame = performance.now();
      requestAnimationFrame(this.loop);
    }

    /* ---------------------------- Setup ---------------------------- */

    bindEvents() {
      const { ui } = this;

      ui.startBtn.addEventListener('click', () => {
        this.sound.unlock();
        this.sound.click();
        this.start();
      });

      ui.pauseBtn.addEventListener('click', () => {
        this.sound.unlock();
        this.togglePause();
      });

      ui.restartBtn.addEventListener('click', () => {
        this.sound.unlock();
        this.sound.click();
        this.restart();
      });

      ui.overlayBtn.addEventListener('click', () => {
        this.sound.unlock();
        if (this.state === 'paused') {
          this.resume();
        } else {
          this.sound.click();
          this.start();
        }
      });

      ui.soundBtn.addEventListener('click', () => {
        this.setSound(!this.sound.enabled);
      });

      ui.wrapToggle.addEventListener('change', () => {
        this.setWrapMode(ui.wrapToggle.checked);
      });

      document.querySelectorAll('.dpad-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.handleDirection(btn.dataset.dir);
        });
      });

      document.addEventListener('keydown', (event) => this.handleKey(event));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'running') this.pause();
      });

      this.bindSwipe();

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(ui.board);
      } else {
        window.addEventListener('resize', () => this.resize());
      }

      [ui.score, ui.level].forEach((element) => {
        if (!element) return;
        element.addEventListener('animationend', () => element.classList.remove('pop'));
      });
    }

    bindSwipe() {
      let start = null;

      this.ui.board.addEventListener(
        'touchstart',
        (event) => {
          const touch = event.changedTouches[0];
          start = { x: touch.clientX, y: touch.clientY };
        },
        { passive: true }
      );

      this.ui.board.addEventListener(
        'touchend',
        (event) => {
          if (!start) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          start = null;

          if (Math.hypot(dx, dy) < 24) return;

          if (Math.abs(dx) > Math.abs(dy)) {
            this.handleDirection(dx > 0 ? 'right' : 'left');
          } else {
            this.handleDirection(dy > 0 ? 'down' : 'up');
          }
        },
        { passive: true }
      );
    }

    resize() {
      if (!this.ctx || !this.ui.board) return;

      const width = Math.floor(this.ui.board.getBoundingClientRect().width);
      if (width < 40) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.size = width;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(width * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.pad = Math.max(8, Math.round(width * 0.022));
      this.cell = (width - this.pad * 2) / GRID.cols;
    }

    /* ------------------------- Game lifecycle ------------------------- */

    reset() {
      const startY = Math.floor(GRID.rows / 2);
      const startX = Math.floor(GRID.cols / 2) - 1;

      this.state = 'idle';
      this.snake = [];
      for (let i = 0; i < START_LENGTH; i += 1) {
        this.snake.push({ x: startX - i, y: startY });
      }
      this.prevSnake = this.snake.map((segment) => ({ ...segment }));

      this.direction = { ...DIRECTIONS.right };
      this.inputQueue = [];
      this.score = 0;
      this.foodsEaten = 0;
      this.level = 1;
      this.interval = SPEED.base;
      this.accumulator = 0;
      this.interp = 1;
      this.particles = [];
      this.food = null;
      this.foodBornAt = performance.now();
      this.endReason = null;
      this.isNewBest = false;

      this.spawnFood();
      this.updateHud();
      this.updateButtons();
      this.syncOverlay();
    }

    start() {
      if (this.state === 'running') return;
      if (this.state === 'paused') {
        this.resume();
        return;
      }
      if (this.state === 'over') this.reset();

      this.state = 'running';
      this.accumulator = 0;
      this.interp = 0;
      this.prevSnake = this.snake.map((segment) => ({ ...segment }));
      this.updateButtons();
      this.syncOverlay();
    }

    restart() {
      this.reset();
      this.start();
    }

    pause() {
      if (this.state !== 'running') return;
      this.state = 'paused';
      this.sound.pause();
      this.updateButtons();
      this.syncOverlay();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'running';
      this.sound.resume();
      this.updateButtons();
      this.syncOverlay();
    }

    togglePause() {
      if (this.state === 'running') this.pause();
      else if (this.state === 'paused') this.resume();
    }

    endGame(reason) {
      if (this.state === 'over') return;

      this.state = 'over';
      this.endReason = reason;
      this.accumulator = 0;
      this.interp = 0;
      this.prevSnake = this.snake.map((segment) => ({ ...segment }));

      const beatHighScore = this.score > this.highScore;
      this.isNewBest = beatHighScore && this.score > 0;
      if (beatHighScore) {
        this.highScore = this.score;
        writeStorage(STORAGE.highScore, this.highScore);
      }

      if (reason === 'win') this.sound.win();
      else this.sound.gameOver();

      this.updateHud();
      this.updateButtons();
      this.syncOverlay();
    }

    /* --------------------------- Gameplay --------------------------- */

    step() {
      if (this.inputQueue.length) {
        const next = this.inputQueue.shift();
        const isReverse =
          next.x === -this.direction.x && next.y === -this.direction.y;
        if (!isReverse) this.direction = next;
      }

      const head = this.snake[0];
      const nextHead = {
        x: head.x + this.direction.x,
        y: head.y + this.direction.y,
      };

      if (this.wrapMode) {
        // Wrap vision: step off one edge and reappear on the other.
        nextHead.x = (nextHead.x + GRID.cols) % GRID.cols;
        nextHead.y = (nextHead.y + GRID.rows) % GRID.rows;
      } else if (
        nextHead.x < 0 ||
        nextHead.x >= GRID.cols ||
        nextHead.y < 0 ||
        nextHead.y >= GRID.rows
      ) {
        this.endGame('wall');
        return;
      }

      const eating =
        this.food !== null && nextHead.x === this.food.x && nextHead.y === this.food.y;

      // The tail cell is only dangerous if the snake is growing this step.
      const bodyLimit = eating ? this.snake.length : this.snake.length - 1;
      for (let i = 0; i < bodyLimit; i += 1) {
        const segment = this.snake[i];
        if (segment.x === nextHead.x && segment.y === nextHead.y) {
          this.endGame('self');
          return;
        }
      }

      this.prevSnake = this.snake.map((segment) => ({ ...segment }));
      this.snake.unshift(nextHead);

      if (eating) {
        this.eat();
      } else {
        this.snake.pop();
      }

      this.interp = 0;
    }

    eat() {
      this.score += 1;
      this.foodsEaten += 1;

      const previousLevel = this.level;
      this.interval = Math.max(
        SPEED.min,
        SPEED.base - this.foodsEaten * SPEED.step
      );
      this.level = 1 + Math.floor(this.foodsEaten / SPEED.levelEvery);

      this.spawnParticles(this.food);
      this.sound.eat();
      if (this.level > previousLevel) {
        this.sound.levelUp();
        this.flash(this.ui.level);
      }

      this.spawnFood();
      this.flash(this.ui.score);
      this.updateHud();
    }

    spawnFood() {
      const occupied = new Set(
        this.snake.map((segment) => `${segment.x},${segment.y}`)
      );
      const freeCells = [];

      for (let y = 0; y < GRID.rows; y += 1) {
        for (let x = 0; x < GRID.cols; x += 1) {
          if (!occupied.has(`${x},${y}`)) freeCells.push({ x, y });
        }
      }

      if (freeCells.length === 0) {
        this.food = null;
        if (this.state === 'running') this.endGame('win');
        return;
      }

      this.food = freeCells[Math.floor(Math.random() * freeCells.length)];
      this.foodBornAt = performance.now();
    }

    queueDirection(name) {
      const direction = DIRECTIONS[name];
      if (!direction) return;

      const reference = this.inputQueue.length
        ? this.inputQueue[this.inputQueue.length - 1]
        : this.direction;

      // Ignore repeats and direct reversals.
      if (direction.x === reference.x && direction.y === reference.y) return;
      if (direction.x === -reference.x && direction.y === -reference.y) return;
      if (this.inputQueue.length >= 2) return;

      this.inputQueue.push(direction);
    }

    handleDirection(name) {
      if (this.state === 'idle') this.start();
      if (this.state === 'paused') this.resume();
      if (this.state !== 'running') return;
      this.queueDirection(name);
    }

    /* ----------------------------- Input ----------------------------- */

    handleKey(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key;

      // Let the wrap-around switch handle its own keyboard activation.
      if (
        event.target === this.ui.wrapToggle &&
        (key === ' ' || key === 'Spacebar' || key === 'Enter')
      ) {
        return;
      }

      const direction = KEY_DIRECTIONS[key.toLowerCase()];

      if (direction) {
        event.preventDefault();
        this.handleDirection(direction);
        return;
      }

      if (key === ' ' || key === 'Spacebar') {
        event.preventDefault();
        if (this.state === 'running' || this.state === 'paused') this.togglePause();
        else this.start();
        return;
      }

      if (key === 'Enter') {
        event.preventDefault();
        if (this.state === 'idle' || this.state === 'over') this.start();
        return;
      }

      const lower = key.toLowerCase();
      if (lower === 'p') {
        event.preventDefault();
        this.togglePause();
      } else if (lower === 'r') {
        event.preventDefault();
        this.restart();
      }
    }

    /* ------------------------------ UI ------------------------------ */

    updateHud() {
      if (!this.ui.score) return;
      this.ui.score.textContent = String(this.score);
      this.ui.highScore.textContent = String(Math.max(this.highScore, this.score));
      this.ui.level.textContent = `Lv. ${this.level}`;
    }

    updateButtons() {
      const running = this.state === 'running';
      const paused = this.state === 'paused';

      this.ui.startBtn.disabled = running || paused;
      this.ui.pauseBtn.disabled = !(running || paused);
      this.ui.pauseBtn.classList.toggle('is-resume', paused);
      this.ui.pauseLabel.textContent = paused ? 'Resume' : 'Pause';
      this.ui.pauseBtn.setAttribute(
        'aria-label',
        paused ? 'Resume game' : 'Pause game'
      );
    }

    updateSoundButton() {
      if (!this.ui.soundBtn) return;
      const enabled = this.sound.enabled;
      const label = enabled ? 'Mute sound' : 'Turn sound on';

      this.ui.soundBtn.classList.toggle('is-off', !enabled);
      this.ui.soundBtn.setAttribute('aria-pressed', String(enabled));
      this.ui.soundBtn.setAttribute('aria-label', label);
      this.ui.soundBtn.title = label;
    }

    setSound(enabled) {
      this.sound.setEnabled(enabled);
      writeStorage(STORAGE.sound, enabled ? 'on' : 'off');
      this.updateSoundButton();
      if (enabled) this.sound.click();
    }

    setWrapMode(enabled) {
      this.wrapMode = enabled;
      this.ui.wrapToggle.checked = enabled;
      writeStorage(STORAGE.wrap, enabled ? 'on' : 'off');
      this.sound.click();
    }

    syncOverlay() {
      const ui = this.ui;
      const visible = this.state !== 'running';
      const showWrap = visible && (this.state === 'idle' || this.state === 'over');

      ui.wrapSettings.hidden = !showWrap;
      ui.wrapToggle.checked = this.wrapMode;

      // Never leave keyboard focus inside an overlay that becomes hidden.
      if (!visible && ui.overlay.contains(document.activeElement)) {
        ui.pauseBtn.focus({ preventScroll: true });
      }

      ui.overlay.classList.toggle('is-hidden', !visible);
      ui.overlay.setAttribute('aria-hidden', String(!visible));
      ui.overlay.classList.toggle(
        'is-over',
        this.state === 'over' && this.endReason !== 'win'
      );
      ui.overlay.classList.toggle('is-finished', this.state === 'over');

      if (!visible) return;

      ui.finalWrap.hidden = true;
      ui.bestNote.textContent = '';

      if (this.state === 'idle') {
        ui.overlayKicker.textContent = 'Snake Game';
        ui.overlayTitle.textContent = 'Ready to slither?';
        ui.overlayText.textContent =
          'Eat the glowing food, grow longer, and steer clear of the walls and your own tail.';
        ui.overlayBtn.textContent = 'Start Game';
        ui.overlayHint.textContent = 'Arrow keys or WASD to steer';
      } else if (this.state === 'paused') {
        ui.overlayKicker.textContent = 'Paused';
        ui.overlayTitle.textContent = 'Take a breather';
        ui.overlayText.textContent =
          'Your snake is holding position. Jump back in whenever you are ready.';
        ui.overlayBtn.textContent = 'Resume';
        ui.overlayHint.textContent = 'Press Space to resume';
      } else if (this.state === 'over') {
        const won = this.endReason === 'win';

        ui.overlayKicker.textContent = won ? 'Perfect run' : 'Game Over';
        ui.overlayTitle.textContent = won ? 'You filled the board!' : 'Game Over';
        ui.overlayText.textContent = won
          ? 'Every square is yours. That was a legendary snake.'
          : this.endReason === 'self'
            ? 'You bit your own tail. Try a wider turn next time.'
            : 'You hit the wall. Stay clear of the edges!';
        ui.overlayBtn.textContent = won ? 'Play Again' : 'Restart Game';
        ui.overlayHint.textContent = 'Press Enter to play again';
        ui.finalWrap.hidden = false;
        ui.finalScore.textContent = String(this.score);
        ui.bestNote.textContent = this.isNewBest
          ? 'New best score!'
          : `Best: ${this.highScore}`;
      }
    }

    flash(element) {
      if (!element) return;
      element.classList.remove('pop');
      // Force a reflow so the animation can restart.
      void element.offsetWidth;
      element.classList.add('pop');
    }

    /* --------------------------- Particles --------------------------- */

    spawnParticles(cell) {
      const { x, y } = this.toPixel(cell);
      const count = 14;

      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * TAU;
        const speed = (0.04 + Math.random() * 0.15) * this.cell;
        const life = 380 + Math.random() * 340;

        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.35,
          life,
          maxLife: life,
          size: 1.4 + Math.random() * 2.4,
          color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        });
      }
    }

    updateParticles(dt) {
      const frame = dt / 16;
      for (let i = this.particles.length - 1; i >= 0; i -= 1) {
        const particle = this.particles[i];
        particle.x += particle.vx * frame;
        particle.y += particle.vy * frame;
        particle.vy += 0.03 * frame;
        particle.vx *= 0.97;
        particle.vy *= 0.97;
        particle.life -= dt;
        if (particle.life <= 0) this.particles.splice(i, 1);
      }
    }

    /* ---------------------------- Rendering ---------------------------- */

    toPixel(point) {
      let x = point.x;
      let y = point.y;

      if (this.wrapMode) {
        x = ((x % GRID.cols) + GRID.cols) % GRID.cols;
        y = ((y % GRID.rows) + GRID.rows) % GRID.rows;
      }

      return {
        x: this.pad + (x + 0.5) * this.cell,
        y: this.pad + (y + 0.5) * this.cell,
      };
    }

    getSnakePoints(t) {
      const previous = this.prevSnake && this.prevSnake.length
        ? this.prevSnake
        : this.snake;
      const current = this.snake;
      const start = previous[0];
      const end = current[0];

      let headDx = end.x - start.x;
      let headDy = end.y - start.y;
      if (this.wrapMode) {
        headDx = shortestDelta(headDx, GRID.cols);
        headDy = shortestDelta(headDy, GRID.rows);
      }

      const head = { x: start.x + headDx * t, y: start.y + headDy * t };

      // Unwrap the body into continuous space so interpolation follows the
      // shortest path across the seam instead of racing across the board.
      const continuous = [{ x: previous[0].x, y: previous[0].y }];
      for (let i = 1; i < previous.length; i += 1) {
        const from = previous[i - 1];
        const to = previous[i];
        let dx = to.x - from.x;
        let dy = to.y - from.y;

        if (this.wrapMode) {
          dx = shortestDelta(dx, GRID.cols);
          dy = shortestDelta(dy, GRID.rows);
        }

        const last = continuous[continuous.length - 1];
        continuous.push({ x: last.x + dx, y: last.y + dy });
      }

      const path = [head, ...continuous];
      const gridPoints = samplePath(path, current.length, 1);

      return gridPoints.map((point) => this.toPixel(point));
    }

    draw(now) {
      if (!this.ctx || !this.size) return;

      const { ctx, size } = this;

      ctx.clearRect(0, 0, size, size);

      const backdrop = ctx.createLinearGradient(0, 0, size, size);
      backdrop.addColorStop(0, '#0a1620');
      backdrop.addColorStop(0.55, '#081018');
      backdrop.addColorStop(1, '#060c10');
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, size, size);

      const ambient = ctx.createRadialGradient(
        size * 0.5,
        size * 0.42,
        this.cell,
        size * 0.5,
        size * 0.42,
        size * 0.78
      );
      ambient.addColorStop(0, 'rgba(34, 197, 94, 0.075)');
      ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, size, size);

      this.drawGrid();
      this.drawFood(now);
      this.drawParticles();
      this.drawSnake();
    }

    drawGrid() {
      const { ctx, pad, cell, size } = this;
      const end = size - pad;

      ctx.save();
      ctx.strokeStyle = 'rgba(148, 233, 190, 0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let i = 1; i < GRID.cols; i += 1) {
        const x = Math.round(pad + i * cell) + 0.5;
        ctx.moveTo(x, pad);
        ctx.lineTo(x, end);
      }
      for (let i = 1; i < GRID.rows; i += 1) {
        const y = Math.round(pad + i * cell) + 0.5;
        ctx.moveTo(pad, y);
        ctx.lineTo(end, y);
      }

      ctx.stroke();
      ctx.restore();
    }

    drawFood(now) {
      if (!this.food) return;

      const { ctx } = this;
      const { x, y } = this.toPixel(this.food);
      const age = clamp((now - this.foodBornAt) / 220, 0, 1);
      const grow = 0.55 + 0.45 * easeOutCubic(age);
      const pulse = 1 + Math.sin(now / 240) * 0.05;
      const radius = this.cell * 0.3 * pulse * grow;

      ctx.save();

      ctx.shadowColor = 'rgba(248, 113, 113, 0.85)';
      ctx.shadowBlur = this.cell * 0.9;

      const skin = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.4,
        radius * 0.1,
        x,
        y,
        radius * 1.15
      );
      skin.addColorStop(0, '#fecaca');
      skin.addColorStop(0.4, '#ef4444');
      skin.addColorStop(1, '#991b1b');

      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Glossy highlight.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(x - radius * 0.32, y - radius * 0.36, radius * 0.22, 0, TAU);
      ctx.fill();

      // Stem and leaf.
      ctx.strokeStyle = '#3f6212';
      ctx.lineWidth = Math.max(1.4, this.cell * 0.055);
      ctx.beginPath();
      ctx.moveTo(x, y - radius * 0.75);
      ctx.quadraticCurveTo(x + radius * 0.12, y - radius * 1.05, x + radius * 0.24, y - radius * 1.05);
      ctx.stroke();

      ctx.save();
      ctx.translate(x + radius * 0.2, y - radius * 1.02);
      ctx.rotate(-0.45);
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(radius * 0.34, 0, radius * 0.36, radius * 0.17, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }

    drawParticles() {
      const { ctx } = this;

      for (const particle of this.particles) {
        const alpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha + 0.4, 0, TAU);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    tracePath(points) {
      const { ctx } = this;
      ctx.beginPath();
      if (points.length < 2) return;

      // A wrapped snake is drawn as separate runs so no line shoots across
      // the whole board at an edge. Runs of one point are covered by the head.
      const maxGap = this.cell * 1.6;
      let runStart = 0;

      const addRun = (start, end) => {
        if (end - start < 2) return;
        ctx.moveTo(points[start].x, points[start].y);

        for (let i = start + 1; i < end - 1; i += 1) {
          const midX = (points[i].x + points[i + 1].x) / 2;
          const midY = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }

        const last = points[end - 1];
        ctx.lineTo(last.x, last.y);
      };

      for (let i = 1; i < points.length; i += 1) {
        const gap = Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y
        );

        if (gap > maxGap) {
          addRun(runStart, i);
          runStart = i;
        }
      }

      addRun(runStart, points.length);
    }

    drawSnake() {
      const points = this.getSnakePoints(this.interp);
      if (points.length === 0) return;

      const { ctx, cell } = this;
      const head = points[0];
      const tail = points[points.length - 1];

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Outer neon glow.
      this.tracePath(points);
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.22)';
      ctx.lineWidth = cell * 0.86;
      ctx.shadowColor = 'rgba(74, 222, 128, 0.6)';
      ctx.shadowBlur = cell * 0.75;
      ctx.stroke();

      // Dark outline keeps the snake readable over the grid.
      ctx.shadowBlur = 0;
      this.tracePath(points);
      ctx.strokeStyle = 'rgba(4, 20, 12, 0.9)';
      ctx.lineWidth = cell * 0.8;
      ctx.stroke();

      // Body gradient from bright head to deep green tail.
      const body = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
      body.addColorStop(0, '#b9f6a5');
      body.addColorStop(0.35, '#4ade80');
      body.addColorStop(1, '#15803d');
      this.tracePath(points);
      ctx.strokeStyle = body;
      ctx.lineWidth = cell * 0.64;
      ctx.stroke();

      // Head.
      const headRadius = cell * 0.37;
      const headFill = ctx.createRadialGradient(
        head.x - headRadius * 0.3,
        head.y - headRadius * 0.35,
        headRadius * 0.1,
        head.x,
        head.y,
        headRadius * 1.1
      );
      headFill.addColorStop(0, '#e4ffd6');
      headFill.addColorStop(0.55, '#86efac');
      headFill.addColorStop(1, '#22c55e');

      ctx.fillStyle = headFill;
      ctx.beginPath();
      ctx.arc(head.x, head.y, headRadius, 0, TAU);
      ctx.fill();

      // Eyes, positioned relative to the direction of travel.
      const direction = this.direction;
      const perpX = -direction.y;
      const perpY = direction.x;
      const eyeForward = cell * 0.13;
      const eyeSide = cell * 0.145;
      const eyeRadius = Math.max(1.5, cell * 0.095);

      for (const side of [-1, 1]) {
        const eyeX = head.x + direction.x * eyeForward + perpX * eyeSide * side;
        const eyeY = head.y + direction.y * eyeForward + perpY * eyeSide * side;

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, eyeRadius, 0, TAU);
        ctx.fill();

        ctx.fillStyle = '#0b1a12';
        ctx.beginPath();
        ctx.arc(
          eyeX + direction.x * eyeRadius * 0.32,
          eyeY + direction.y * eyeRadius * 0.32,
          eyeRadius * 0.52,
          0,
          TAU
        );
        ctx.fill();
      }

      ctx.restore();
    }

    /* ------------------------------ Loop ------------------------------ */

    loop(now) {
      const dt = Math.min(now - this.lastFrame, 100);
      this.lastFrame = now;

      if (this.state === 'running') {
        this.accumulator += dt;

        let safety = 0;
        while (
          this.accumulator >= this.interval &&
          this.state === 'running' &&
          safety < 5
        ) {
          this.accumulator -= this.interval;
          this.step();
          safety += 1;
        }

        if (this.state === 'running') {
          this.interp = clamp(this.accumulator / this.interval, 0, 1);
        }
      }

      if (this.state !== 'paused') this.updateParticles(dt);

      this.draw(now);
      requestAnimationFrame(this.loop);
    }
  }

  // Expose the instance for quick console debugging / automated checks.
  window.snakeGame = new SnakeGame();
})();
