AFRAME.registerComponent('hud-logic', {
  schema: {
    paddingX: { type: 'number', default: 0.05 },
    paddingY: { type: 'number', default: 0.04 },
    lineGap: { type: 'number', default: 0.03 }
  },

  init: function () {
    this.scene = this.el.sceneEl;
    this.gameSystem = this.scene.systems['game-manager'];

    this.scoreText = this.el.querySelector('#hud-score');
    this.ammoText = this.el.querySelector('#hud-ammo');
    this.timeText = this.el.querySelector('#hud-time');
    this.statusText = this.el.querySelector('#hud-status');
    this.background = this.el.querySelector('#hud-bg');

    this.textItems = [this.scoreText, this.ammoText, this.timeText, this.statusText];

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
    this.scheduleResize();
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
    this.scheduleResize();
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

    this.scheduleResize();
  },

  scheduleResize: function () {
    var self = this;
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(function () {
      self.resizeBackground();
    }, 0);
  },

  resizeBackground: function () {
    var maxWidth = 0;
    var totalHeight = 0;
    var yCursor = this.data.paddingY;

    for (var i = 0; i < this.textItems.length; i++) {
      var textEl = this.textItems[i];
      if (!textEl || !textEl.getAttribute('value')) {
        continue;
      }

      var size = this.getTextSize(textEl);
      maxWidth = Math.max(maxWidth, size.width);

      textEl.setAttribute('position', {
        x: this.data.paddingX,
        y: -yCursor,
        z: 0
      });

      yCursor += size.height + this.data.lineGap;
      totalHeight = yCursor - this.data.lineGap + this.data.paddingY;
    }

    if (this.background) {
      var bgWidth = maxWidth + this.data.paddingX * 2;
      var bgHeight = totalHeight;

      this.background.setAttribute('width', bgWidth);
      this.background.setAttribute('height', bgHeight);
      this.background.setAttribute('position', {
        x: bgWidth / 2,
        y: -bgHeight / 2,
        z: -0.01
      });
    }
  },

  getTextSize: function (textEl) {
    var mesh = textEl.getObject3D('mesh');
    if (!mesh || !mesh.geometry) {
      return { width: 0.3, height: 0.08 };
    }

    mesh.geometry.computeBoundingBox();
    var box = mesh.geometry.boundingBox;
    var size = new THREE.Vector3();
    box.getSize(size);

    return { width: size.x, height: size.y };
  }
});