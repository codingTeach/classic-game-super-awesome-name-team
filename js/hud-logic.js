AFRAME.registerComponent('hud-logic', {
  init: function () {
    this.scene = this.el.sceneEl;
    this.gameSystem = this.scene.systems['game-manager'];

    this.scoreText = this.el.querySelector('#hud-score');
    this.ammoText = this.el.querySelector('#hud-ammo');
    this.timeText = this.el.querySelector('#hud-time');
    this.statusText = this.el.querySelector('#hud-status');

    this.boundOnStateChanged = this.onStateChanged.bind(this);
    this.boundOnGameOver = this.onGameOver.bind(this);
    this.boundOnRoundStarted = this.onRoundStarted.bind(this);

    this.scene.addEventListener('game-state-changed', this.boundOnStateChanged);
    this.scene.addEventListener('game-over', this.boundOnGameOver);
    this.scene.addEventListener('round-started', this.boundOnRoundStarted);

    if (this.gameSystem) {
      this.render(this.gameSystem.getSnapshot());
    }
  },

  remove: function () {
    this.scene.removeEventListener('game-state-changed', this.boundOnStateChanged);
    this.scene.removeEventListener('game-over', this.boundOnGameOver);
    this.scene.removeEventListener('round-started', this.boundOnRoundStarted);
  },

  onStateChanged: function (event) {
    this.render(event.detail);
  },

  onRoundStarted: function () {
    if (this.statusText) {
      this.statusText.setAttribute('value', '');
    }
  },

  onGameOver: function (event) {
    var reason = event.detail && event.detail.reason ? event.detail.reason : 'game-over';
    var label = 'GAME OVER';

    if (reason === 'all-targets-down') {
      label = '¡GANASTE!';
    } else if (reason === 'out-of-ammo') {
      label = 'Sin balas';
    } else if (reason === 'time-up') {
      label = 'Tiempo agotado';
    }

    if (this.statusText) {
      this.statusText.setAttribute('value', label);
    }
  },

  render: function (snapshot) {
    if (!snapshot) {
      return;
    }

    if (this.scoreText) {
      this.scoreText.setAttribute('value', 'Puntaje: ' + snapshot.score);
    }

    if (this.ammoText) {
      this.ammoText.setAttribute('value', 'Balas: ' + snapshot.bulletsLeft);
    }

    if (this.timeText) {
      this.timeText.setAttribute('value', 'Tiempo: ' + Math.ceil(snapshot.timeLeft) + 's');
    }
  }
});
