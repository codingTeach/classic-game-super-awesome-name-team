AFRAME.registerComponent('target-logic', {
  schema: {
    movementAreaMin: { type: 'vec3', default: { x: -8, y: 1, z: -14 } },
    movementAreaMax: { type: 'vec3', default: { x: 8, y: 6, z: -4 } },
    hiddenSpawnCenter: { type: 'vec3', default: { x: 0, y: 1.5, z: -9 } },
    hiddenSpawnRadius: { type: 'number', default: 1.5 },
    speed: { type: 'number', default: 2.3 },
    respawnDelay: { type: 'number', default: 1200 }
  },

  init: function () {
    this.gameSystem = this.el.sceneEl.systems['game-manager'];

    this.isAlive = true;
    this.isActiveInFlight = false;

    this.velocity = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();

    this.setPositionBehindBooth();
    this.scheduleActivation();

    // El disparo no llama métodos directos del target; llega por evento para mantener bajo acoplamiento.
    this.el.addEventListener('hit-by-shot', this.onHitByShot.bind(this));
  },

  tick: function (timeMs, deltaMs) {
    if (!this.isAlive || !this.isActiveInFlight) {
      return;
    }

    if (!this.gameSystem || this.gameSystem.gameOver) {
      return;
    }

    var deltaSeconds = deltaMs / 1000;
    var currentPosition = this.el.object3D.position;

    currentPosition.addScaledVector(this.velocity, deltaSeconds);

    this.handleInvisibleWallBounce(currentPosition);
  },

  setPositionBehindBooth: function () {
    var center = this.data.hiddenSpawnCenter;
    var randomAngle = Math.random() * Math.PI * 2;
    var randomRadius = Math.random() * this.data.hiddenSpawnRadius;

    var spawnX = center.x + Math.cos(randomAngle) * randomRadius;
    var spawnY = center.y + (Math.random() * 0.5 - 0.25);
    var spawnZ = center.z + Math.sin(randomAngle) * randomRadius;

    this.el.setAttribute('position', { x: spawnX, y: spawnY, z: spawnZ });
  },

  scheduleActivation: function () {
    var self = this;

    this.isActiveInFlight = false;
    this.el.setAttribute('visible', false);

    window.setTimeout(function () {
      if (!self.isAlive || (self.gameSystem && self.gameSystem.gameOver)) {
        return;
      }

      self.el.setAttribute('visible', true);
      self.isActiveInFlight = true;
      self.pickRandomDirection();
    }, this.data.respawnDelay);
  },

  pickRandomDirection: function () {
    this.tempDirection.set(
      Math.random() * 2 - 1,
      (Math.random() * 2 - 1) * 0.35,
      Math.random() * 2 - 1
    );

    if (this.tempDirection.lengthSq() < 0.001) {
      this.tempDirection.set(1, 0, 0);
    }

    this.tempDirection.normalize();
    this.velocity.copy(this.tempDirection).multiplyScalar(this.data.speed);
  },

  handleInvisibleWallBounce: function (position) {
    var min = this.data.movementAreaMin;
    var max = this.data.movementAreaMax;

    var bounced = false;

    if (position.x <= min.x || position.x >= max.x) {
      this.velocity.x *= -1;
      position.x = THREE.MathUtils.clamp(position.x, min.x, max.x);
      bounced = true;
    }

    if (position.y <= min.y || position.y >= max.y) {
      this.velocity.y *= -1;
      position.y = THREE.MathUtils.clamp(position.y, min.y, max.y);
      bounced = true;
    }

    if (position.z <= min.z || position.z >= max.z) {
      this.velocity.z *= -1;
      position.z = THREE.MathUtils.clamp(position.z, min.z, max.z);
      bounced = true;
    }

    if (bounced) {
      // Pequeña variación para evitar patrones rígidos de rebote.
      this.velocity.x += (Math.random() - 0.5) * 0.2;
      this.velocity.y += (Math.random() - 0.5) * 0.1;
      this.velocity.z += (Math.random() - 0.5) * 0.2;
      this.velocity.normalize().multiplyScalar(this.data.speed);
    }
  },

  onHitByShot: function () {
    if (!this.isAlive || !this.isActiveInFlight) {
      return;
    }

    this.isAlive = false;
    this.isActiveInFlight = false;
    this.el.setAttribute('visible', false);

    if (this.gameSystem) {
      this.gameSystem.registerTargetHit(this.el);
    }

    this.el.emit('target-dead', { id: this.el.id });
  }
});
