AFRAME.registerSystem('game-manager', {
  schema: {
    roundTime: { type: 'number', default: 90 },
    bulletsPerBird: { type: 'number', default: 3 },
    totalBirds: { type: 'number', default: 3 }
  },

  init: function () {
    this.roundIsActive = false;
    this.gameOver = false;
    this.score = 0;
    this.bulletsLeft = 0;
    this.targetsRemaining = this.data.totalBirds;
    this.timeLeft = this.data.roundTime;

    this._lastTimeMs = performance.now();

    // Canal de eventos único para UI/debug sin acoplar componentes entre sí.
    this.el.emit('game-state-changed', this.getSnapshot());

    this.startRound();
  },

  tick: function (timeMs) {
    if (!this.roundIsActive || this.gameOver) {
      return;
    }

    var deltaSeconds = (timeMs - this._lastTimeMs) / 1000;
    this._lastTimeMs = timeMs;

    this.timeLeft = Math.max(0, this.timeLeft - deltaSeconds);

    if (this.timeLeft <= 0) {
      this.endRound('time-up');
      return;
    }

    this.el.emit('game-state-changed', this.getSnapshot());
  },

  startRound: function () {
    this.roundIsActive = true;
    this.gameOver = false;
    this.score = 0;
    this.targetsRemaining = this.data.totalBirds;
    this.timeLeft = this.data.roundTime;
    this.bulletsLeft = this.data.totalBirds * this.data.bulletsPerBird;
    this._lastTimeMs = performance.now();

    this.el.emit('round-started', this.getSnapshot());
    this.el.emit('game-state-changed', this.getSnapshot());
  },

  spendAmmo: function () {
    if (!this.roundIsActive || this.gameOver) {
      return false;
    }

    if (this.bulletsLeft <= 0) {
      this.endRound('out-of-ammo');
      return false;
    }

    this.bulletsLeft -= 1;
    this.el.emit('ammo-changed', { bulletsLeft: this.bulletsLeft });
    this.el.emit('game-state-changed', this.getSnapshot());

    if (this.bulletsLeft <= 0 && this.targetsRemaining > 0) {
      this.endRound('out-of-ammo');
    }

    return true;
  },

  registerTargetHit: function (targetEntity) {
    if (!this.roundIsActive || this.gameOver) {
      return;
    }

    this.score += 100;
    this.targetsRemaining = Math.max(0, this.targetsRemaining - 1);

    this.el.emit('target-hit', {
      score: this.score,
      targetsRemaining: this.targetsRemaining,
      targetId: targetEntity && targetEntity.id ? targetEntity.id : null
    });

    this.el.emit('game-state-changed', this.getSnapshot());

    if (this.targetsRemaining <= 0) {
      this.endRound('all-targets-down');
    }
  },

  endRound: function (reason) {
    if (this.gameOver) {
      return;
    }

    this.roundIsActive = false;
    this.gameOver = true;

    this.el.emit('game-over', {
      reason: reason,
      finalState: this.getSnapshot()
    });
  },

  getSnapshot: function () {
    return {
      roundIsActive: this.roundIsActive,
      gameOver: this.gameOver,
      score: this.score,
      bulletsLeft: this.bulletsLeft,
      targetsRemaining: this.targetsRemaining,
      timeLeft: Number(this.timeLeft.toFixed(2))
    };
  }
});
