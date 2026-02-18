AFRAME.registerComponent('weapon-logic', {
  schema: {
    shootCooldown: { type: 'number', default: 250 },
    maxVisualSize: { type: 'number', default: 0.22 }
  },

  init: function () {
    this.gameSystem = this.el.sceneEl.systems['game-manager'];
    this.lastShotTimestamp = 0;

    this.boundMouseShoot = this.onShootInput.bind(this);
    this.boundTouchShoot = this.onShootInput.bind(this);
    this.boundKeyboardShoot = this.onKeyboardShoot.bind(this);
    this.boundTriggerShoot = this.onShootInput.bind(this);
    this.boundModelLoaded = this.onModelLoaded.bind(this);

    // Inputs desktop/mobile.
    window.addEventListener('mousedown', this.boundMouseShoot);
    window.addEventListener('touchstart', this.boundTouchShoot, { passive: true });
    window.addEventListener('keydown', this.boundKeyboardShoot);

    // Input VR (controladores con trigger).
    this.el.addEventListener('triggerdown', this.boundTriggerShoot);
    this.el.addEventListener('model-loaded', this.boundModelLoaded);

    // Si el mesh ya existe (recarga/estado previo), normaliza tamaño igualmente.
    this.onModelLoaded();
  },

  remove: function () {
    window.removeEventListener('mousedown', this.boundMouseShoot);
    window.removeEventListener('touchstart', this.boundTouchShoot);
    window.removeEventListener('keydown', this.boundKeyboardShoot);
    this.el.removeEventListener('triggerdown', this.boundTriggerShoot);
    this.el.removeEventListener('model-loaded', this.boundModelLoaded);
  },

  onModelLoaded: function () {
    var mesh = this.el.getObject3D('mesh');
    if (!mesh) {
      return;
    }

    var box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) {
      return;
    }

    var size = new THREE.Vector3();
    box.getSize(size);

    var largestAxis = Math.max(size.x, size.y, size.z);
    if (largestAxis <= 0) {
      return;
    }

    var uniformScaleFactor = this.data.maxVisualSize / largestAxis;
    var currentScale = this.el.object3D.scale;

    // Ajuste uniforme manteniendo proporciones del modelo.
    currentScale.set(
      currentScale.x * uniformScaleFactor,
      currentScale.y * uniformScaleFactor,
      currentScale.z * uniformScaleFactor
    );
  },

  onKeyboardShoot: function (event) {
    if (event.code === 'Space') {
      this.onShootInput();
    }
  },

  onShootInput: function () {
    var now = performance.now();

    if (now - this.lastShotTimestamp < this.data.shootCooldown) {
      return;
    }

    if (!this.gameSystem || this.gameSystem.gameOver || !this.gameSystem.roundIsActive) {
      return;
    }

    var hasAmmo = this.gameSystem.spendAmmo();
    if (!hasAmmo) {
      return;
    }

    this.lastShotTimestamp = now;

    this.playShotSoundPlaceholder();
    this.emitShotFeedback();
    this.createMuzzleParticles();
    
    // Crear bala visual y verificar impacto
    this.createBulletTrail();
    this.performRaycastHitCheck();
  },

  createMuzzleParticles: function () {
    var muzzle = new THREE.Vector3();
    this.el.object3D.getWorldPosition(muzzle);

    // Flash principal
    var flash = document.createElement('a-sphere');
    flash.setAttribute('radius', '0.09');
    flash.setAttribute('color', '#FFD166');
    flash.setAttribute('material', 'shader: flat; emissive: #FFD166; emissiveIntensity: 1.6; opacity: 0.9; transparent: true');
    flash.setAttribute('position', muzzle);
    this.el.sceneEl.appendChild(flash);

    // Chispas cortas de disparo
    for (var i = 0; i < 5; i++) {
      var spark = document.createElement('a-sphere');
      spark.setAttribute('radius', '0.02');
      spark.setAttribute('color', '#FFB703');
      spark.setAttribute('material', 'shader: flat; emissive: #FFB703; emissiveIntensity: 1.4');
      spark.setAttribute('position', muzzle);
      this.el.sceneEl.appendChild(spark);

      (function (sparkEl, origin) {
        var direction = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.3) * 1.2,
          (Math.random() - 0.5) * 2
        ).normalize();

        var startTime = performance.now();
        var animateSpark = function () {
          var elapsed = performance.now() - startTime;
          var progress = elapsed / 140;

          if (progress < 1 && sparkEl.parentNode) {
            var newPos = new THREE.Vector3(
              origin.x + direction.x * progress * 0.18,
              origin.y + direction.y * progress * 0.18,
              origin.z + direction.z * progress * 0.18
            );
            sparkEl.setAttribute('position', newPos);
            sparkEl.setAttribute('material', 'opacity: ' + (1 - progress));
            requestAnimationFrame(animateSpark);
          } else if (sparkEl.parentNode) {
            sparkEl.parentNode.removeChild(sparkEl);
          }
        };

        animateSpark();
      })(spark, muzzle);
    }

    setTimeout(function () {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 90);
  },

  getAimRaycasterComponent: function () {
    var cursor = document.querySelector('a-cursor');

    if (cursor && cursor.components && cursor.components.raycaster) {
      return cursor.components.raycaster;
    }

    return this.el.components.raycaster || null;
  },

  createBulletTrail: function () {
    var camera = this.el.sceneEl.camera;
    if (!camera) return;

    // Obtener la posición de la cámara (origen del disparo)
    var origin = new THREE.Vector3();
    camera.getWorldPosition(origin);

    // Obtener el cursor y su raycaster para disparar hacia donde apunta la mira
    var raycasterComponent = this.getAimRaycasterComponent();

    if (!raycasterComponent) return;

    var direction = raycasterComponent.raycaster.ray.direction.clone();
    
    // Punto final del rayo (si no impacta nada, 50 unidades adelante)
    var endPoint = origin.clone().add(direction.multiplyScalar(50));

    // Verificar si hay impactos para ajustar el punto final
    raycasterComponent.refreshObjects();
    var intersections = raycasterComponent.intersections;
    
    if (intersections && intersections.length > 0) {
      // Si hay impacto, la bala va hasta ese punto
      endPoint = intersections[0].point;
    }

    // Crear el proyectil visual
    this.animateBullet(origin, endPoint);
  },

  animateBullet: function (startPos, endPos) {
    // Crear esfera de bala
    var bullet = document.createElement('a-sphere');
    bullet.setAttribute('radius', '0.05');
    bullet.setAttribute('color', '#FFFF00');
    bullet.setAttribute('material', 'shader: flat; emissive: #FFFF00; emissiveIntensity: 1');
    bullet.setAttribute('position', startPos);
    
    this.el.sceneEl.appendChild(bullet);

    // Crear trail/estela detrás de la bala
    var trail = document.createElement('a-entity');
    trail.setAttribute('line', 'start: ' + startPos.x + ' ' + startPos.y + ' ' + startPos.z + 
                                '; end: ' + startPos.x + ' ' + startPos.y + ' ' + startPos.z + 
                                '; color: #FFAA00; opacity: 0.8');
    this.el.sceneEl.appendChild(trail);

    // Animar la bala
    var distance = startPos.distanceTo(endPos);
    var duration = distance * 10; // Velocidad de la bala (ms por unidad)
    duration = Math.min(duration, 300); // Máximo 300ms

    var startTime = performance.now();
    var self = this;

    var animate = function() {
      var elapsed = performance.now() - startTime;
      var progress = Math.min(elapsed / duration, 1);

      if (progress < 1) {
        // Interpolar posición
        var currentPos = new THREE.Vector3().lerpVectors(startPos, endPos, progress);
        bullet.setAttribute('position', currentPos);
        
        // Actualizar trail
        trail.setAttribute('line', 'start: ' + startPos.x + ' ' + startPos.y + ' ' + startPos.z + 
                                    '; end: ' + currentPos.x + ' ' + currentPos.y + ' ' + currentPos.z);

        requestAnimationFrame(animate);
      } else {
        // Bala llegó al destino
        bullet.setAttribute('position', endPos);
        
        // Crear efecto de impacto
        self.createImpactEffect(endPos);
        
        // Limpiar después de un momento
        setTimeout(function() {
          if (bullet.parentNode) bullet.parentNode.removeChild(bullet);
          if (trail.parentNode) trail.parentNode.removeChild(trail);
        }, 100);
      }
    };

    animate();
  },

  createImpactEffect: function(position) {
    // Crear destello de impacto
    var flash = document.createElement('a-sphere');
    flash.setAttribute('radius', '0.15');
    flash.setAttribute('color', '#FFFFFF');
    flash.setAttribute('material', 'shader: flat; emissive: #FFFFFF; emissiveIntensity: 2; opacity: 0.9; transparent: true');
    flash.setAttribute('position', position);
    
    this.el.sceneEl.appendChild(flash);

    // Crear partículas de chispas
    for (var i = 0; i < 8; i++) {
      var spark = document.createElement('a-sphere');
      spark.setAttribute('radius', '0.03');
      spark.setAttribute('color', '#FF8800');
      spark.setAttribute('material', 'shader: flat; emissive: #FF8800; emissiveIntensity: 1.5');
      spark.setAttribute('position', position);
      
      this.el.sceneEl.appendChild(spark);

      // Animar chispas en direcciones aleatorias
      (function(sparkEl, pos) {
        var direction = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize();

        var startTime = performance.now();
        var animateSpark = function() {
          var elapsed = performance.now() - startTime;
          var progress = elapsed / 200; // 200ms de duración

          if (progress < 1 && sparkEl.parentNode) {
            var newPos = new THREE.Vector3(
              pos.x + direction.x * progress * 0.3,
              pos.y + direction.y * progress * 0.3,
              pos.z + direction.z * progress * 0.3
            );
            sparkEl.setAttribute('position', newPos);
            sparkEl.setAttribute('material', 'opacity: ' + (1 - progress));
            requestAnimationFrame(animateSpark);
          } else {
            if (sparkEl.parentNode) sparkEl.parentNode.removeChild(sparkEl);
          }
        };
        animateSpark();
      })(spark, position);
    }

    // Eliminar el flash principal
    setTimeout(function() {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 150);
  },

  playShotSoundPlaceholder: function () {
    // Reproducir sonido de laser
    var laserAudio = document.getElementById('laser-audio');
    if (laserAudio) {
      laserAudio.currentTime = 0;
      laserAudio.play();
    }
    this.el.emit('weapon-shot-sfx');
  },

  emitShotFeedback: function () {
    this.el.emit('weapon-shot', {
      bulletsLeft: this.gameSystem ? this.gameSystem.bulletsLeft : null
    });
  },

  performRaycastHitCheck: function () {
    var raycasterComponent = this.getAimRaycasterComponent();

    if (!raycasterComponent) {
      console.warn('No raycaster component found!');
      return;
    }

    raycasterComponent.refreshObjects();

    var intersections = raycasterComponent.intersections;
    if (!intersections || intersections.length === 0) {
      console.log('Disparo fallado - sin intersecciones');
      return;
    }

    console.log('Intersecciones detectadas:', intersections.length);

    // Primer impacto válido con entidad que tenga target-logic.
    for (var index = 0; index < intersections.length; index += 1) {
      var candidateObject = intersections[index].object;
      var candidateEntity = this.findTargetEntity(candidateObject && candidateObject.el);

      if (candidateEntity) {
        console.log('¡Impacto en ave!', candidateEntity.id);
        candidateEntity.emit('hit-by-shot', {
          weapon: this.el,
          point: intersections[index].point
        });
        
        // Feedback visual en el punto de impacto
        this.createHitMarker(intersections[index].point);
        break;
      }
    }
  },

  createHitMarker: function(point) {
    // Crear un marcador visual temporal en el punto de impacto
    var marker = document.createElement('a-sphere');
    marker.setAttribute('radius', '0.1');
    marker.setAttribute('color', '#FF0000');
    marker.setAttribute('position', point);
    this.el.sceneEl.appendChild(marker);
    
    // Eliminar el marcador después de medio segundo
    setTimeout(function() {
      marker.parentNode.removeChild(marker);
    }, 500);
  },

  findTargetEntity: function (entity) {
    var current = entity;

    while (current) {
      if (current.components && current.components['target-logic']) {
        return current;
      }
      current = current.parentNode;
    }

    return null;
  }
});