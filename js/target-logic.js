AFRAME.registerComponent('target-logic', {
  schema: {
    movementAreaMin: { type: 'vec3', default: { x: -8, y: 1, z: -14 } },
    movementAreaMax: { type: 'vec3', default: { x: 8, y: 6, z: -4 } },
    speed: { type: 'number', default: 2.3 },
    respawnDelay: { type: 'number', default: 1200 },
    // Nuevos parámetros para generación procedural
    spawnHeight: { type: 'number', default: 2 },
    spawnHeightVariation: { type: 'number', default: 1.5 },
    flightDistance: { type: 'number', default: 15 } // Distancia que recorre antes de desaparecer
  },

  init: function () {
    this.gameSystem = this.el.sceneEl.systems['game-manager'];

    this.isAlive = true;
    this.isActiveInFlight = false;

    this.velocity = new THREE.Vector3();
    this.startPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.currentDistance = 0;

    // Posición inicial fuera de vista
    this.generateFlightPath();
    this.scheduleActivation();

    // El disparo no llama métodos directos del target
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

    // Mover el ave en línea recta hacia su objetivo
    currentPosition.addScaledVector(this.velocity, deltaSeconds);
    this.currentDistance += this.data.speed * deltaSeconds;

    // Rotar el ave en la dirección del movimiento
    this.updateRotation();

    // Verificar si llegó a su destino o salió del área
    if (this.currentDistance >= this.data.flightDistance || this.isOutOfBounds(currentPosition)) {
      this.despawnAndRespawn();
    }
  },

  generateFlightPath: function () {
    var min = this.data.movementAreaMin;
    var max = this.data.movementAreaMax;
    
    // Tipos de trayectorias: 0=izq a der, 1=der a izq, 2=atrás a adelante, 3=diagonal
    var pathType = Math.floor(Math.random() * 4);
    
    var startX, startY, startZ;
    var endX, endY, endZ;
    
    // Altura aleatoria para esta trayectoria
    var flightHeight = this.data.spawnHeight + (Math.random() - 0.5) * this.data.spawnHeightVariation;
    flightHeight = THREE.MathUtils.clamp(flightHeight, min.y, max.y);
    
    switch(pathType) {
      case 0: // Izquierda a Derecha
        startX = min.x - 3;
        startZ = min.z + Math.random() * (max.z - min.z);
        startY = flightHeight + (Math.random() - 0.5) * 0.5;
        
        endX = max.x + 3;
        endZ = startZ + (Math.random() - 0.5) * 4; // Ligera desviación en Z
        endY = flightHeight + (Math.random() - 0.5);
        break;
        
      case 1: // Derecha a Izquierda
        startX = max.x + 3;
        startZ = min.z + Math.random() * (max.z - min.z);
        startY = flightHeight + (Math.random() - 0.5) * 0.5;
        
        endX = min.x - 3;
        endZ = startZ + (Math.random() - 0.5) * 4;
        endY = flightHeight + (Math.random() - 0.5);
        break;
        
      case 2: // Atrás hacia Adelante (más común en Duck Hunt)
        startX = (Math.random() - 0.5) * (max.x - min.x);
        startZ = min.z - 4;
        startY = flightHeight;
        
        endX = startX + (Math.random() - 0.5) * 6; // Desviación lateral
        endZ = max.z + 2;
        endY = flightHeight + (Math.random() - 0.5) * 1.5;
        break;
        
      case 3: // Diagonal (mezcla de lateral + profundidad)
        if (Math.random() > 0.5) {
          // Diagonal desde atrás-izquierda a adelante-derecha
          startX = min.x - 2;
          startZ = min.z - 3;
          endX = max.x + 2;
          endZ = max.z + 1;
        } else {
          // Diagonal desde atrás-derecha a adelante-izquierda
          startX = max.x + 2;
          startZ = min.z - 3;
          endX = min.x - 2;
          endZ = max.z + 1;
        }
        startY = flightHeight;
        endY = flightHeight + (Math.random() - 0.5) * 1;
        break;
    }
    
    // Establecer posiciones
    this.startPosition.set(startX, startY, startZ);
    this.targetPosition.set(endX, endY, endZ);
    this.el.setAttribute('position', this.startPosition);
    
    // Calcular velocidad como vector unitario * velocidad
    this.velocity.copy(this.targetPosition).sub(this.startPosition).normalize();
    this.velocity.multiplyScalar(this.data.speed);
    
    // Resetear distancia recorrida
    this.currentDistance = 0;
    
    // Guardar el tipo de trayectoria para debug
    this.pathType = pathType;
  },

  scheduleActivation: function () {
    var self = this;

    this.isActiveInFlight = false;
    this.el.setAttribute('visible', false);

    window.setTimeout(function () {
      if (!self.isAlive || (self.gameSystem && self.gameSystem.gameOver)) {
        return;
      }

      // Generar nueva trayectoria aleatoria
      self.generateFlightPath();
      self.el.setAttribute('visible', true);
      self.isActiveInFlight = true;
    }, this.data.respawnDelay);
  },

  isOutOfBounds: function (position) {
    var min = this.data.movementAreaMin;
    var max = this.data.movementAreaMax;
    
    // Márgenes más amplios para permitir que el ave salga completamente
    return (
      position.x < min.x - 5 || position.x > max.x + 5 ||
      position.z < min.z - 6 || position.z > max.z + 4 ||
      position.y < min.y - 3 || position.y > max.y + 3
    );
  },

  despawnAndRespawn: function () {
    // El ave completó su trayectoria o salió del área
    this.isActiveInFlight = false;
    this.el.setAttribute('visible', false);
    
    // Programar nueva aparición con nueva trayectoria
    this.scheduleActivation();
  },

  updateRotation: function () {
    // Rotar el ave para que mire en la dirección de su movimiento
    var direction = this.velocity.clone().normalize();
    
    // Calcular ángulo de rotación en Y (horizontal)
    var angleY = Math.atan2(direction.x, direction.z);
    
    // Calcular ángulo de rotación en X (pitch) para inclinación
    var angleX = Math.asin(-direction.y);
    
    // Aplicar rotación suave
    this.el.object3D.rotation.set(angleX * 0.3, angleY, 0);
  },

  onHitByShot: function () {
    if (!this.isAlive || !this.isActiveInFlight) {
      return;
    }

    console.log('Ave ' + this.el.id + ' impactada!');

    // Marcar como golpeada inmediatamente
    this.isActiveInFlight = false;
    
    // Efecto visual: hacer que el ave "caiga" antes de desaparecer
    this.playHitAnimation();
    
    // Registrar el hit en el sistema de juego
    if (this.gameSystem) {
      this.gameSystem.registerTargetHit(this.el);
    }

    this.el.emit('target-dead', { id: this.el.id });

    // Desaparecer después de una breve animación
    var self = this;
    setTimeout(function() {
      self.el.setAttribute('visible', false);
      // Programar respawn con nueva trayectoria
      self.scheduleActivation();
    }, 300);
  },

  playHitAnimation: function () {
    // Animación simple de caída cuando el ave es golpeada
    var currentRotation = this.el.object3D.rotation;
    var currentPosition = this.el.object3D.position;
    
    // Hacer que el ave "caiga" rotando
    var fallDuration = 300;
    var startTime = performance.now();
    var self = this;
    var initialY = currentPosition.y;
    
    var animateFall = function() {
      var elapsed = performance.now() - startTime;
      var progress = Math.min(elapsed / fallDuration, 1);
      
      if (progress < 1 && self.isAlive) {
        // Rotar el ave como si cayera
        currentRotation.z = progress * Math.PI;
        // Mover ligeramente hacia abajo
        currentPosition.y = initialY - (progress * 2);
        
        requestAnimationFrame(animateFall);
      }
    };
    
    animateFall();
  }
});