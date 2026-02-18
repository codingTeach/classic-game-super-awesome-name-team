/**
 * target-logic — Componente de comportamiento de ave (Duck Hunt VR).
 *
 * Modelo "un pájaro a la vez":
 *   - Todas las aves empiezan ocultas.
 *   - El game-manager emite 'spawn-bird' con { birdId } indicando cuál activar.
 *   - Solo el ave cuyo id coincide se activa, genera trayectoria y vuela.
 *   - Si el ave sale del escenario sin ser cazada → emite 'bird-escaped'.
 *   - Al ser impactada → animación de caída, queda muerta.
 *   - 'despawn-bird' y 'game-over' ocultan todas las aves.
 */
AFRAME.registerComponent('target-logic', {
  schema: {
    movementAreaMin:       { type: 'vec3',   default: { x: -8,  y: 1, z: -14 } },
    movementAreaMax:       { type: 'vec3',   default: { x:  8,  y: 6, z:  -4 } },
    speed:                 { type: 'number', default: 2.3 },
    spawnHeight:           { type: 'number', default: 2 },
    spawnHeightVariation:  { type: 'number', default: 1.5 },
    flightDistance:        { type: 'number', default: 15 }
  },

  init: function () {
    this.gameSystem = this.el.sceneEl.systems['game-manager'];

    this.isAlive          = false;
    this.isActiveInFlight = false;
    this.currentSpeedMultiplier = 1.0;

    this.velocity       = new THREE.Vector3();
    this.startPosition  = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.currentDistance = 0;

    // Ocultar hasta que sea seleccionada
    this.el.setAttribute('visible', false);

    // Disparo indirecto: weapon-logic emite 'hit-by-shot' sobre la entidad
    this.el.addEventListener('hit-by-shot', this.onHitByShot.bind(this));

    var self = this;

    // ── Evento: aparece un pájaro (solo si es este) ──
    this.el.sceneEl.addEventListener('spawn-bird', function (e) {
      if (e.detail && e.detail.birdId === self.el.id) {
        self.currentSpeedMultiplier = e.detail.speedMultiplier || 1.0;
        self.activate();
      }
    });

    // ── Evento: ocultar pájaro (forzado por game-manager) ──
    this.el.sceneEl.addEventListener('despawn-bird', function (e) {
      if (e.detail && e.detail.birdId === self.el.id) {
        self.isAlive = false;
        self.isActiveInFlight = false;
        self.el.setAttribute('visible', false);
      }
    });

    // ── Evento: inicio de partida → resetear todas las aves ──
    this.el.sceneEl.addEventListener('round-started', function () {
      self.isAlive = false;
      self.isActiveInFlight = false;
      self.el.setAttribute('visible', false);
      self.el.object3D.rotation.set(0, 0, 0);
    });

    // ── Evento: fin de partida → ocultar todo ──
    this.el.sceneEl.addEventListener('game-over', function () {
      self.isAlive = false;
      self.isActiveInFlight = false;
      self.el.setAttribute('visible', false);
    });
  },

  /* ── Activación del ave ────────────────────────────────────────────── */

  activate: function () {
    this.isAlive = true;
    this.isActiveInFlight = false;
    this.el.object3D.rotation.set(0, 0, 0);
    this.generateFlightPath();
    this.el.setAttribute('visible', true);
    this.isActiveInFlight = true;
  },

  /* ── Tick: movimiento del ave ──────────────────────────────────────── */

  tick: function (timeMs, deltaMs) {
    if (!this.isAlive || !this.isActiveInFlight) return;
    if (!this.gameSystem || this.gameSystem.gameOver || this.gameSystem.waitingForStart) return;

    var deltaSeconds    = deltaMs / 1000;
    var currentPosition = this.el.object3D.position;
    var effectiveSpeed  = this.data.speed * this.currentSpeedMultiplier;

    // Mover en línea recta con velocidad escalada por nivel
    // Recalcular velocidad cada frame para asegurar que el multiplicador se aplique
    var direction = this.velocity.clone().normalize();
    currentPosition.addScaledVector(direction, effectiveSpeed * deltaSeconds);
    this.currentDistance += effectiveSpeed * deltaSeconds;

    // Rotar hacia la dirección de vuelo
    this.updateRotation();

    // ¿Salió del área o completó la trayectoria?
    if (this.currentDistance >= this.data.flightDistance || this.isOutOfBounds(currentPosition)) {
      this.onEscape();
    }
  },

  /* ── Generación de trayectoria procedural ──────────────────────────── */

  generateFlightPath: function () {
    var min = this.data.movementAreaMin;
    var max = this.data.movementAreaMax;

    // 4 tipos de trayectoria: izq→der, der→izq, atrás→adelante, diagonal
    var pathType = Math.floor(Math.random() * 4);
    var startX, startY, startZ, endX, endY, endZ;

    var flightHeight = this.data.spawnHeight + (Math.random() - 0.5) * this.data.spawnHeightVariation;
    flightHeight = THREE.MathUtils.clamp(flightHeight, min.y, max.y);

    switch (pathType) {
      case 0: // Izquierda → Derecha
        startX = min.x - 3;
        startZ = min.z + Math.random() * (max.z - min.z);
        startY = flightHeight + (Math.random() - 0.5) * 0.5;
        endX   = max.x + 3;
        endZ   = startZ + (Math.random() - 0.5) * 4;
        endY   = flightHeight + (Math.random() - 0.5);
        break;

      case 1: // Derecha → Izquierda
        startX = max.x + 3;
        startZ = min.z + Math.random() * (max.z - min.z);
        startY = flightHeight + (Math.random() - 0.5) * 0.5;
        endX   = min.x - 3;
        endZ   = startZ + (Math.random() - 0.5) * 4;
        endY   = flightHeight + (Math.random() - 0.5);
        break;

      case 2: // Atrás → Adelante (clásico Duck Hunt)
        startX = (Math.random() - 0.5) * (max.x - min.x);
        startZ = min.z - 4;
        startY = flightHeight;
        endX   = startX + (Math.random() - 0.5) * 6;
        endZ   = max.z + 2;
        endY   = flightHeight + (Math.random() - 0.5) * 1.5;
        break;

      case 3: // Diagonal
        if (Math.random() > 0.5) {
          startX = min.x - 2; startZ = min.z - 3;
          endX   = max.x + 2; endZ   = max.z + 1;
        } else {
          startX = max.x + 2; startZ = min.z - 3;
          endX   = min.x - 2; endZ   = max.z + 1;
        }
        startY = flightHeight;
        endY   = flightHeight + (Math.random() - 0.5);
        break;
    }

    this.startPosition.set(startX, startY, startZ);
    this.targetPosition.set(endX, endY, endZ);
    this.el.object3D.position.copy(this.startPosition);

    // Velocidad como vector de dirección normalizado (sin escala de velocidad)
    this.velocity.copy(this.targetPosition).sub(this.startPosition).normalize();
    this.currentDistance = 0;
  },

  /* ── Verificar si el ave salió del área de juego ───────────────────── */

  isOutOfBounds: function (position) {
    var min = this.data.movementAreaMin;
    var max = this.data.movementAreaMax;
    return (
      position.x < min.x - 5 || position.x > max.x + 5 ||
      position.z < min.z - 6 || position.z > max.z + 4 ||
      position.y < min.y - 3 || position.y > max.y + 3
    );
  },

  /* ── El ave escapó (salió del escenario sin ser cazada) ────────────── */

  onEscape: function () {
    if (!this.isAlive) return;
    this.isAlive          = false;
    this.isActiveInFlight = false;
    this.el.setAttribute('visible', false);
    // Notificar al game-manager
    this.el.sceneEl.emit('bird-escaped');
  },

  /* ── Rotación del ave hacia la dirección de vuelo ──────────────────── */

  updateRotation: function () {
    var direction = this.velocity.clone().normalize();
    var angleY = Math.atan2(direction.x, direction.z);
    var angleX = Math.asin(-direction.y);
    this.el.object3D.rotation.set(angleX * 0.3, angleY, 0);
  },

  /* ── Impacto de disparo ────────────────────────────────────────────── */

  onHitByShot: function () {
    if (!this.isAlive || !this.isActiveInFlight) return;

    console.log('Ave ' + this.el.id + ' impactada!');

    // Marcar como muerta inmediatamente (evita doble impacto)
    this.isAlive          = false;
    this.isActiveInFlight = false;

    // Animación de caída
    this.playHitAnimation();

    // Registrar en game-manager
    if (this.gameSystem) {
      this.gameSystem.registerTargetHit(this.el);
    }

    // Ocultar después de la animación
    var self = this;
    setTimeout(function () {
      self.el.setAttribute('visible', false);
    }, 500);
  },

  /* ── Animación de caída al ser golpeada ─────────────────────────────── */

  playHitAnimation: function () {
    var currentRotation = this.el.object3D.rotation;
    var currentPosition = this.el.object3D.position;
    var fallDuration    = 500;
    var startTime       = performance.now();
    var initialY        = currentPosition.y;

    var animateFall = function () {
      var elapsed  = performance.now() - startTime;
      var progress = Math.min(elapsed / fallDuration, 1);

      if (progress < 1) {
        // Rotar como cayendo
        currentRotation.z = progress * Math.PI;
        // Caer hacia abajo
        currentPosition.y = initialY - (progress * 3);
        requestAnimationFrame(animateFall);
      }
    };

    animateFall();
  }
});