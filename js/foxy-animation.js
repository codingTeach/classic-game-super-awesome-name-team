AFRAME.registerComponent('foxy-animation', {
  schema: {
    clip: { type: 'string', default: 'Jumpscare' },
    loop: { type: 'string', default: 'once' },
    useExternalTextures: { type: 'boolean', default: false },
    textureBasePath: { type: 'string', default: './src/personajes/textures/' },
    fallbackDuration: { type: 'number', default: 650 }
  },

  init: function () {
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.basePosition = new THREE.Vector3();
    this.baseScale = new THREE.Vector3(1, 1, 1);
    this.fallbackActive = false;
    this.fallbackStartTime = 0;
    this.boundSetupAnimation = this.setupAnimation.bind(this);

    this.el.addEventListener('model-loaded', this.boundSetupAnimation);
  },

  setupAnimation: function () {
    var model = this.el.getObject3D('mesh');

    if (!model) {
      console.warn('No mesh found on model');
      return;
    }

    this.captureBaseTransform();
    if (this.data.useExternalTextures) {
      this.applyTexturesToModel(model);
    }

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};

    if (model.animations && model.animations.length > 0) {
      model.animations.forEach(function (clip) {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      }.bind(this));

      console.log('Animaciones disponibles:', Object.keys(this.actions));
    } else {
      console.warn('No animations found in model, se usará fallback procedural.');
    }
  },

  captureBaseTransform: function () {
    this.basePosition.copy(this.el.object3D.position);
    this.baseScale.copy(this.el.object3D.scale);
  },

  resolveClipName: function (requestedName) {
    var names = Object.keys(this.actions);
    if (!names.length) {
      return null;
    }

    if (requestedName && this.actions[requestedName]) {
      return requestedName;
    }

    var normalizedRequest = (requestedName || '').toLowerCase();
    var exactInsensitive = names.find(function (name) {
      return name.toLowerCase() === normalizedRequest;
    });
    if (exactInsensitive) {
      return exactInsensitive;
    }

    var partialMatch = names.find(function (name) {
      var normalizedName = name.toLowerCase();
      return (
        normalizedName.indexOf('jump') !== -1 ||
        normalizedName.indexOf('scare') !== -1 ||
        normalizedName.indexOf('attack') !== -1 ||
        normalizedName.indexOf(normalizedRequest) !== -1
      );
    });

    return partialMatch || names[0];
  },

  playClip: function (clipName, forceLoopOnce) {
    if (this.currentAction) {
      this.currentAction.stop();
    }

    var resolvedName = this.resolveClipName(clipName);
    if (!resolvedName || !this.actions[resolvedName]) {
      return false;
    }

    this.currentAction = this.actions[resolvedName];
    this.currentAction.reset();
    this.currentAction.clampWhenFinished = true;

    var loopMode = this.data.loop;
    if (forceLoopOnce) {
      loopMode = 'once';
    }

    if (loopMode === 'once') {
      this.currentAction.setLoop(THREE.LoopOnce, 1);
    } else if (loopMode === 'repeat') {
      this.currentAction.setLoop(THREE.LoopRepeat, Infinity);
    } else if (loopMode === 'pingpong') {
      this.currentAction.setLoop(THREE.LoopPingPong, Infinity);
    }

    this.currentAction.play();
    console.log('Reproduciendo animación:', resolvedName);
    return true;
  },

  playJumpscare: function () {
    this.el.setAttribute('visible', 'true');
    this.captureBaseTransform();
    this.fallbackActive = false;

    var playedClip = this.playClip(this.data.clip, true);
    if (!playedClip) {
      this.startFallbackAnimation();
    }
  },

  startFallbackAnimation: function () {
    this.fallbackActive = true;
    this.fallbackStartTime = performance.now();

    this.el.object3D.position.set(
      this.basePosition.x,
      this.basePosition.y - 0.2,
      this.basePosition.z - 1.05
    );
    this.el.object3D.scale.copy(this.baseScale).multiplyScalar(0.3);
  },

  hideJumpscare: function () {
    this.fallbackActive = false;
    if (this.currentAction) {
      this.currentAction.stop();
    }

    this.el.object3D.position.copy(this.basePosition);
    this.el.object3D.scale.copy(this.baseScale);
    this.el.setAttribute('visible', 'false');
  },

  applyTexturesToModel: function (model) {
    var basePath = this.data.textureBasePath || '';
    if (basePath && basePath.charAt(basePath.length - 1) !== '/') {
      basePath += '/';
    }

    var loader = new THREE.TextureLoader();
    var textures = {
      map: this.safeLoadTexture(loader, basePath + 'gltf_embedded_0.png', true),
      normalMap: this.safeLoadTexture(loader, basePath + 'gltf_embedded_2.png', false),
      emissiveMap: this.safeLoadTexture(loader, basePath + 'gltf_embedded_3.png', false),
      roughnessMap: this.safeLoadTexture(loader, basePath + 'gltf_embedded_1@channels=G.png', false),
      metalnessMap: this.safeLoadTexture(loader, basePath + 'gltf_embedded_1@channels=B.png', false),
      aoMap: this.safeLoadTexture(loader, basePath + 'gltf_embedded_4@channels=G.png', false)
    };

    model.traverse(function (node) {
      if (!node.isMesh || !node.material) {
        return;
      }

      var materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(function (material) {
        if (!material) {
          return;
        }

        // Respeta materiales/mapeos ya configurados por GLTF.
        // Solo completa cuando falte un mapa.
        if (!material.map && textures.map) {
          material.map = textures.map;
        }
        if (!material.normalMap && textures.normalMap) {
          material.normalMap = textures.normalMap;
        }
        if (!material.emissiveMap && textures.emissiveMap) {
          material.emissiveMap = textures.emissiveMap;
          if (material.emissive && material.emissive.setRGB) {
            material.emissive.setRGB(1, 1, 1);
          }
        }
        if (!material.roughnessMap && textures.roughnessMap) {
          material.roughnessMap = textures.roughnessMap;
        }
        if (!material.metalnessMap && textures.metalnessMap) {
          material.metalnessMap = textures.metalnessMap;
        }
        if (!material.aoMap && textures.aoMap && material.aoMap !== undefined) {
          material.aoMap = textures.aoMap;
        }

        // Evita el efecto de "imagen transparente" por estados de blending heredados.
        if (!material.alphaMap) {
          material.transparent = false;
          material.opacity = 1;
          material.depthWrite = true;
          material.alphaTest = 0;
        }

        material.needsUpdate = true;
      });
    });
  },

  safeLoadTexture: function (loader, path, useSRGB) {
    var texture = null;

    try {
      texture = loader.load(path);
      if (texture) {
        if (useSRGB && typeof THREE.SRGBColorSpace !== 'undefined') {
          texture.colorSpace = THREE.SRGBColorSpace;
        } else if (useSRGB && typeof THREE.sRGBEncoding !== 'undefined') {
          texture.encoding = THREE.sRGBEncoding;
        }
      }
    } catch (error) {
      console.warn('No se pudo cargar textura:', path, error);
    }

    return texture;
  },

  tick: function (time, timeDelta) {
    if (this.mixer) {
      this.mixer.update(timeDelta / 1000);
    }

    if (!this.fallbackActive) {
      return;
    }

    var elapsed = performance.now() - this.fallbackStartTime;
    var progress = Math.min(elapsed / this.data.fallbackDuration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);

    var currentZ = THREE.MathUtils.lerp(this.basePosition.z - 1.05, this.basePosition.z, eased);
    var currentY = THREE.MathUtils.lerp(this.basePosition.y - 0.2, this.basePosition.y, eased);
    var shake = Math.sin((time || 0) * 0.05) * 0.015 * (1 - progress);

    this.el.object3D.position.set(this.basePosition.x + shake, currentY, currentZ);

    var currentScale = this.baseScale.clone().multiplyScalar(THREE.MathUtils.lerp(0.3, 1.0, eased));
    this.el.object3D.scale.copy(currentScale);

    if (progress >= 1) {
      this.fallbackActive = false;
    }
  },

  remove: function () {
    this.el.removeEventListener('model-loaded', this.boundSetupAnimation);
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
  }
});
