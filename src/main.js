import { uiText, uiHTML } from './ui-text.js';
import { postcardHeadlines } from './postcard.js';
import { escapeText } from './site-runtime.js';
const contentPreview = new URL(location.href).searchParams.get('contentPreview') === '1';
const editorPreview = contentPreview && new URL(location.href).searchParams.get('editorPreview') === '1' && window.parent !== window;
import { initServiceVideos } from "./service-videos.js";
import { renderHomesteadContext } from "./homestead-context.js";
import { renderTaxComparison } from "./tax-comparison.js";
import { initPropertyLookup } from "./property-lookup.js";
import { initCalculatorMotion } from "./calculator-motion.js";
import { initCostCenterBuilder, initRevenueBuilder } from "./cost-center-builder.js";
import { COST_CENTER_VERSION, costCenterPlan } from "./cost-centers.js";
import { initMotion, emphasize, enterPanel, exitPanel, enterMenu } from "./motion.js";
import { createServiceImpactMotion } from "./service-impact-motion.js";
import { SERVICE_COLORS } from "./budget-composition.js";
// Public site: wires the calculator, budget builder, sharing and feedback together.
import {
  SERVICES,
  PROPOSED_TOTAL,
  REDUCTION_TARGET_M,
  SUBMIT_ENDPOINT,
  FEEDBACK_ENDPOINT,
  parseAssessedValue,
  fmtM,
} from "./budget.js";
import { drawShareCard, shareURL, nativeShare, downloadCard, shareCaption, prepareShareFile } from "./share.js";

import { readSharedPlan } from "./share-plan.js";

const $ = (sel) => document.querySelector(sel);
const RANGE_THUMB_SIZE = 24;

// Keep reviewer controls hidden unless the server confirms a valid session.
if (!editorPreview) fetch("/auth/session", { cache: "no-store" })
  .then(response => response.ok ? response.json() : null)
  .then(session => { $(".reviewer-session").hidden = session?.authenticated !== true; })
  .catch(() => {});

// Isolate custom overlays for keyboard and assistive-technology users while
// preserving any inert state that was already present on the page.
function isolatePage(...activeElements) {
  const outside = [...document.body.children].filter(el =>
    !activeElements.includes(el) && !["SCRIPT", "STYLE"].includes(el.tagName));
  const previous = outside.map(el => el.hasAttribute("inert"));
  outside.forEach(el => el.setAttribute("inert", ""));
  return () => outside.forEach((el, i) => el.toggleAttribute("inert", previous[i]));
}

const impactNoteToggle = $(".builder-impact-toggle");
const impactNoteMotion = createServiceImpactMotion($("#builder-impact-content"));
impactNoteToggle.addEventListener("click", () => {
  const expanded = impactNoteToggle.getAttribute("aria-expanded") !== "true";
  impactNoteToggle.setAttribute("aria-expanded", String(expanded));
  impactNoteToggle.querySelector("span").textContent = expanded ? "▾" : "▸";
  impactNoteMotion.update(expanded, () => {});
});

function rangeFraction(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value);
  return max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function syncRangeVisual(input) {
  const pct = rangeFraction(input) * 100;
  input.style.setProperty("--range-progress", `${pct}%`);
  input.style.setProperty("--range-center", rangeThumbCenter(Number(input.value), Number(input.min), Number(input.max)));
}

// Native range thumbs travel inside the track by half their width. Position
// the service fill boundaries and proposed marker on that same geometry.
function rangeThumbCenter(value, min, max) {
  const fraction = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const inset = RANGE_THUMB_SIZE * (0.5 - fraction);
  return `calc(${fraction * 100}% + ${inset}px)`;
}

// add a quiet elevation to the civic masthead once content scrolls beneath it
const nav = $("#nav");
const backToTop = $(".back-to-top");
function updateNav() {
  nav?.classList.toggle("scrolled", window.scrollY > 12);
  backToTop?.classList.toggle("is-visible", window.scrollY > 600);
}
window.addEventListener("scroll", updateNav, { passive: true });
updateNav();

const navBudgetProgress = $("#nav-budget-progress");
const navBudgetActions = $("#nav-budget-actions");
const budgetDashboard = $(".budget-dashboard");
const builderSection = $("#builder");
function updateBudgetActions() {
  const bounds = builderSection.getBoundingClientRect();
  // Match the primary navigation's active-section reading position.
  const readingEdge = window.innerHeight * 0.35;
  const visible = navBudgetProgress.classList.contains("is-met")
    && bounds.top <= readingEdge && bounds.bottom > readingEdge
    && !document.body.classList.contains("menu-open");
  navBudgetActions.classList.toggle("is-visible", visible);
  navBudgetActions.inert = !visible;
  navBudgetActions.setAttribute("aria-hidden", String(!visible));
}
function updateBudgetHeader() {
  // Use only the main row's height so expanding the header cannot retrigger it.
  const baseHeight = window.innerWidth <= 620 ? 64 : window.innerWidth <= 880 ? 70 : 80;
  const readingEdge = nav.getBoundingClientRect().top + baseHeight;
  const visible = !document.body.classList.contains("menu-open")
    && budgetDashboard.getBoundingClientRect().bottom <= readingEdge
    && builderSection.getBoundingClientRect().bottom > readingEdge + 100;
  nav.classList.toggle("has-budget-progress", visible);
  navBudgetProgress.setAttribute("aria-hidden", String(!visible));
  updateBudgetActions();
}
let budgetHeaderFrame = 0;
function queueBudgetHeaderUpdate() {
  if (budgetHeaderFrame) return;
  budgetHeaderFrame = requestAnimationFrame(() => {
    budgetHeaderFrame = 0;
    updateBudgetHeader();
  });
}
window.addEventListener("scroll", queueBudgetHeaderUpdate, { passive: true });
window.addEventListener("resize", queueBudgetHeaderUpdate);
const budgetHeaderObserver = new ResizeObserver(queueBudgetHeaderUpdate);
budgetHeaderObserver.observe(budgetDashboard);
budgetHeaderObserver.observe(builderSection);
updateBudgetHeader();

// -------------------- hero slideshow --------------------
const heroSlides = [...document.querySelectorAll("[data-hero-slide]")];
const heroSlideDots = [...document.querySelectorAll("[data-hero-slide-to]")];
const heroSlideLabels = heroSlides.map(slide => slide.dataset.heroLabel);
const heroSlideLabel = $("#hero-slide-label");
const heroSlideCount = $("#hero-slide-count");
const heroSlideToggle = $("#hero-slide-toggle");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
backToTop?.addEventListener("click", event => {
  event.preventDefault();
  nav.querySelector(".brand")?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "instant" : "smooth" });
});
let activeHeroSlide = 0;
let heroSlideRequest = 0;
let heroSlideTimer = null;
let heroSlideshowPaused = reducedMotion.matches;

async function showHeroSlide(nextIndex, { restart = true } = {}) {
  if (!heroSlides.length) return;
  const request = ++heroSlideRequest;
  const next = (nextIndex + heroSlides.length) % heroSlides.length;
  const image = heroSlides[next].querySelector("img");
  // The initial hero is preloaded in HTML. Fetch later photos only when
  // requested, and retain the visible slide until its replacement has decoded.
  if (image?.dataset.src) {
    if (image.dataset.srcset) image.srcset = image.dataset.srcset;
    delete image.dataset.srcset;
    image.src = image.dataset.src;
    delete image.dataset.src;
  }
  if (image && (!image.complete || !image.naturalWidth)) {
    try { await image.decode(); } catch { return; }
  }
  if (request !== heroSlideRequest) return;
  activeHeroSlide = next;

  heroSlides.forEach((slide, index) => {
    const isActive = index === activeHeroSlide;
    slide.classList.toggle("is-active", isActive);
    slide.setAttribute("aria-hidden", String(!isActive));
  });

  heroSlideDots.forEach((dot, index) => {
    const isActive = index === activeHeroSlide;
    dot.classList.toggle("is-active", isActive);
    if (isActive) dot.setAttribute("aria-current", "true");
    else dot.removeAttribute("aria-current");
  });

  // Keep the current photo's selector visible without scrolling the page.
  const activeDot = heroSlideDots[activeHeroSlide];
  const dotStrip = activeDot?.parentElement;
  if (dotStrip?.clientWidth) {
    const stripBounds = dotStrip.getBoundingClientRect();
    const dotBounds = activeDot.getBoundingClientRect();
    dotStrip.scrollLeft += dotBounds.left - stripBounds.left
      - (dotStrip.clientWidth - dotBounds.width) / 2;
  }

  heroSlideLabel.textContent = heroSlideLabels[activeHeroSlide];
  heroSlideCount.textContent = `${String(activeHeroSlide + 1).padStart(2, "0")} / ${String(heroSlides.length).padStart(2, "0")}`;

  if (restart && !heroSlideshowPaused) startHeroSlideshow();
}

function stopHeroSlideshow() {
  window.clearInterval(heroSlideTimer);
  heroSlideTimer = null;
}

function startHeroSlideshow() {
  stopHeroSlideshow();
  if (heroSlideshowPaused || document.hidden || heroSlides.length < 2) return;
  heroSlideTimer = window.setInterval(
    () => showHeroSlide(activeHeroSlide + 1, { restart: false }),
    6500
  );
}

function setHeroSlideshowPaused(paused) {
  heroSlideshowPaused = paused;
  heroSlideToggle?.classList.toggle("is-paused", paused);
  heroSlideToggle?.setAttribute("aria-pressed", String(paused));
  heroSlideToggle?.setAttribute("aria-label", uiText(paused ? "ui_slideshow_play" : "ui_slideshow_pause"));
  if (paused) stopHeroSlideshow();
  else startHeroSlideshow();
}

$("#hero-slide-prev")?.addEventListener("click", () => showHeroSlide(activeHeroSlide - 1));
$("#hero-slide-next")?.addEventListener("click", () => showHeroSlide(activeHeroSlide + 1));
heroSlideDots.forEach((dot) =>
  dot.addEventListener("click", () => showHeroSlide(Number(dot.dataset.heroSlideTo)))
);
heroSlideToggle?.addEventListener("click", () => setHeroSlideshowPaused(!heroSlideshowPaused));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopHeroSlideshow();
  else startHeroSlideshow();
});

reducedMotion.addEventListener?.("change", (event) => {
  if (heroSlideToggle) heroSlideToggle.hidden = event.matches || heroSlides.length < 2;
  setHeroSlideshowPaused(event.matches);
});

if (heroSlideToggle) heroSlideToggle.hidden = reducedMotion.matches || heroSlides.length < 2;
showHeroSlide(0, { restart: false });
startHeroSlideshow();

// Section navigation uses native anchor links: works without JS and preserves fragments.

// -------------------- mobile navigation --------------------
const mobileMenu = $("#mobile-menu");
const mobileMenuToggle = $("#mobile-menu-toggle");
let mobileMenuLastFocused = null;
let mobileMenuCloseTimer = null;
let restoreMenuPage = () => {};

function openMobileMenu() {
  window.clearTimeout(mobileMenuCloseTimer);
  mobileMenuLastFocused = document.activeElement;
  mobileMenu.hidden = false;
  restoreMenuPage = isolatePage(nav, mobileMenu);
  mobileMenuToggle.setAttribute("aria-expanded", "true");
  mobileMenuToggle.setAttribute("aria-label", uiText("ui_navigation_close"));
  document.body.classList.add("menu-open");
  updateBudgetHeader();
  window.requestAnimationFrame(() => mobileMenu.classList.add("is-open"));
  enterMenu(mobileMenu);
}

function closeMobileMenu({ restoreFocus = true } = {}) {
  if (mobileMenu.hidden) return;
  mobileMenu.classList.remove("is-open");
  mobileMenuToggle.setAttribute("aria-expanded", "false");
  mobileMenuToggle.setAttribute("aria-label", uiText("ui_navigation_open"));
  document.body.classList.remove("menu-open");
  restoreMenuPage();
  updateBudgetHeader();
  if (restoreFocus) mobileMenuLastFocused?.focus?.();
  window.clearTimeout(mobileMenuCloseTimer);
  mobileMenuCloseTimer = window.setTimeout(() => {
    if (!mobileMenu.classList.contains("is-open")) mobileMenu.hidden = true;
  }, 280);
}

mobileMenuToggle.addEventListener("click", () => {
  if (mobileMenu.classList.contains("is-open")) closeMobileMenu();
  else openMobileMenu();
});
mobileMenu.querySelectorAll("[data-menu-close]").forEach((control) =>
  control.addEventListener("click", () => closeMobileMenu())
);
mobileMenu.querySelectorAll("[data-goto]").forEach((link) =>
  link.addEventListener("click", () => {
    closeMobileMenu({ restoreFocus: false });
    const target = document.getElementById(link.dataset.goto);
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  })
);

document.addEventListener("keydown", (event) => {
  if (mobileMenu.hidden) return;
  if (event.key === "Escape") {
    closeMobileMenu();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [mobileMenuToggle, ...mobileMenu.querySelectorAll("a[href], button:not(:disabled)")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 1080) closeMobileMenu({ restoreFocus: false });
});

// -------------------- savings calculator --------------------
const homeInput = $("#home-value");
const homeSlider = $("#home-slider");
let selectedProperty = null;

function parseHome() {
  return parseAssessedValue(homeInput.value);
}
function renderSavings() {
  const v = parseHome();
  syncRangeVisual(homeSlider);
  renderHomesteadContext(selectedProperty);
  renderTaxComparison(v, selectedProperty);
}
homeInput.addEventListener("input", () => {
  selectedProperty = null;
  const v = parseHome();
  homeSlider.value = Math.min(Math.max(v, homeSlider.min), homeSlider.max);
  syncRangeVisual(homeSlider);
  renderSavings();
});
homeInput.addEventListener("blur", () => {
  homeInput.value = parseHome().toLocaleString("en-US");
});
homeSlider.addEventListener("input", () => {
  selectedProperty = null;
  syncRangeVisual(homeSlider);
  homeInput.value = Number(homeSlider.value).toLocaleString("en-US");
  renderSavings();
});
renderSavings();

initCalculatorMotion();
initPropertyLookup({
  homeInput,
  homeSlider,
  onClear({ resetValue = false } = {}) {
    selectedProperty = null;
    if (resetValue) {
      homeInput.value = homeInput.defaultValue;
      homeSlider.value = homeSlider.defaultValue;
    }
    renderSavings();
  },
  onSelect(value, property) {
    selectedProperty = property;
    homeInput.value = value.toLocaleString('en-US');
    homeSlider.value = Math.min(Math.max(value, Number(homeSlider.min)), Number(homeSlider.max));
    renderSavings();
    // Let the lookup remove its results before aligning the calculator card.
    requestAnimationFrame(() => {
      $(".calc-box").scrollIntoView({
        behavior: reducedMotion.matches ? "instant" : "smooth",
        block: "start",
      });
    });
  },
});

// -------------------- budget builder --------------------
const costCentersEl = $("#cost-centers");
const selectedCutsSummary = $("#selected-cuts-summary");
const desktopBudgetLayout = window.matchMedia("(min-width: 761px)");
function syncBreakdownDefault() {
  selectedCutsSummary.open = desktopBudgetLayout.matches;
}
syncBreakdownDefault();
desktopBudgetLayout.addEventListener("change", syncBreakdownDefault);
const sharedPlan = readSharedPlan(new URL(window.location.href));
const selectedCuts = new Set(sharedPlan?.cuts || []);
const selectedRevenue = new Set(sharedPlan?.revenues || []);
const revenueAdjustment = { millageRate: sharedPlan?.millageRate ?? (selectedRevenue.has('millage-rate') ? 1 : 0) };
let values = costCenterPlan(selectedCuts, selectedRevenue, revenueAdjustment.millageRate).values;
if (sharedPlan) {
  $("#shared-banner").hidden = false;
  if (!sharedPlan.cuts) $("#shared-banner span").textContent = uiText("ui_budget_old_plan");
} else if (["cuts", "b"].some(key => new URL(window.location.href).searchParams.has(key))) {
  $("#shared-banner").hidden = false;
  $("#shared-banner span").textContent = uiText("ui_budget_unavailable_plan");
}
$("#shared-dismiss")?.addEventListener("click", () => ($("#shared-banner").hidden = true));
const renderCostCenters = initCostCenterBuilder(costCentersEl, selectedCuts, () => renderBudget());

const renderRevenues = initRevenueBuilder($("#potential-revenues"), selectedRevenue, () => renderBudget(), revenueAdjustment);

const gapFill = $("#gap-fill");
const gapValue = $("#gap-value");
const submitBtn = $("#submit-btn");
submitBtn.textContent = uiText("ui_budget_submit");
let budgetTargetMet = false;

function renderBudget() {
  const plan = costCenterPlan(selectedCuts, selectedRevenue, revenueAdjustment.millageRate);
  values = plan.values;
  const cut = plan.gapClosed / 1e6;
  renderRevenues();
  $("#revenue-total").textContent = fmtM(plan.revenue / 1e6);
  $("#service-cut-total").textContent = fmtM(plan.reduction / 1e6);
  renderCostCenters(plan);
  $("#selected-cut-count").textContent = uiText(plan.items.length === 1 ? "ui_budget_selected_one" : "ui_budget_selected_many", { count: plan.items.length });
  selectedCutsSummary.hidden = plan.items.length === 0 && plan.revenues.length === 0;
  $("#selected-cuts-list").replaceChildren(...[...plan.items, ...plan.revenues].map(item => {
    const entry = document.createElement("li");
    entry.textContent = `${item.serviceName || uiText("ui_budget_revenue")} · ${item.name}`;
    const amount = document.createElement("strong");
    amount.textContent = fmtM((item.savings ?? item.amount) / 1e6);
    entry.append(amount);
    return entry;
  }));

  const met = plan.targetMet;
  const pct = Math.max(0, Math.min(100, (cut / REDUCTION_TARGET_M) * 100));
  gapFill.style.transform = `scaleX(${pct / 100})`;
  gapFill.classList.toggle("met", met);
  $("#gap-meter").classList.toggle("is-met", met);
  gapValue.textContent = fmtM(Math.abs(cut));
  $("#gap-reduced-label").textContent = cut < 0 ? uiText("ui_budget_increased") : uiText("ui_budget_closed");
  $("#gap-remaining").textContent = fmtM(Math.max(0, REDUCTION_TARGET_M - cut));
  $("#gap-eyebrow").textContent = met ? uiText("ui_budget_target_met") : uiText("ui_budget_challenge");
  $("#gap-title").textContent = met ? uiText("ui_budget_reached_title", { target: fmtM(REDUCTION_TARGET_M) }) : uiText("ui_budget_goal_title", { target: fmtM(REDUCTION_TARGET_M) });
  $("#gap-instruction").textContent = met
    ? uiText("ui_budget_reached_instruction")
    : uiText("ui_budget_instruction");
  $("#gap-progressbar").setAttribute("aria-valuenow", pct.toFixed(1));
  $("#gap-progressbar").setAttribute("aria-valuetext", uiText("ui_budget_progress", { amount: gapValue.textContent, change: uiText(cut < 0 ? "ui_budget_increase" : "ui_budget_closed_reading"), remaining: $("#gap-remaining").textContent }));
  $("#nav-budget-reduced").textContent = uiText("ui_budget_closed_amount", { amount: fmtM(cut) });
  $("#builder-live-status").textContent = met ? uiText("ui_budget_target_met") : uiText("ui_budget_remaining", { remaining: fmtM(REDUCTION_TARGET_M - cut) });
  navBudgetProgress.classList.toggle("is-met", met);
  updateBudgetActions();
  $("#builder-live-status").classList.toggle("is-met", met);
  $("#nav-budget-track").style.setProperty("--builder-progress", pct / 100);
  $("#nav-budget-track").setAttribute("aria-valuenow", pct.toFixed(1));
  $("#nav-budget-track").setAttribute("aria-valuetext", `${$("#nav-budget-reduced").textContent}. ${met ? uiText("ui_budget_met_reading") : uiText("ui_budget_remaining_reading", { remaining: fmtM(REDUCTION_TARGET_M - cut) })}`);
  $("#nav-budget-track").classList.toggle("is-met", met);
  submitBtn.disabled = !met || contentPreview;
  $(".builder-submit-card").classList.toggle("is-ready", met);
  if (met && !budgetTargetMet) {
    emphasize($(".builder-submit-card .mini-icon"));
  }
  budgetTargetMet = met;

}
renderBudget();

$("#reset-btn").addEventListener("click", () => {
  selectedCuts.clear();
  selectedRevenue.clear();
  revenueAdjustment.millageRate = 0;
  renderBudget();
});

// -------------------- submit + postcard studio --------------------
const modal = $("#share-modal");
const shareCanvas = $("#share-canvas");
const shareDetailsCanvas = $("#share-details-canvas");
let lastFocused = null;
let shareValues = [...values];
let shareCuts = [...selectedCuts];
let shareRevenue = [...selectedRevenue];
let shareMillageRate = revenueAdjustment.millageRate;
let shareTheme = sharedPlan?.theme || "daylight";
let shareHeadline = sharedPlan?.headline || 0;
let shareSide = sharedPlan?.side || "front";
let shareFiles = {};
const shareOptions = () => ({ theme: shareTheme, headline: shareHeadline, side: shareSide, cuts: shareCuts, revenues: shareRevenue, millageRate: shareMillageRate });
let renderRevision = 0;
let submitting = false;
let sharing = false;
let savingImage = false;
let restoreSharePage = () => {};

function openModal() {
  // Preparing the export temporarily disables the triggering button, which
  // can move document.activeElement to the body before this dialog opens.
  lastFocused = submitBtn;
  modal.hidden = false;
  enterPanel(modal.querySelector(".share-studio-card"));
  modal.querySelector(".share-studio-card").scrollTop = 0;
  document.body.classList.add("modal-open");
  restoreSharePage = isolatePage(modal);
  (window.matchMedia("(max-width: 700px)").matches ? $("#share-close-mobile") : $("#share-close")).focus();
}
let closingShare = false;
async function closeModal() {
  if (modal.hidden || closingShare) return;
  closingShare = true;
  await exitPanel(modal.querySelector(".share-studio-card"));
  closingShare = false;
  modal.hidden = true;
  clearSaveImage();
  document.body.classList.remove("modal-open");
  restoreSharePage();
  lastFocused?.focus?.();
}
function selectedShareCanvas() { return shareSide === "front" ? shareCanvas : shareDetailsCanvas; }
function clearSaveImage() {
  $("#share-image-save").hidden = true;
  $("#share-save-image").removeAttribute("src");
}
function setShareSide(side) {
  clearSaveImage();
  shareSide = side;
  $("#share-url").value = shareURL(shareValues, shareOptions());
  const back = side === "back";
  $("#postcard-flipper").classList.toggle("is-flipped", back);
  $("#share-flip").setAttribute("aria-pressed", String(back));
  $("#share-flip").innerHTML = `<span aria-hidden="true">↻</span> ${uiHTML(back ? "ui_share_flip_front" : "ui_share_flip_back")}`;
  shareCanvas.setAttribute("aria-hidden", String(back));
  shareDetailsCanvas.setAttribute("aria-hidden", String(!back));
  $("#share-side-label").textContent = back ? uiText("ui_share_back_label") : uiText("ui_share_front_label");
  $(".share-preview-label > span:last-child").textContent = back ? "02 / 02" : "01 / 02";
  $("#share-status").textContent = "";
}
async function renderPostcards() {
  clearSaveImage();
  $("#share-url").value = shareURL(shareValues, shareOptions());
  modal.querySelectorAll("[data-share-theme]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.shareTheme === shareTheme)));
  modal.querySelectorAll("[data-share-headline]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.shareHeadline) === shareHeadline)));
  const revision = ++renderRevision;
  $("#share-native").disabled = true;
  $("#share-download").disabled = true;
  // Render into detached canvases, then commit together. Rapid style changes
  // cannot make an older image overwrite the user's latest selection.
  const front = document.createElement("canvas");
  const back = document.createElement("canvas");
  front.width = back.width = 1080;
  front.height = back.height = 1350;
  const options = shareOptions();
  try {
    await Promise.all([
      drawShareCard(front, shareValues, { ...options, side: "front" }),
      drawShareCard(back, shareValues, { ...options, side: "back" }),
    ]);
    // The embedded editor needs the real drawing, but never prepares an export
    // of its sample plan or opens the device's share/download interface.
    const [frontFile, backFile] = editorPreview ? [null, null] : await Promise.all([prepareShareFile(front), prepareShareFile(back)]);
    if (revision !== renderRevision) return;
    shareFiles = { front: frontFile, back: backFile };
    [[shareCanvas, front], [shareDetailsCanvas, back]].forEach(([target, source]) => {
      target.getContext("2d").clearRect(0, 0, 1080, 1350);
      target.getContext("2d").drawImage(source, 0, 0);
      target.setAttribute("aria-label", source.getAttribute("aria-label"));
    });
    $("#share-native").disabled = editorPreview;
    $("#share-download").disabled = editorPreview;
  } catch (error) {
    if (revision !== renderRevision) return;
    console.warn("Postcard could not render.", error);
    $("#share-status").textContent = uiText("ui_share_render_error");
  }
}
let pendingSubmission = null;
async function submitBudget(plan) {
  if (contentPreview) return uiText("ui_budget_preview");
  const fingerprint = JSON.stringify([[...shareCuts].sort(), [...shareRevenue].sort(), shareMillageRate]);
  if (pendingSubmission?.fingerprint !== fingerprint) pendingSubmission = { fingerprint, id: crypto.randomUUID() };
  const selectedPlan = costCenterPlan(shareCuts, shareRevenue, shareMillageRate);
  const payload = {
    id: pendingSubmission.id,
    submittedAt: new Date().toISOString(),
    costCenterVersion: COST_CENTER_VERSION,
    illustrative: false,
    revenues: shareRevenue,
    millageRate: shareMillageRate,
    cuts: selectedPlan.items,
    reduction: selectedPlan.reduction,
    revenue: selectedPlan.revenue,
    gapClosed: selectedPlan.gapClosed,
    budget: Object.fromEntries(SERVICES.map((service, i) => [service.id, plan[i]])),
    totalM: plan.reduce((sum, value) => sum + value, 0),
  };
  try {
    if (SUBMIT_ENDPOINT) {
      const response = await fetch(SUBMIT_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`Submission returned ${response.status}`);
      return uiText("ui_budget_saved");
    }
    const previous = JSON.parse(localStorage.getItem("budget-submissions") || "[]");
    if (!Array.isArray(previous)) throw new Error("Invalid local submission history");
    previous.push(payload);
    localStorage.setItem("budget-submissions", JSON.stringify(previous));
    return uiText("ui_budget_demo_saved");
  } catch (error) {
    console.warn("Budget submission could not be saved.", error);
    return uiText("ui_budget_save_error");
  }
}
submitBtn.addEventListener("click", async () => {
  if (submitting || !costCenterPlan(selectedCuts, selectedRevenue, revenueAdjustment.millageRate).targetMet) return;
  submitting = true;
  shareValues = [...values];
  shareCuts = [...selectedCuts];
  shareRevenue = [...selectedRevenue];
  shareMillageRate = revenueAdjustment.millageRate;
  submitBtn.disabled = true;
  submitBtn.textContent = uiText("ui_budget_preparing");
  $("#share-status").textContent = "";
  $("#share-link-fallback").hidden = true;
  $("#share-url").value = shareURL(shareValues, shareOptions());
  setShareSide(shareSide);
  $("#share-save-note").textContent = await submitBudget(shareValues);
  // Do not let a slow remote font keep the sharing flow closed indefinitely.
  await Promise.race([document.fonts?.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
  await renderPostcards();
  openModal();
  submitting = false;
  submitBtn.textContent = uiText("ui_budget_submit");
  renderBudget();
});

$("#share-close").addEventListener("click", closeModal);
$("#share-close-mobile").addEventListener("click", closeModal);
$("#share-edit").addEventListener("click", closeModal);
$("#share-flip").addEventListener("click", () => setShareSide(shareSide === "front" ? "back" : "front"));
modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
modal.querySelectorAll("[data-share-theme]").forEach(button => button.addEventListener("click", () => {
  shareTheme = button.dataset.shareTheme;
  modal.querySelectorAll("[data-share-theme]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  $("#share-status").textContent = "";
  renderPostcards();
}));
modal.querySelectorAll("[data-share-headline]").forEach(button => { button.textContent = postcardHeadlines()[Number(button.dataset.shareHeadline)].join(" "); });
modal.querySelectorAll("[data-share-headline]").forEach(button => button.addEventListener("click", () => {
  shareHeadline = Number(button.dataset.shareHeadline);
  modal.querySelectorAll("[data-share-headline]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  setShareSide("front");
  renderPostcards();
}));
const postcard = $("#postcard-perspective");
postcard.addEventListener("pointermove", event => {
  if (reducedMotion.matches || event.pointerType !== "mouse") return;
  const rect = postcard.getBoundingClientRect();
  $("#postcard-tilt").style.setProperty("--tilt-x", `${((event.clientY - rect.top) / rect.height - 0.5) * -9}deg`);
  $("#postcard-tilt").style.setProperty("--tilt-y", `${((event.clientX - rect.left) / rect.width - 0.5) * 9}deg`);
});
postcard.addEventListener("pointerleave", () => {
  $("#postcard-tilt").style.removeProperty("--tilt-x");
  $("#postcard-tilt").style.removeProperty("--tilt-y");
});
document.addEventListener("keydown", event => {
  if (modal.hidden) return;
  if (event.key === "Escape") { closeModal(); return; }
  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled)")].filter(el => el.getClientRects().length);
  const first = focusable[0]; const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
async function copyShareText(caption = false) {
  if (editorPreview) return;
  const content = caption ? shareCaption(shareValues, shareOptions()) : shareURL(shareValues, shareOptions());
  try {
    await navigator.clipboard.writeText(content);
    $("#share-status").textContent = caption ? uiText("ui_share_caption_copied") : uiText("ui_share_link_copied");
  } catch {
    $("#share-link-fallback").hidden = false;
    $("#share-url").value = shareURL(shareValues, shareOptions());
    $("#share-url").focus();
    $("#share-url").select();
    $("#share-status").textContent = uiText("ui_share_clipboard_error");
  }
}
$("#share-native").addEventListener("click", async () => {
  if (editorPreview || sharing || savingImage) return;
  sharing = true;
  $("#share-native").disabled = true;
  const result = await nativeShare(shareFiles[shareSide], shareValues, shareOptions());
  if (result === "unavailable") await copyShareText();
  if (result === "shared-image") $("#share-status").textContent = uiText("ui_share_image_shared");
  if (result === "shared-link") $("#share-status").textContent = uiText("ui_share_link_shared");
  if (result === "cancelled") $("#share-status").textContent = uiText("ui_share_cancelled");
  sharing = false;
  $("#share-native").disabled = false;
});
$("#share-copy").addEventListener("click", () => copyShareText());
$("#share-caption").addEventListener("click", () => copyShareText(true));
$("#share-download").addEventListener("click", async () => {
  if (editorPreview || savingImage || sharing) return;
  savingImage = true;
  const revision = renderRevision;
  const side = shareSide;
  $("#share-download").disabled = true;
  try {
    const result = await downloadCard(selectedShareCanvas(), `${shareTheme}-${side === "front" ? "postcard" : "budget"}`, shareFiles[side]);
    if (revision !== renderRevision || side !== shareSide || modal.hidden) return;
    if (result === "preview") {
      $("#share-save-image").src = selectedShareCanvas().toDataURL("image/png");
      $("#share-save-image").alt = selectedShareCanvas().getAttribute("aria-label");
      $("#share-image-save").hidden = false;
      $("#share-status").textContent = uiText("ui_share_image_ready");
      $("#share-image-save-title").focus();
      $("#share-image-save").scrollIntoView({ block: "nearest" });
    }
    if (result === "download") $("#share-status").textContent = uiText("ui_share_download_requested", { side: uiText(side === "front" ? "ui_share_front_name" : "ui_share_back_name") });
    if (result === "shared-image") $("#share-status").textContent = uiText("ui_share_save_menu");
    if (result === "cancelled") $("#share-status").textContent = uiText("ui_share_save_cancelled");
  } catch {
    if (revision === renderRevision && side === shareSide && !modal.hidden) $("#share-status").textContent = uiText("ui_share_save_error");
  } finally {
    savingImage = false;
    if (revision === renderRevision) $("#share-download").disabled = false;
  }
});

// -------------------- resource feedback --------------------
const feedbackForm = $("#feedback-form");
const feedbackSubmit = $("#feedback-submit");
feedbackSubmit.innerHTML = `${uiHTML("ui_feedback_submit")} <svg aria-hidden="true"><use href="#icon-arrow"></use></svg>`;
const feedbackStatus = $("#feedback-status");
const feedbackThanks = $("#feedback-thanks");
const feedbackModal = $("#feedback-modal");
const feedbackEntry = $("#feedback-entry");
let feedbackLastFocused = null;
let restoreFeedbackPage = () => {};
let feedbackRevision = 0;
let feedbackAttempt = null;
const FEEDBACK_COMPLETED_KEY = "budget-feedback-completed";
let feedbackCompleted = false;

function hasCompletedFeedback() {
  if (editorPreview) return feedbackCompleted;
  try {
    feedbackCompleted ||= localStorage.getItem(FEEDBACK_COMPLETED_KEY) === "true";
  } catch { /* Keep the current-page receipt when storage is unavailable. */ }
  return feedbackCompleted;
}

function renderFeedbackState() {
  const completed = hasCompletedFeedback();
  feedbackEntry.hidden = completed;
  feedbackThanks.hidden = !completed;
  feedbackModal.classList.toggle("is-complete", completed);
  feedbackModal.setAttribute("aria-labelledby", completed ? "feedback-thanks-title" : "feedback-modal-title");
  feedbackModal.setAttribute("aria-describedby", completed ? "feedback-thanks-description" : "feedback-modal-intro");
}

function openFeedbackModal() {
  feedbackRevision++;
  feedbackLastFocused = document.activeElement;
  feedbackStatus.textContent = "";
  renderFeedbackState();
  feedbackModal.hidden = false;
  restoreFeedbackPage = isolatePage(feedbackModal);
  enterPanel(feedbackModal.querySelector(".feedback-modal-card"));
  document.body.classList.add("modal-open");
  $("#feedback-close").focus();
}

let closingFeedback = false;
async function closeFeedbackModal() {
  if (feedbackModal.hidden || closingFeedback) return;
  closingFeedback = true;
  await exitPanel(feedbackModal.querySelector(".feedback-modal-card"));
  closingFeedback = false;
  feedbackModal.hidden = true;
  feedbackRevision++;
  document.body.classList.remove("modal-open");
  restoreFeedbackPage();
  feedbackLastFocused?.focus?.();
}

$("#feedback-open").addEventListener("click", openFeedbackModal);
$("#feedback-close").addEventListener("click", closeFeedbackModal);
$("#feedback-done").addEventListener("click", closeFeedbackModal);
feedbackModal.addEventListener("click", (event) => {
  if (event.target === feedbackModal) closeFeedbackModal();
});

document.addEventListener("keydown", (event) => {
  if (feedbackModal.hidden) return;
  if (event.key === "Escape") {
    closeFeedbackModal();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = [...feedbackModal.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")]
    .filter((element) => element.getClientRects().length && !element.closest("[hidden]"));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

async function saveFeedback(payload) {
  if (contentPreview) throw new Error("Draft preview does not save feedback.");
  if (!FEEDBACK_ENDPOINT) {
    throw new Error("Feedback service is not configured.");
  }

  const response = await fetch(FEEDBACK_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok || result.success !== true) {
    throw new Error(`Feedback request failed: ${response.status}`);
  }
}

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (feedbackSubmit.disabled) return;
  if (hasCompletedFeedback()) {
    renderFeedbackState();
    return;
  }
  const data = new FormData(feedbackForm);
  const payload = {
    helpful: data.get("helpful"),
    comment: String(data.get("comment") || "").trim(),
    botcheck: data.has("botcheck"),
  };

  const fingerprint = JSON.stringify(payload);
  if (feedbackAttempt?.fingerprint !== fingerprint) feedbackAttempt = { fingerprint, id: crypto.randomUUID() };
  payload.id = feedbackAttempt.id;
  feedbackSubmit.disabled = true;
  const revision = feedbackRevision;
  feedbackSubmit.textContent = uiText("ui_feedback_sending");
  feedbackStatus.textContent = "";

  try {
    await saveFeedback(payload);
    feedbackCompleted = true;
    try { localStorage.setItem(FEEDBACK_COMPLETED_KEY, "true"); } catch { /* Receipt remains in memory. */ }
    feedbackForm.reset();
    renderFeedbackState();
    if (feedbackModal.hidden) return;
    enterPanel(feedbackThanks);
    $("#feedback-thanks-title").focus();
  } catch (error) {
    console.warn("Feedback submission failed.", error);
    if (revision === feedbackRevision) feedbackStatus.textContent = uiText("ui_feedback_error");
  } finally {
    feedbackSubmit.disabled = false;
    feedbackSubmit.innerHTML = `${uiHTML("ui_feedback_submit")} <svg aria-hidden="true"><use href="#icon-arrow"></use></svg>`;
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === FEEDBACK_COMPLETED_KEY && event.newValue === "true") {
    renderFeedbackState();
    if (!feedbackModal.hidden) $("#feedback-thanks-title").focus();
  }
});

// Department stories load the player only after a resident opens a video.
initServiceVideos();

// This overview always shows the proposed baseline, independent of the resident's plan.
$("#service-overview-total").textContent = fmtM(PROPOSED_TOTAL);
SERVICES.forEach((service, index) => {
  const share = PROPOSED_TOTAL ? service.proposed / PROPOSED_TOTAL * 100 : 0;
  const segment = document.createElement("span");
  segment.style.width = `${share}%`;
  segment.style.backgroundColor = SERVICE_COLORS[index];
  $("#service-overview-bar").append(segment);
  const item = document.createElement("li");
  item.style.setProperty("--service-color", SERVICE_COLORS[index]);
  item.innerHTML = `<i aria-hidden="true"></i><span>${escapeText(service.name)}</span><strong>${share.toFixed(1)}%</strong>`;
  $("#service-overview-legend").append(item);
});
initMotion();

// Used only by the authenticated editor iframe after the real page has booted.
// This reveals existing UI states without submitting a resident budget or
// persisting feedback; ordinary public and standalone draft pages cannot call it.
let editorSceneRevision = 0;
export async function showEditorPreviewSection(section, selection = {}) {
  if (!editorPreview) return false;
  const revision = ++editorSceneRevision;
  if (section !== 'sharing') await closeModal();
  if (section !== 'feedback') await closeFeedbackModal();
  if (revision !== editorSceneRevision) return false;

  if (section === 'sharing') {
    // Pick one positive cost center per department as an explicitly labeled
    // sample. These choices live only inside the preview's postcard state.
    shareCuts = SERVICES.map(service => service.cuts.find(cut => cut.savings > 0)?.id).filter(Boolean);
    shareRevenue = []; shareMillageRate = 0;
    shareValues = costCenterPlan(shareCuts, shareRevenue, shareMillageRate).values;
    const key = selection.key || '';
    const side = selection.side === 'back' || /(?:share-details|ui_share_(?:flip_front|back_label)|ui_postcard_(?:back|summary|funding|comparison|scale|no_change|revenue_summary))/.test(key) ? 'back' : 'front';
    setShareSide(side);
    $('#share-save-note').textContent = 'Editor preview · sample budget choices. Nothing has been submitted.';
    $('#share-link-fallback').hidden = true;
    for (const button of modal.querySelectorAll('#share-native, #share-download, #share-copy, #share-caption')) button.disabled = true;
    if (modal.hidden) openModal();
    await renderPostcards();
    return revision === editorSceneRevision;
  }
  if (section === 'feedback') {
    feedbackCompleted = /(?:thanks|ui_feedback_thanks)/.test(selection.key || '');
    if (feedbackModal.hidden) openFeedbackModal();
    else renderFeedbackState();
    feedbackSubmit.disabled = true;
    return true;
  }
  if (section === 'assumptions') $('.calc-assumptions').open = true;
  if (section === 'sources') {
    for (const details of document.querySelectorAll('#sources details')) details.open = true;
  }
  if (section === 'faqs') {
    for (const details of document.querySelectorAll('.faq-list details')) details.open = true;
  }
  return true;
}
