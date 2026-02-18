/**
 * hud-logic — HUD estilo Duck Hunt para VR con soporte de niveles.
 *
 * Muestra (fijo a la cámara):
 *   SCORE 000000      — puntuación con ceros a la izquierda
 *   LEVEL X           — nivel actual
 *   TIME  XX          — tiempo restante del NIVEL (no del pájaro)
 *   AMMO  ■ ■ □       — balas restantes para el pájaro actual
 *   BIRDS X/5         — aves cazadas este nivel / objetivo
 *   MISS  ✗ ○ ○       — aves escapadas / máximo permitido
 *
 * Eventos que escucha:
 *   game-waiting       → ocultar HUD
 *   round-started      → mostrar HUD
 *   game-state-changed → re-renderizar datos
 *   game-over          → ocultar HUD
 *   shot-missed        → flash "MISS!" breve
 *   level-complete     → flash "NIVEL X COMPLETO!"
 */
AFRAME.registerComponent('hud-logic', {
  schema: {},

  init: function () {
    this.scene      = this.el.sceneEl;
    this.gameSystem = this.scene.systems['game-manager'];

    // Referencias a los elementos de texto del HUD
    this.scoreText   = this.el.querySelector('#hud-score');
    this.levelText   = this.el.querySelector('#hud-level');
    this.timeText    = this.el.querySelector('#hud-time');
    this.shotsText   = this.el.querySelector('#hud-shots');
    this.birdsText   = this.el.querySelector('#hud-birds');
    this.missesText  = this.el.querySelector('#hud-misses');
    this.missFlash   = this.el.querySelector('#hud-miss-flash');
    this.levelFlash  = this.el.querySelector('#hud-level-flash');

    // Bind de manejadores
    this.boundOnStateChanged  = this.onStateChanged.bind(this);
    this.boundOnGameOver      = this.onGameOver.bind(this);
    this.boundOnRoundStarted  = this.onRoundStarted.bind(this);
    this.boundOnMiss          = this.onShotMissed.bind(this);
    this.boundOnWaiting       = this.onGameWaiting.bind(this);
    this.boundOnLevelComplete = this.onLevelComplete.bind(this);

    this.scene.addEventListener('game-waiting',       this.boundOnWaiting);
    this.scene.addEventListener('game-state-changed',  this.boundOnStateChanged);
    this.scene.addEventListener('game-over',           this.boundOnGameOver);
    this.scene.addEventListener('round-started',       this.boundOnRoundStarted);
    this.scene.addEventListener('shot-missed',         this.boundOnMiss);
    this.scene.addEventListener('level-complete',      this.boundOnLevelComplete);

    // Ocultar hasta que empiece la partida
    this.el.setAttribute('visible', false);
  },

  remove: function () {
    this.scene.removeEventListener('game-waiting',       this.boundOnWaiting);
    this.scene.removeEventListener('game-state-changed',  this.boundOnStateChanged);
    this.scene.removeEventListener('game-over',           this.boundOnGameOver);
    this.scene.removeEventListener('round-started',       this.boundOnRoundStarted);
    this.scene.removeEventListener('shot-missed',         this.boundOnMiss);
    this.scene.removeEventListener('level-complete',      this.boundOnLevelComplete);
  },

  /* ── Manejadores de eventos ────────────────────────────────────────── */

  onGameWaiting: function () {
    this.el.setAttribute('visible', false);
  },

  onRoundStarted: function (event) {
    this.el.setAttribute('visible', true);
    if (this.missFlash)  this.missFlash.setAttribute('visible', false);
    if (this.levelFlash) this.levelFlash.setAttribute('visible', false);
    this.render(event.detail);
  },

  onStateChanged: function (event) {
    // Mantener el HUD visible incluso cuando cambia de nivel
    if (event.detail && event.detail.roundIsActive) {
      this.el.setAttribute('visible', true);
    }
    this.render(event.detail);
  },

  onGameOver: function () {
    this.el.setAttribute('visible', false);
  },

  onShotMissed: function () {
    if (!this.missFlash) return;
    this.missFlash.setAttribute('visible', true);
    var self = this;
    if (this._missTimeout) clearTimeout(this._missTimeout);
    this._missTimeout = setTimeout(function () {
      if (self.missFlash) self.missFlash.setAttribute('visible', false);
    }, 500);
  },

  onLevelComplete: function (event) {
    if (!this.levelFlash) return;
    var lvl = event.detail && event.detail.level ? event.detail.level : '?';
    var nextLvl = event.detail && event.detail.nextLevel ? event.detail.nextLevel : '?';
    var message = '¡NIVEL ' + lvl + ' COMPLETO! → NIVEL ' + nextLvl;
    
    console.log('Level complete event:', event.detail);
    console.log('Mostrando flash:', message);
    
    this.levelFlash.setAttribute('value', message);
    this.levelFlash.setAttribute('visible', true);
    
    var self = this;
    if (this._levelTimeout) clearTimeout(this._levelTimeout);
    this._levelTimeout = setTimeout(function () {
      if (self.levelFlash) self.levelFlash.setAttribute('visible', false);
    }, 2500);
  },

  /* ── Renderizar datos del snapshot ──────────────────────────────────── */

  render: function (snapshot) {
    if (!snapshot) return;

    // SCORE con ceros a la izquierda
    if (this.scoreText) {
      var s = String(snapshot.score || 0);
      while (s.length < 6) s = '0' + s;
      this.scoreText.setAttribute('value', 'SCORE  ' + s);
    }

    // LEVEL
    if (this.levelText) {
      this.levelText.setAttribute('value', 'LEVEL ' + (snapshot.level || 1));
    }

    // TIME (timer del NIVEL, NO del pájaro)
    if (this.timeText) {
      var t = Math.ceil(snapshot.levelTimeLeft || 0);
      this.timeText.setAttribute('value', 'TIME  ' + t);
      this.timeText.setAttribute('color', t <= 10 ? '#FF4444' : '#ffffff');
    }

    // AMMO  ■ ■ □
    if (this.shotsText) {
      var max  = snapshot.bulletsPerBird || 3;
      var left = snapshot.bulletsLeft    || 0;
      var ammo = '';
      for (var i = 0; i < max; i++) {
        ammo += (i < left) ? '| ' : '. ';
      }
      this.shotsText.setAttribute('value', 'AMMO  ' + ammo.trim());
    }

    // BIRDS  X / Y (este nivel)
    if (this.birdsText) {
      var killed = snapshot.birdsKilledThisLevel || 0;
      var needed = snapshot.birdsPerLevel        || 5;
      this.birdsText.setAttribute('value', 'BIRDS ' + killed + '/' + needed);
    }

    // MISS  X O O
    if (this.missesText) {
      var misses = snapshot.birdsMissed || 0;
      var maxM   = snapshot.maxMisses   || 3;
      var icons  = '';
      for (var j = 0; j < maxM; j++) {
        icons += (j < misses) ? 'X ' : 'O ';
      }
      this.missesText.setAttribute('value', 'MISS  ' + icons.trim());
      this.missesText.setAttribute('color', misses >= maxM - 1 ? '#FF4444' : '#FF9933');
    }
  }
});