// Title Screen Logic Component
AFRAME.registerComponent('title-screen', {
  init: function () {
    const scene = this.el;
    const topScoreElement = scene.querySelector('#top-score-text');
    
    // Load top score from localStorage
    const topScore = localStorage.getItem('duckHuntTopScore') || '0';
    if (topScoreElement) {
      topScoreElement.setAttribute('value', 'TOP SCORE = ' + topScore);
    }

    // Wait for scene to be fully loaded
    this.el.addEventListener('loaded', () => {
      this.setupInteractions();
    });

    // If scene is already loaded
    if (this.el.hasLoaded) {
      setTimeout(() => {
        this.setupInteractions();
      }, 500);
    }
  },

  setupInteractions: function () {
    const gameABox = this.el.querySelector('#game-a-box');
    const labelA = this.el.querySelector('#label-a');
    const descA = this.el.querySelector('#desc-a');
    
    if (gameABox) {
      console.log('Setting up GAME A interactions');
      
      // Mouse enter - hover effect
      gameABox.addEventListener('mouseenter', () => {
        console.log('Mouse enter GAME A');
        if (labelA) labelA.setAttribute('color', '#FFFF00');
        if (descA) descA.setAttribute('color', '#FFFF00');
        // Show indicator triangle if user wants extra feedback
      });

      // Mouse leave - reset color
      gameABox.addEventListener('mouseleave', () => {
        console.log('Mouse leave GAME A');
        if (labelA) labelA.setAttribute('color', '#FF9933');
        if (descA) descA.setAttribute('color', '#FF9933');
      });

      // Click event - navigate to game
      gameABox.addEventListener('click', () => {
        console.log('GAME A clicked! Navigating to duckHunt.html');
        // Use full path or relative path ensuring it works
        window.location.href = 'duckHunt.html';
      });

      // Fuse complete event (for VR)
      gameABox.addEventListener('fusing', () => {
        console.log('GAME A fusing... will click on complete');
      });

      // Make sure it's interactive
      gameABox.setAttribute('cursor-listener', '');
    } else {
      console.warn('GAME A box not found');
    }
  }
});

// Game Select Component (for interactive game options)
AFRAME.registerComponent('game-select', {
  schema: {
    gameType: { type: 'string', default: 'A' }
  }
});