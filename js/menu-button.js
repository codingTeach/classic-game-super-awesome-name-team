// Menu Button Component
AFRAME.registerComponent('menu-button', {
  init: function () {
    const self = this;
    
    // Wait for scene to be fully loaded
    this.el.addEventListener('loaded', () => {
      this.setupMenuButton();
    });

    // If scene is already loaded
    if (this.el.hasLoaded) {
      setTimeout(() => {
        this.setupMenuButton();
      }, 300);
    }
  },

  setupMenuButton: function () {
    const backToMenuBtn = document.getElementById('back-to-menu');
    if (backToMenuBtn) {
      console.log('Setting up MENU button');
      
      // Hover effects - mouseenter
      backToMenuBtn.addEventListener('mouseenter', () => {
        console.log('Mouse enter MENU button');
        backToMenuBtn.setAttribute('color', '#FF4444');
      });

      // Hover effects - mouseleave
      backToMenuBtn.addEventListener('mouseleave', () => {
        console.log('Mouse leave MENU button');
        backToMenuBtn.setAttribute('color', '#FF6B6B');
      });

      // Click to go back to menu
      backToMenuBtn.addEventListener('click', () => {
        console.log('MENU button clicked! Returning to index.html');
        window.location.href = './index.html';
      });

      // Make it interactive
      backToMenuBtn.setAttribute('cursor-listener', '');
    } else {
      console.warn('MENU button not found');
    }
  }
});