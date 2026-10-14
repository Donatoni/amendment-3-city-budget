import { gsap } from "gsap";

// Animate a measured shell so text can reflow naturally inside it. Observing
// the content (not the animated shell) avoids a resize/animation feedback loop.
export function createServiceImpactMotion(impact) {
  const shell = impact.parentElement;
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let expanded = !impact.hidden;
  let targetHeight = expanded ? impact.offsetHeight : 0;
  let heightTween;
  let contentTween;
  shell.style.height = `${targetHeight}px`;

  function finish() {
    heightTween?.kill();
    contentTween?.kill();
    impact.hidden = !expanded;
    targetHeight = expanded ? impact.offsetHeight : 0;
    gsap.set(shell, { height: targetHeight });
    gsap.set(impact, { clearProps: "opacity,transform" });
  }

  function resize() {
    const height = expanded ? impact.offsetHeight : 0;
    if (preference.matches || document.hidden) {
      finish();
      return;
    }
    if (height === targetHeight) return;
    targetHeight = height;
    heightTween?.kill();
    heightTween = gsap.to(shell, {
      height,
      duration: expanded ? 0.36 : 0.26,
      ease: "power3.out",
      onComplete: () => { if (!expanded) impact.hidden = true; },
    });
  }

  const observer = new ResizeObserver(resize);
  observer.observe(impact);
  preference.addEventListener("change", finish);

  return {
    update(visible, updateContent) {
      const changed = expanded !== visible;
      const wasHidden = impact.hidden;
      expanded = visible;
      if (visible) impact.hidden = false;
      impact.setAttribute("aria-hidden", String(!visible));
      updateContent();
      if (changed && !preference.matches && !document.hidden) {
        contentTween?.kill();
        if (wasHidden) gsap.set(impact, { opacity: 0, y: -8 });
        contentTween = gsap.to(impact, {
          opacity: visible ? 1 : 0,
          y: visible ? 0 : -8,
          duration: visible ? 0.3 : 0.18,
          ease: "power2.out",
        });
      }
      resize();
    },
    destroy() {
      observer.disconnect();
      preference.removeEventListener("change", finish);
      finish();
    },
  };
}
