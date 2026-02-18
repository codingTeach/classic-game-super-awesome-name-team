AFRAME.registerComponent('foxy-animation', {
  schema: {
    clip: { type: 'string', default: 'Jumpscare' },
    loop: { type: 'string', default: 'once' }
  },

  init: function () {
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    // Esperar a que el modelo GLTF se cargue
    this.el.addEventListener('model-loaded', this.setupAnimation.bind(this));
  },

  setupAnimation: function () {
    var model = this.el.getObject3D('mesh');
    
    if (!model) {
      console.warn('No mesh found on model');
      return;
    }

    // Crear mixer de animación
    this.mixer = new THREE.AnimationMixer(model);

    // Extraer todas las animaciones disponibles
    if (model.animations && model.animations.length > 0) {
      model.animations.forEach(clip => {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      });

      console.log('Animaciones disponibles:', Object.keys(this.actions));

      // Reproducir la animación inicial
      this.playClip(this.data.clip);
    } else {
      console.warn('No animations found in model');
    }

    // Actualizar el mixer en cada frame
    if (!this.tickHandler) {
      this.tickHandler = this.tick.bind(this);
      this.el.sceneEl.addEventListener('tick', this.tickHandler);
    }
  },

  playClip: function (clipName) {
    // Detener acción actual
    if (this.currentAction) {
      this.currentAction.stop();
    }

    // Obtener la nueva acción
    if (this.actions[clipName]) {
      this.currentAction = this.actions[clipName];
      this.currentAction.reset();
      this.currentAction.clampWhenFinished = true;

      // Configurar loop
      if (this.data.loop === 'once') {
        this.currentAction.loop = THREE.LoopOnce;
      } else if (this.data.loop === 'repeat') {
        this.currentAction.loop = THREE.LoopRepeat;
      } else if (this.data.loop === 'pingpong') {
        this.currentAction.loop = THREE.LoopPingPong;
      }

      this.currentAction.play();
      console.log('Reproduciendo animación:', clipName);
    } else {
      console.warn('Animación no encontrada:', clipName);
    }
  },

  tick: function (time, timeDelta) {
    if (this.mixer) {
      // Convertir milisegundos a segundos
      this.mixer.update(timeDelta / 1000);
    }
  },

  remove: function () {
    if (this.tickHandler) {
      this.el.sceneEl.removeEventListener('tick', this.tickHandler);
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
  }
});
