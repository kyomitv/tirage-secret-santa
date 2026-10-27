/**
 * Subtle festive snowfall animation canvas
 */
(() => {
  const canvas = document.createElement('canvas');
  canvas.id = 'snow-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const flakeCount = Math.min(65, Math.floor(width / 22));
  const flakes = [];

  for (let i = 0; i < flakeCount; i++) {
    flakes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 2.5 + 0.8,
      speedY: Math.random() * 0.8 + 0.4,
      speedX: Math.random() * 0.5 - 0.25,
      opacity: Math.random() * 0.6 + 0.2,
      swing: Math.random() * 2,
      swingSpeed: Math.random() * 0.02 + 0.01
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.swing += f.swingSpeed;
      f.y += f.speedY;
      f.x += f.speedX + Math.sin(f.swing) * 0.4;

      if (f.y > height + 5) {
        f.y = -5;
        f.x = Math.random() * width;
      }
      if (f.x > width + 5) {
        f.x = -5;
      } else if (f.x < -5) {
        f.x = width + 5;
      }

      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${f.opacity})`;
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
})();
