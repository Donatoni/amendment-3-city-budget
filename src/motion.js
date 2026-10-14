import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

// One easing vocabulary for the whole site: decisive arrivals, quick departures.
const ARRIVE = "power3.out";
const REVEAL = "power4.out";
const DEPART = "power2.in";

// CSS transitions pause on elements GSAP is driving; see .is-animating in motion.css.
const OWNED = "is-animating";
const own = targets => gsap.utils.toArray(targets).forEach(el => el.classList?.add(OWNED));
const release = targets => gsap.utils.toArray(targets).forEach(el => el.classList?.remove(OWNED));
const releaseOn = targets => ({ onComplete: () => release(targets), onInterrupt: () => release(targets) });

// Event-driven effects become no-ops when matchMedia reverts the motion context.
let effects = {};
export function emphasize(element) { effects.emphasize?.(element); }
export function enterPanel(element) { effects.panel?.(element); }
export function exitPanel(element) { return effects.exit?.(element) ?? Promise.resolve(); }
export function enterMenu(element) { effects.menu?.(element); }

// Overlays fade with their panel so an opening never feels like a hard cut.
const overlayOf = element => element?.closest(".modal") ?? null;

export function initMotion() {
  const links = document.querySelectorAll(".nav-links [data-goto], .mobile-menu-panel nav [data-goto]");
  const setActive = id => links.forEach(link => {
    if (link.dataset.goto === id) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  const sections = [...document.querySelectorAll("main > section[id]")];
  const budgetCta = document.querySelector("#nav .nav-cta");
  const budgetSectionIndex = sections.findIndex(section => section.id === "builder");
  const syncActive = () => {
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    // The final, short section may never reach the viewport's reading line.
    const current = atBottom ? sections.at(-1) : sections.findLast(section =>
      section.getBoundingClientRect().top <= window.innerHeight * 0.35);
    setActive(current?.id);
    // Point toward the budget using the same reading position as the menu.
    const currentIndex = sections.indexOf(current);
    if (budgetCta && budgetSectionIndex !== -1) {
      budgetCta.dataset.direction = currentIndex < budgetSectionIndex ? "down"
        : currentIndex > budgetSectionIndex ? "up" : "right";
    }
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: syncActive, onRefresh: syncActive });
  syncActive();

  // Entrances begin once the web font is in, so text does not swap faces
  // mid-reveal. A short cap keeps a slow font from delaying the page.
  const fontsSettled = Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise(resolve => setTimeout(resolve, 400)),
  ]);
  fontsSettled.then(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", context => startMotion(context));
    // Reduced motion (or a later preference change) shows everything as is.
    media.add("(prefers-reduced-motion: reduce)", () => {
      document.documentElement.classList.remove("motion-pending");
    });
  });

  // SplitText handles font/width changes; refresh trigger positions after fonts
  // settle without delaying the initial page render.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

function startMotion(context) {
  {
    const cleanupDisclosures = animateDisclosures();
    window.__motionReady = true;
    document.documentElement.classList.add("motion-pending");
    const entranceAnimations = new Map();
    const splitHeadings = [];
    const seenHeadings = new WeakSet();

    // Masks reveal solid text line by line instead of fading whole sections.
    document.querySelectorAll("main h2").forEach(heading => {
      const hero = heading.closest(".hero");
      splitHeadings.push(SplitText.create(heading, {
        type: "lines",
        mask: "lines",
        linesClass: "motion-line",
        autoSplit: true,
        aria: "auto",
        onSplit(self) {
          if (seenHeadings.has(heading)) return;
          const animation = gsap.from(self.lines, {
            yPercent: 110,
            duration: 0.95,
            stagger: 0.09,
            ease: REVEAL,
            delay: hero ? 0.1 : 0,
            scrollTrigger: hero ? undefined : {
              trigger: heading,
              start: "top 86%",
              once: true,
            },
            onComplete: () => seenHeadings.add(heading),
          });
          entranceAnimations.set(heading, animation);
          heading.classList.add("is-split");
          return animation;
        },
      }));
    });

    // Hero text paints immediately; only controls and supporting details enter.
    const heroTargets = ".hero-actions .btn, .trust-row > span, .hero-slideshow-controls";
    own(heroTargets);
    const heroIntro = gsap.timeline({ defaults: { ease: ARRIVE, duration: 0.8 }, ...releaseOn(heroTargets) });
    // Explicit end values: the pre-hide rule keeps computed opacity at 0, so a
    // plain from() would read that as its destination.
    const shown = { y: 0, opacity: 1, clearProps: "transform" };
    heroIntro.fromTo(".hero-actions .btn", { y: 16, opacity: 0 }, { ...shown, stagger: 0.08 }, 0)
      .fromTo(".trust-row > span", { y: 10, opacity: 0 }, { ...shown, stagger: 0.06 }, 0.8)
      .fromTo(".hero-slideshow-controls", { y: 12, opacity: 0 }, { ...shown }, 0.75);
    entranceAnimations.set(document.querySelector(".hero-copy"), heroIntro);

    // Cards rise a short distance and settle. No tilt, no scale: the content
    // reads as placed, not thrown.
    context.add("reveal", batch => {
      batch.forEach((element, index) => {
        own(element);
        const animation = gsap.fromTo(element,
          { y: 28, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.85, delay: index * 0.09,
            ease: ARRIVE, clearProps: "transform", overwrite: "auto", ...releaseOn(element) });
        entranceAnimations.set(element, animation);
      });
    });
    ScrollTrigger.batch(".impact-card, .service-card, .policy-summary, .fact-grid > li, .calc-box, .svc, .builder-submit-card", {
      start: "top 88%",
      interval: 0.1,
      batchMax: 4,
      once: true,
      onEnter: context.reveal,
    });

    // Supporting copy follows its section title along the same vertical axis.
    document.querySelectorAll("main > section:not(.hero)").forEach(section => {
      const details = section.querySelectorAll(".eyebrow, .section-heading > p, .calculator-copy > p:not(.eyebrow), .builder-intro > p, .feedback-copy > p:not(.eyebrow)");
      if (!details.length) return;
      own(details);
      const timeline = gsap.fromTo(details, { y: 14, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: ARRIVE, clearProps: "transform",
        scrollTrigger: { trigger: section, start: "top 78%", once: true },
        ...releaseOn(details),
      });
      entranceAnimations.set(section, timeline);
    });

    // A short settle acknowledges a value that just changed.
    context.add("emphasize", element => {
      if (!element || document.hidden) return;
      own(element);
      gsap.fromTo(element, { y: 5 }, { y: 0, duration: 0.45, ease: ARRIVE, overwrite: "auto", clearProps: "transform", ...releaseOn(element) });
    });

    context.add("panel", element => {
      if (!element) return;
      const overlay = overlayOf(element);
      const contents = element.querySelectorAll("h3, .feedback-modal-intro, fieldset, .feedback-comment, .share-style-picker, .share-headline-picker");
      const targets = [element, overlay, ...contents].filter(Boolean);
      gsap.killTweensOf(targets);
      own(targets);
      const timeline = gsap.timeline(releaseOn(targets));
      if (overlay) timeline.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "none", clearProps: "opacity" }, 0);
      timeline.fromTo(element, { y: 20, scale: 0.98, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: ARRIVE, clearProps: "transform,opacity" }, 0)
        .fromTo(contents, { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: ARRIVE, clearProps: "transform,opacity" }, 0.12);
    });

    // Exits are quicker than entrances and resolve once the panel is gone.
    context.add("exit", element => {
      if (!element || document.hidden) return Promise.resolve();
      const overlay = overlayOf(element);
      const targets = [element, overlay].filter(Boolean);
      gsap.killTweensOf(targets);
      own(targets);
      return new Promise(resolve => {
        const timeline = gsap.timeline({
          onComplete: () => {
            gsap.set(targets, { clearProps: "transform,opacity" });
            release(targets);
            resolve();
          },
          onInterrupt: () => release(targets),
        });
        timeline.to(element, { y: 10, scale: 0.985, opacity: 0, duration: 0.2, ease: DEPART }, 0);
        if (overlay) timeline.to(overlay, { opacity: 0, duration: 0.22, ease: "none" }, 0.02);
      });
    });

    context.add("menu", element => {
      const items = element.querySelectorAll("nav a, .mobile-menu-cta");
      own(items);
      gsap.fromTo(items, { x: 14, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.45, stagger: 0.05, delay: 0.1,
          ease: ARRIVE, overwrite: true, clearProps: "transform,opacity", ...releaseOn(items) });
    });
    effects = { emphasize: context.emphasize, panel: context.panel, exit: context.exit, menu: context.menu };

    // Complete entrances before keyboard focus lands inside moving content.
    const focus = event => entranceAnimations.forEach((animation, element) => {
      if (element.contains(event.target)) animation.totalProgress(1);
    });
    const visibility = () => {
      if (document.hidden) entranceAnimations.forEach(animation => {
        if (animation.isActive()) animation.totalProgress(1);
      });
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cleanupDisclosures();
      effects = {};
      document.removeEventListener("focusin", focus);
      document.removeEventListener("visibilitychange", visibility);
      splitHeadings.forEach(split => split.revert());
      document.documentElement.classList.remove("motion-pending");
      document.querySelectorAll(".is-split").forEach(heading => heading.classList.remove("is-split"));
    };
  }
}

// Keep native details/summary behavior when motion is reduced or JS is absent.
// Leave details open during its exit so the answer can visibly collapse.
function animateDisclosures() {
  const cleanups = [...document.querySelectorAll('.faq-list details, .source-detail')].map(details => {
    const summary = details.querySelector('summary');
    const answer = details.querySelector('.faq-answer, .source-detail-content');
    let expanded = details.open;
    let timeline;

    const settle = () => {
      timeline?.kill();
      timeline = null;
      details.open = expanded;
      gsap.set(details, { clearProps: 'height,overflow' });
      gsap.set(answer, { clearProps: 'opacity,transform' });
      answer.inert = false;
      details.removeAttribute('data-expanded');
      summary.removeAttribute('aria-expanded');
    };

    const toggle = event => {
      event.preventDefault();
      const fromHeight = details.getBoundingClientRect().height;
      timeline?.kill();
      // Read the native size of the destination state before locking the height.
      const wasClosed = !details.open;
      expanded = !expanded;
      details.style.height = 'auto';
      details.open = expanded;
      const toHeight = details.getBoundingClientRect().height;
      details.open = true;
      details.dataset.expanded = String(expanded);
      summary.setAttribute('aria-expanded', String(expanded));
      answer.inert = !expanded;
      gsap.set(details, { height: fromHeight, overflow: 'hidden' });
      if (wasClosed) gsap.set(answer, { opacity: 0, y: -6 });
      timeline = gsap.timeline({ onComplete: () => {
        settle();
        ScrollTrigger.refresh();
      } });
      timeline.to(details, { height: toHeight, duration: expanded ? 0.38 : 0.26, ease: ARRIVE }, 0)
        .to(answer, { opacity: expanded ? 1 : 0, y: expanded ? 0 : -6,
          duration: expanded ? 0.3 : 0.18, ease: expanded ? ARRIVE : DEPART }, 0);
    };

    summary.addEventListener('click', toggle);
    return () => {
      summary.removeEventListener('click', toggle);
      settle();
    };
  });
  return () => cleanups.forEach(cleanup => cleanup());
}
