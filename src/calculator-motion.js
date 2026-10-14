import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Ease the applied-record card into the entry panel. Search stays visible.
export function initCalculatorMotion() {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');

  function measuredHeight(shell, content) {
    let height = content.getBoundingClientRect().height;
    let width = content.getBoundingClientRect().width;
    let tween;

    function finish() {
      tween?.kill();
      tween = null;
      shell.classList.remove('is-resizing');
      shell.style.height = '';
      height = content.getBoundingClientRect().height;
      ScrollTrigger.refresh();
    }

    function resize() {
      const bounds = content.getBoundingClientRect();
      const nextHeight = bounds.height;
      const widthChanged = width > 0 && bounds.width > 0 && Math.abs(bounds.width - width) > 0.5;
      if (bounds.width > 0) width = bounds.width;
      if (preference.matches || document.hidden || widthChanged) {
        finish();
        return;
      }
      if (Math.abs(nextHeight - height) < 0.5) {
        return;
      }
      const from = tween?.isActive() ? shell.getBoundingClientRect().height : height;
      height = nextHeight;
      tween?.kill();
      shell.classList.add('is-resizing');
      tween = gsap.fromTo(shell, { height: from }, {
        height,
        duration: height > from ? 0.4 : 0.3,
        ease: 'power3.out',
        onComplete: finish,
      });
    }

    const observer = new ResizeObserver(resize);
    observer.observe(content);
    return {
      finish,
      destroy() { observer.disconnect(); finish(); },
    };
  }

  const source = measuredHeight(
    document.querySelector('.property-source-flow'),
    document.querySelector('.property-source-content'),
  );

  function finish() { source.finish(); }
  preference.addEventListener('change', finish);
  document.addEventListener('visibilitychange', finish);

  import.meta.hot?.dispose(() => {
    preference.removeEventListener('change', finish);
    document.removeEventListener('visibilitychange', finish);
    source.destroy();
  });
}
