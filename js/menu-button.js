/**
 * game-ui — Componente de interfaz de usuario para Duck Hunt VR.
 *
 * Responsabilidades:
 *  1. Mostrar/ocultar el menú de inicio (visible al cargar).
 *  2. Mostrar/ocultar la pantalla de fin de partida.
 *  3. Gestionar Foxy jumpscare cuando el jugador pierde.
 *  4. Alternar fuse del cursor VR (menú ↔ juego).
 *  5. Conectar botones "Jugar", "Reiniciar" y "Menú" con game-manager.
 */
AFRAME.registerComponent('game-ui', {
  init: function () {
    var self = this;
    if (this.el.hasLoaded) {
      setTimeout(function () { self.setup(); }, 200);
    } else {
      this.el.addEventListener('loaded', function () {
        setTimeout(function () { self.setup(); }, 200);
      });
    }
  },

  setup: function () {
    this.gameSystem      = this.el.systems['game-manager'];
    this.startMenu       = document.getElementById('start-menu');
    this.menuDimmer      = document.getElementById('menu-dimmer');
    this.gameoverScreen  = document.getElementById('gameover-screen');
    this.gameoverTitle   = document.getElementById('gameover-title');
    this.gameoverScore   = document.getElementById('gameover-score');
    this.gameoverReason  = document.getElementById('gameover-reason');
    this.menuTopScore    = document.getElementById('menu-top-score');
    this.foxyEntity      = document.getElementById('foxy-screamer');
    this.foxyFade        = document.getElementById('foxy-fade');

    this.updateTopScore();

    // Botones interactivos
    this.setupButton('play-btn-bg',     '#FF6600', this.onPlayClicked.bind(this));
    this.setupButton('restart-btn-box', '#3b82f6',  this.onRestartClicked.bind(this));
    this.setupButton('menu-btn-box',    '#FF6B6B',  this.onMenuClicked.bind(this));

    // Eventos del sistema de juego
    var scene = this.el;
    scene.addEventListener('game-waiting',  this.onGameWaiting.bind(this));
    scene.addEventListener('game-over',     this.onGameOver.bind(this));
    scene.addEventListener('round-started', this.onRoundStarted.bind(this));

    // Estado inicial
    this.showStartMenu();
    this.hideGameover();
  },

  // ── Botones ────────────────────────────────────────────────────────────────

  onPlayClicked: function () {
    if (!this.gameSystem) return;
    this.hideStartMenu();
    this.hideGameover();
    this.gameSystem.beginGame();
  },

  onRestartClicked: function () {
    if (!this.gameSystem) return;
    this.hideGameover();
    this.gameSystem.restartGame();
  },

  onMenuClicked: function () { window.location.href = './index.html'; },

  // ── Eventos del sistema ────────────────────────────────────────────────────

  onGameWaiting: function () {
    this.showStartMenu();
    this.hideGameover();
  },

  onRoundStarted: function () {
    this.hideStartMenu();
    this.hideGameover();
    this.setFuse(false);    // Desactivar fuse durante el juego
  },

  onGameOver: function (event) {
    var detail = event.detail   || {};
    var reason = detail.reason  || 'game-over';
    var state  = detail.finalState || {};
    var score  = state.score !== undefined ? state.score : 0;

    // Persistir top score
    var top = parseInt(localStorage.getItem('duckHuntTopScore') || '0', 10);
    if (score > top) {
      localStorage.setItem('duckHuntTopScore', String(score));
      top = score;
    }

    var totalKilled = state.totalBirdsKilled || 0;
    var birdsMissed = state.birdsMissed      || 0;
    var level       = state.level            || 1;

    var titleText, reasonText, titleColor;
    switch (reason) {
      case 'win':
        titleText  = 'VICTORIA!';
        reasonText = 'Completaste ' + (state.maxLevel || 3) + ' niveles (' + totalKilled + ' aves)';
        titleColor = '#22c55e';
        break;
      case 'too-many-misses':
        titleText  = 'GAME OVER';
        reasonText = 'Se escaparon ' + birdsMissed + ' aves (Nivel ' + level + ')';
        titleColor = '#FF6B6B';
        break;
      case 'time-up':
        titleText  = 'TIEMPO AGOTADO';
        reasonText = 'Se acabo el tiempo en Nivel ' + level;
        titleColor = '#FFB703';
        break;
      default:
        titleText  = 'GAME OVER';
        reasonText = '';
        titleColor = '#FF6B6B';
    }

    if (this.gameoverTitle) {
      this.gameoverTitle.setAttribute('value', titleText);
      this.gameoverTitle.setAttribute('color', titleColor);
    }
    if (this.gameoverScore) {
      this.gameoverScore.setAttribute(
        'value', 'Puntaje: ' + score + '   |   RECORD: ' + top
      );
    }
    if (this.gameoverReason) {
      this.gameoverReason.setAttribute('value', reasonText);
    }

    this.updateTopScore();

    // Foxy jumpscare para cualquier derrota (no para victoria)
    if (reason !== 'win') {
      this.playFoxyThenShowGameover();
      return;
    }

    this.showGameover();
  },

  // ── Visibilidad de paneles ─────────────────────────────────────────────────

  showStartMenu: function () {
    if (this.startMenu)  this.startMenu.setAttribute('visible', true);
    if (this.menuDimmer) this.menuDimmer.setAttribute('visible', true);
    this.setFuse(true);
  },
  hideStartMenu: function () {
    if (this.startMenu)  this.startMenu.setAttribute('visible', false);
    if (this.menuDimmer) this.menuDimmer.setAttribute('visible', false);
  },
  showGameover: function () {
    if (this.gameoverScreen) this.gameoverScreen.setAttribute('visible', true);
    if (this.menuDimmer) this.menuDimmer.setAttribute('visible', true);
    this.setFuse(true);
  },
  hideGameover: function () {
    if (this.gameoverScreen) this.gameoverScreen.setAttribute('visible', false);
  },

  // ── Utilidades ─────────────────────────────────────────────────────────────

  updateTopScore: function () {
    var top = localStorage.getItem('duckHuntTopScore') || '0';
    if (this.menuTopScore) {
      this.menuTopScore.setAttribute('value', 'TOP SCORE = ' + top);
    }
  },

  setFuse: function (on) {
    var cursor = document.getElementById('vr-cursor');
    if (cursor) cursor.setAttribute('cursor', 'fuse', on);
  },

  // ── Secuencia de Foxy (derrota) ──────────────────────────────────────────

  playFoxyThenShowGameover: function () {
    var self = this;

    if (!this.foxyEntity) {
      this.showGameover();
      return;
    }

    this.hideGameover();
    this.hideStartMenu();

    this.foxyEntity.setAttribute('visible', 'true');
    var foxyAudio = document.getElementById('foxy-audio');
    if (foxyAudio) { foxyAudio.currentTime = 1; foxyAudio.play(); }

    var comp = this.foxyEntity.components['foxy-animation'];
    if (comp && comp.playJumpscare) {
      setTimeout(function () { comp.playJumpscare(); }, 40);
    }

    if (this.foxyFade) {
      this.foxyFade.setAttribute('visible', true);
      this.foxyFade.setAttribute('material', 'opacity', 0);
      this.foxyFade.setAttribute(
        'animation__fadein',
        'property: material.opacity; to: 0.55; dur: 160; easing: easeOutQuad'
      );
      this.foxyFade.setAttribute(
        'animation__fadeout',
        'property: material.opacity; to: 0; dur: 360; delay: 580; easing: easeInQuad'
      );
    }

    if (this.foxyTimeout) clearTimeout(this.foxyTimeout);
    this.foxyTimeout = setTimeout(function () {
      if (self.foxyEntity) {
        var foxyComp = self.foxyEntity.components['foxy-animation'];
        if (foxyComp && foxyComp.hideJumpscare) foxyComp.hideJumpscare();
        self.foxyEntity.setAttribute('visible', 'false');
      }
      if (self.foxyFade) self.foxyFade.setAttribute('visible', false);
      self.showGameover();
    }, 980);
  },

  /**
   * Registra hover y click en un botón (a-plane con clase .clickable o id).
   */
  setupButton: function (id, baseColor, cb) {
    var btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('mouseenter', function () {
      btn.setAttribute('color', '#ffffff');
    });
    btn.addEventListener('mouseleave', function () {
      btn.setAttribute('color', baseColor);
    });
    btn.addEventListener('click', function () { cb(); });
  }
});