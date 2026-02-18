/**
 * weapon-logic — Sistema de disparo para Duck Hunt VR.
 *
 * Pensado para lentes de Realidad Virtual:
 *   - El disparo se dirige hacia donde MIRA el jugador (centro de la cámara).
 *   - El raycaster del cursor VR (#vr-cursor) determina la dirección.
 *   - Inputs soportados:
 *       • Desktop: clic izquierdo, barra espaciadora
 *       • Móvil : tap en pantalla
 *       • VR    : trigger del controlador, botón select del HMD
 *   - Solo impacta UN ave por disparo (la primera viva intersectada).
 *   - Si no impacta nada → registra fallo visual.
 *   - Tras cada disparo verifica si se acabaron las balas para ese pájaro.
 */
AFRAME.registerComponent('weapon-logic', {
  schema: {
    shootCooldown: { type: 'number', default: 350 },
    maxVisualSize: { type: 'number', default: 0.22 }
  },

  init: function () {
    this.gameSystem       = this.el.sceneEl.systems['game-manager'];
    this.lastShotTimestamp = 0;
    this._lastTouchTime   = 0;

    // Binds para poder remover los listeners al destruir el componente
    this.boundMouseShoot    = this.onShootInput.bind(this);
    this.boundTouchShoot    = this.onShootInput.bind(this);
    this.boundKeyboardShoot = this.onKeyboardShoot.bind(this);
    this.boundModelLoaded   = this.onModelLoaded.bind(this);

    // ── Inputs Desktop / Móvil ──
    window.addEventListener('mousedown',  this.boundMouseShoot);
    window.addEventListener('touchstart', this.boundTouchShoot, { passive: true });
    window.addEventListener('keydown',    this.boundKeyboardShoot);

    // ── Input VR: selectstart del WebXR session ──
    var self = this;
    this.el.sceneEl.addEventListener('enter-vr', function () {
      var session = self.el.sceneEl.xrSession;
      if (session) {
        session.addEventListener('selectstart', function () {
          self.onShootInput();
        });
      }
    });

    this.el.addEventListener('model-loaded', this.boundModelLoaded);
    this.onModelLoaded();
  },

  remove: function () {
    window.removeEventListener('mousedown',  this.boundMouseShoot);
    window.removeEventListener('touchstart', this.boundTouchShoot);
    window.removeEventListener('keydown',    this.boundKeyboardShoot);
    this.el.removeEventListener('model-loaded', this.boundModelLoaded);
  },

  /* ── Normalizar tamaño del modelo del arma ─────────────────────────── */

  onModelLoaded: function () {
    var mesh = this.el.getObject3D('mesh');
    if (!mesh) return;

    var box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;

    var size = new THREE.Vector3();
    box.getSize(size);
    var largestAxis = Math.max(size.x, size.y, size.z);
    if (largestAxis <= 0) return;

    var factor       = this.data.maxVisualSize / largestAxis;
    var currentScale = this.el.object3D.scale;
    currentScale.set(
      currentScale.x * factor,
      currentScale.y * factor,
      currentScale.z * factor
    );
  },

  /* ── Handlers de input ─────────────────────────────────────────────── */

  onKeyboardShoot: function (event) {
    if (event.code === 'Space') {
      // No disparar si estamos en menú o game-over
      if (!this.gameSystem || !this.gameSystem.roundIsActive || this.gameSystem.gameOver) return;
      this.onShootInput();
    }
  },

  onShootInput: function (event) {
    // Solo botón izquierdo del ratón
    if (event && event.type === 'mousedown' && event.button !== 0) return;

    // Evitar doble disparo touch→mousedown sintético
    var now = performance.now();
    if (event && event.type === 'touchstart') this._lastTouchTime = now;
    if (event && event.type === 'mousedown' && this._lastTouchTime &&
        now - this._lastTouchTime < 500) return;

    // Cooldown entre disparos
    if (now - this.lastShotTimestamp < this.data.shootCooldown) return;

    // No disparar fuera de partida activa
    if (!this.gameSystem || this.gameSystem.gameOver ||
        !this.gameSystem.roundIsActive || !this.gameSystem.currentBirdAlive) return;

    // Gastar munición (retorna false si no quedan)
    var hasAmmo = this.gameSystem.spendAmmo();
    if (!hasAmmo) return;

    this.lastShotTimestamp = now;

    // Feedback visual y sonoro
    this.playShotSound();
    this.createMuzzleFlash();
    this.createBulletTrail();
    this.flashCrosshair();

    // Detectar impacto por raycaster desde el centro de la cámara
    this.performRaycastHitCheck();

    // ¿Se acabaron las balas para este pájaro?
    if (this.gameSystem) {
      this.gameSystem.checkAmmoDepletion();
    }
  },

  /* ── Obtener raycaster del cursor VR ───────────────────────────────── */

  getAimRaycaster: function () {
    var cursor = document.getElementById('vr-cursor');
    if (cursor && cursor.components && cursor.components.raycaster) {
      return cursor.components.raycaster;
    }
    // Fallback: raycaster del cursor genérico
    var fallback = document.querySelector('[cursor]');
    if (fallback && fallback.components && fallback.components.raycaster) {
      return fallback.components.raycaster;
    }
    return null;
  },

  /* ── Detección de impacto: solo UN ave viva por disparo ─────────────── */

  performRaycastHitCheck: function () {
    var rc = this.getAimRaycaster();
    if (!rc) return;

    rc.refreshObjects();
    var intersections = rc.intersections;

    if (!intersections || intersections.length === 0) {
      // Sin intersecciones → fallo
      if (this.gameSystem) this.gameSystem.registerMissedShot();
      return;
    }

    // Buscar la primera ave VIVA
    for (var i = 0; i < intersections.length; i++) {
      var entity = this.findTargetEntity(intersections[i].object && intersections[i].object.el);
      if (!entity) continue;

      var comp = entity.components['target-logic'];
      if (!comp || !comp.isAlive || !comp.isActiveInFlight) continue;

      // ¡Impacto válido!
      entity.emit('hit-by-shot', { point: intersections[i].point });
      this.createHitMarker(intersections[i].point);
      return; // UN solo impacto por disparo
    }

    // Ningún objetivo vivo → fallo
    if (this.gameSystem) this.gameSystem.registerMissedShot();
  },

  /* ── Subir por el DOM hasta encontrar entidad con target-logic ──────── */

  findTargetEntity: function (el) {
    var current = el;
    while (current) {
      if (current.components && current.components['target-logic']) return current;
      current = current.parentNode;
    }
    return null;
  },

  /* ══════════════════════════════════════════════════════════════════════
     EFECTOS VISUALES
  ═══════════════════════════════════════════════════════════════════════ */

  /** Flash del crosshair al disparar */
  flashCrosshair: function () {
    var cursor = document.getElementById('vr-cursor');
    if (!cursor) return;
    cursor.setAttribute('material', 'color', '#FFFF00');
    setTimeout(function () {
      if (cursor) cursor.setAttribute('material', 'color', '#FFFFFF');
    }, 120);
  },

  /** Sonido de disparo */
  playShotSound: function () {
    var audio = document.getElementById('laser-audio');
    if (audio) { audio.currentTime = 0; audio.play(); }
  },

  /** Flash en la boca del arma */
  createMuzzleFlash: function () {
    var muzzle = new THREE.Vector3();
    this.el.object3D.getWorldPosition(muzzle);

    var flash = document.createElement('a-sphere');
    flash.setAttribute('radius', '0.08');
    flash.setAttribute('color', '#FFD166');
    flash.setAttribute('material', 'shader: flat; emissive: #FFD166; emissiveIntensity: 1.6; opacity: 0.9; transparent: true');
    flash.setAttribute('position', muzzle);
    this.el.sceneEl.appendChild(flash);

    setTimeout(function () {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 80);
  },

  /** Trail visual de la bala */
  createBulletTrail: function () {
    var camera = this.el.sceneEl.camera;
    if (!camera) return;

    var origin = new THREE.Vector3();
    camera.getWorldPosition(origin);

    var rc = this.getAimRaycaster();
    if (!rc) return;

    var direction = rc.raycaster.ray.direction.clone();
    var endPoint  = origin.clone().add(direction.multiplyScalar(50));

    rc.refreshObjects();
    if (rc.intersections && rc.intersections.length > 0) {
      endPoint = rc.intersections[0].point.clone();
    }

    // Bala animada
    var bullet = document.createElement('a-sphere');
    bullet.setAttribute('radius', '0.04');
    bullet.setAttribute('color', '#FFFF00');
    bullet.setAttribute('material', 'shader: flat; emissive: #FFFF00; emissiveIntensity: 1');
    bullet.setAttribute('position', origin);
    this.el.sceneEl.appendChild(bullet);

    var distance = origin.distanceTo(endPoint);
    var duration = Math.min(distance * 8, 250);
    var startTime = performance.now();
    var scene = this.el.sceneEl;

    var animate = function () {
      var progress = Math.min((performance.now() - startTime) / duration, 1);
      if (progress < 1) {
        var p = new THREE.Vector3().lerpVectors(origin, endPoint, progress);
        bullet.setAttribute('position', p);
        requestAnimationFrame(animate);
      } else {
        if (bullet.parentNode) bullet.parentNode.removeChild(bullet);
      }
    };
    animate();
  },

  /** Marcador de impacto */
  createHitMarker: function (point) {
    var marker = document.createElement('a-sphere');
    marker.setAttribute('radius', '0.12');
    marker.setAttribute('color', '#FF3333');
    marker.setAttribute('material', 'shader: flat; emissive: #FF3333; emissiveIntensity: 1.5; opacity: 0.9; transparent: true');
    marker.setAttribute('position', point);
    this.el.sceneEl.appendChild(marker);
    setTimeout(function () {
      if (marker.parentNode) marker.parentNode.removeChild(marker);
    }, 400);
  }
});