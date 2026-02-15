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
    this.performRaycastHitCheck();
  },

  playShotSoundPlaceholder: function () {
    // Placeholder de sonido: desde aquí puedes conectar WebAudio o un <a-sound>.
    this.el.emit('weapon-shot-sfx');
  },

  emitShotFeedback: function () {
    this.el.emit('weapon-shot', {
      bulletsLeft: this.gameSystem ? this.gameSystem.bulletsLeft : null
    });
  },

  performRaycastHitCheck: function () {
    var raycasterComponent = this.el.components.raycaster;

    if (!raycasterComponent) {
      return;
    }

    raycasterComponent.refreshObjects();

    var intersections = raycasterComponent.intersections;
    if (!intersections || intersections.length === 0) {
      return;
    }

    // Primer impacto válido con entidad que tenga target-logic.
    for (var index = 0; index < intersections.length; index += 1) {
      var candidateObject = intersections[index].object;
      var candidateEntity = this.findTargetEntity(candidateObject && candidateObject.el);

      if (candidateEntity) {
        candidateEntity.emit('hit-by-shot', {
          weapon: this.el,
          point: intersections[index].point
        });
        break;
      }
    }
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
