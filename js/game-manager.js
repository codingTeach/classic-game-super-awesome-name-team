/**
 * game-manager — Sistema central de lógica Duck Hunt VR con NIVELES.
 *
 * Modelo de juego:
 *   - Niveles progresivos (1 → 2 → 3) con dificultad creciente
 *   - Un pájaro a la vez, 3 balas por pájaro
 *   - Timer por NIVEL — NO se reinicia por disparos, spawns ni eventos
 *   - Matar N pájaros por nivel  → avanzar al siguiente nivel
 *   - Fallar 3 pájaros (escapan) → Foxy jumpscare → GAME OVER
 *   - Tiempo agotado             → GAME OVER
 *   - Completar todos los niveles → ¡VICTORIA!
 *
 * Dificultad:
 *   Nivel 1 — velocidad 1.0×, 60 s, pausa 1.5 s entre aves
 *   Nivel 2 — velocidad 1.4×, 55 s, pausa 1.2 s
 *   Nivel 3 — velocidad 1.8×, 50 s, pausa 0.9 s
 *
 * Eventos emitidos:
 *   game-waiting, round-started, spawn-bird, despawn-bird,
 *   game-state-changed, target-hit, bird-missed, shot-missed,
 *   ammo-changed, level-complete, game-over
 *
 * Eventos escuchados:
 *   bird-escaped  →  emitido por target-logic
 */
AFRAME.registerSystem('game-manager', {
  schema: {
    bulletsPerBird: { type: 'number', default: 3 },
    birdsPerLevel:  { type: 'number', default: 5 },
    maxMisses:      { type: 'number', default: 3 },
    levelTime:      { type: 'number', default: 60 },
    maxLevel:       { type: 'number', default: 3 }
  },

  init: function () {
    this.waitingForStart      = true;
    this.roundIsActive        = false;
    this.gameOver             = false;

    this.level                = 1;
    this.score                = 0;
    this.birdsKilledThisLevel = 0;
    this.totalBirdsKilled     = 0;
    this.birdsMissed          = 0;
    this.bulletsLeft          = 0;
    this.currentBirdAlive     = false;
    this.levelTimeLeft        = 0;
    this.activeBirdId         = null;
    this.speedMultiplier      = 1.0;

    this._lastTimeMs   = performance.now();
    this._birdIds      = ['bird-1', 'bird-2', 'bird-3'];
    this._spawnTimeout = null;

    var self = this;
    this.el.addEventListener('bird-escaped', function () {
      self.onBirdEscaped();
    });

    this.el.emit('game-waiting', this.getSnapshot());
  },

  /* ── Tick: solo decrementa el timer del NIVEL ──────────────────────── */

  tick: function (timeMs) {
    if (this.waitingForStart || !this.roundIsActive || this.gameOver) {
      this._lastTimeMs = timeMs;
      return;
    }

    var delta = (timeMs - this._lastTimeMs) / 1000;
    this._lastTimeMs = timeMs;

    // Timer del NIVEL (NO se reinicia por spawns ni disparos)
    this.levelTimeLeft = Math.max(0, this.levelTimeLeft - delta);
    if (this.levelTimeLeft <= 0) {
      this.endRound('time-up');
      return;
    }

    this.el.emit('game-state-changed', this.getSnapshot());
  },

  /* ── Configuración de dificultad por nivel ─────────────────────────── */

  getLevelConfig: function (lvl) {
    var configs = {
      1: { speedMul: 1.0, time: 60, spawnDelay: 1500 },
      2: { speedMul: 1.4, time: 55, spawnDelay: 1200 },
      3: { speedMul: 1.8, time: 50, spawnDelay: 900 }
    };
    if (configs[lvl]) return configs[lvl];
    return {
      speedMul: 1.8 + (lvl - 3) * 0.3,
      time: Math.max(35, 50 - (lvl - 3) * 5),
      spawnDelay: Math.max(500, 900 - (lvl - 3) * 150)
    };
  },

  /* ── Inicio / Reinicio ─────────────────────────────────────────────── */

  beginGame: function () {
    this.score                = 0;
    this.totalBirdsKilled     = 0;
    this.birdsMissed          = 0;
    this.currentBirdAlive     = false;
    this.waitingForStart      = false;
    this.roundIsActive        = true;
    this.gameOver             = false;
    this.activeBirdId         = null;
    this._lastTimeMs          = performance.now();

    if (this._spawnTimeout) { clearTimeout(this._spawnTimeout); this._spawnTimeout = null; }

    this.startLevel(1);
  },

  restartGame: function () { this.beginGame(); },

  startLevel: function (lvl) {
    this.level                = lvl;
    this.birdsKilledThisLevel = 0;
    this.roundIsActive        = true;

    var config           = this.getLevelConfig(lvl);
    this.speedMultiplier = config.speedMul;
    this.levelTimeLeft   = config.time;
    this.bulletsLeft     = 0;
    this.currentBirdAlive = false;

    this._lastTimeMs = performance.now();

    this.el.emit('round-started', this.getSnapshot());

    var self  = this;
    var delay = (lvl === 1) ? 1200 : 2000;
    this._spawnTimeout = setTimeout(function () {
      if (!self.gameOver && self.roundIsActive) self.spawnNextBird();
    }, delay);
  },

  /* ── Generación de pájaros ─────────────────────────────────────────── */

  spawnNextBird: function () {
    this.bulletsLeft      = this.data.bulletsPerBird;
    this.currentBirdAlive = true;

    var idx = Math.floor(Math.random() * this._birdIds.length);
    this.activeBirdId = this._birdIds[idx];

    this.el.emit('spawn-bird', {
      birdId:          this.activeBirdId,
      speedMultiplier: this.speedMultiplier
    });
    this.el.emit('game-state-changed', this.getSnapshot());
  },

  /* ── Munición ──────────────────────────────────────────────────────── */

  spendAmmo: function () {
    if (!this.roundIsActive || this.gameOver || !this.currentBirdAlive) return false;
    if (this.bulletsLeft <= 0) return false;

    this.bulletsLeft--;
    this.el.emit('ammo-changed', this.getSnapshot());
    this.el.emit('game-state-changed', this.getSnapshot());
    return true;
  },

  /** Llamado por weapon-logic DESPUÉS de procesar el impacto. */
  checkAmmoDepletion: function () {
    if (this.bulletsLeft <= 0 && this.currentBirdAlive && !this.gameOver) {
      var self = this;
      setTimeout(function () {
        if (self.currentBirdAlive && !self.gameOver) self.onBirdEscaped();
      }, 600);
    }
  },

  /* ── Impacto en pájaro ─────────────────────────────────────────────── */

  registerTargetHit: function (targetEntity) {
    if (!this.roundIsActive || this.gameOver || !this.currentBirdAlive) return;

    this.currentBirdAlive = false;
    this.birdsKilledThisLevel++;
    this.totalBirdsKilled++;
    this.score += 100 * this.level;

    this.el.emit('target-hit', {
      score:            this.score,
      birdsKilled:      this.birdsKilledThisLevel,
      totalBirdsKilled: this.totalBirdsKilled,
      targetId:         targetEntity && targetEntity.id ? targetEntity.id : null
    });
    this.el.emit('game-state-changed', this.getSnapshot());

    // ¿Nivel completo?
    if (this.birdsKilledThisLevel >= this.data.birdsPerLevel) {
      this.advanceLevel();
      return;
    }

    var config = this.getLevelConfig(this.level);
    var self   = this;
    this._spawnTimeout = setTimeout(function () {
      if (!self.gameOver && self.roundIsActive) self.spawnNextBird();
    }, config.spawnDelay);
  },

  /* ── Avanzar de nivel ──────────────────────────────────────────────── */

  advanceLevel: function () {
    var nextLevel = this.level + 1;
    this.roundIsActive = false;          // Pausar timer entre niveles

    if (nextLevel > this.data.maxLevel) {
      var self = this;
      setTimeout(function () { self.endRound('win'); }, 1000);
      return;
    }

    this.el.emit('level-complete', { level: this.level, nextLevel: nextLevel });

    var self = this;
    setTimeout(function () {
      if (!self.gameOver) self.startLevel(nextLevel);
    }, 2500);
  },

  /* ── Pájaro escapado ───────────────────────────────────────────────── */

  onBirdEscaped: function () {
    if (!this.currentBirdAlive || this.gameOver) return;

    this.currentBirdAlive = false;
    this.birdsMissed++;

    this.el.emit('despawn-bird', { birdId: this.activeBirdId });
    this.el.emit('bird-missed',  { birdsMissed: this.birdsMissed });
    this.el.emit('game-state-changed', this.getSnapshot());

    if (this.birdsMissed >= this.data.maxMisses) {
      var self = this;
      setTimeout(function () { self.endRound('too-many-misses'); }, 800);
      return;
    }

    var config = this.getLevelConfig(this.level);
    var self   = this;
    this._spawnTimeout = setTimeout(function () {
      if (!self.gameOver && self.roundIsActive) self.spawnNextBird();
    }, config.spawnDelay);
  },

  /* ── Disparo fallido (visual) ──────────────────────────────────────── */

  registerMissedShot: function () {
    if (!this.roundIsActive || this.gameOver) return;
    this.el.emit('shot-missed');
  },

  /* ── Fin de partida ────────────────────────────────────────────────── */

  endRound: function (reason) {
    if (this.gameOver) return;

    this.roundIsActive    = false;
    this.gameOver         = true;
    this.currentBirdAlive = false;

    if (this._spawnTimeout) { clearTimeout(this._spawnTimeout); this._spawnTimeout = null; }

    var top = parseInt(localStorage.getItem('duckHuntTopScore') || '0', 10);
    if (this.score > top) localStorage.setItem('duckHuntTopScore', String(this.score));

    this.el.emit('game-over', { reason: reason, finalState: this.getSnapshot() });
  },

  /* ── Snapshot ───────────────────────────────────────────────────────── */

  getSnapshot: function () {
    return {
      waitingForStart:      this.waitingForStart,
      roundIsActive:        this.roundIsActive,
      gameOver:             this.gameOver,
      level:                this.level,
      score:                this.score,
      birdsKilledThisLevel: this.birdsKilledThisLevel,
      birdsPerLevel:        this.data.birdsPerLevel,
      totalBirdsKilled:     this.totalBirdsKilled,
      birdsMissed:          this.birdsMissed,
      maxMisses:            this.data.maxMisses,
      bulletsLeft:          this.bulletsLeft,
      bulletsPerBird:       this.data.bulletsPerBird,
      levelTimeLeft:        this.levelTimeLeft ? Number(this.levelTimeLeft.toFixed(1)) : 0,
      currentBirdAlive:     this.currentBirdAlive,
      activeBirdId:         this.activeBirdId,
      speedMultiplier:      this.speedMultiplier,
      maxLevel:             this.data.maxLevel
    };
  }
});