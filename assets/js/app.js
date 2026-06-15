import { BUSINESS, UI_COPY } from "./config.js";
import { normalizeMenu } from "./menu.js";

const state = {
  language: BUSINESS.languageDefault,
  menuCache: {},
  menu: null,
  activeFilter: "all",
  searchQuery: "",
  cart: [],
  optionItem: null,
  bookPage: 0,
  bookModalOpen: false
};

const BOOK_PAGE_COUNT = 16;
let revealObserver;
let animationRegionObserver;
let animeReady = null;
let hasAnimatedMenuCards = false;
let bookFlipSyncing = false;
const bookFlips = {
  preview: null,
  modal: null
};

const elements = {
  header: document.querySelector("[data-header]"),
  businessFields: document.querySelectorAll("[data-business]"),
  hoursList: document.querySelector("[data-business-hours]"),
  mapFrame: document.querySelector("[data-map-frame]"),
  mapLink: document.querySelector('[data-business-link="map"]'),
  phoneLink: document.querySelector('[data-business-link="phone"]'),
  emailLink: document.querySelector('[data-business-link="email"]'),
  languageButtons: document.querySelectorAll("[data-language-switch]"),
  filterList: document.querySelector("[data-filter-list]"),
  menuSearch: document.querySelector("[data-menu-search]"),
  menuStatus: document.querySelector("[data-menu-status]"),
  menuSections: document.querySelector("[data-menu-sections]"),
  drawerBackdrop: document.querySelector("[data-drawer-backdrop]"),
  cartDrawer: document.querySelector("[data-cart-drawer]"),
  cartItems: document.querySelector("[data-cart-items]"),
  cartTotal: document.querySelector("[data-cart-total]"),
  orderForm: document.querySelector("[data-order-form]"),
  reservationForm: document.querySelector("[data-reservation-form]"),
  optionBackdrop: document.querySelector("[data-option-backdrop]"),
  optionModal: document.querySelector("[data-option-modal]"),
  optionTitle: document.querySelector("[data-option-title]"),
  optionList: document.querySelector("[data-option-list]"),
  toast: document.querySelector("[data-toast]"),
  menuBook: document.querySelector("[data-menu-book]"),
  menuBookModal: document.querySelector("[data-menu-book-modal]"),
  bookPrev: document.querySelector("[data-book-prev]"),
  bookNext: document.querySelector("[data-book-next]"),
  bookPageIndicator: document.querySelector("[data-book-page-indicator]"),
  bookPageIndicatorModal: document.querySelector("[data-book-page-indicator-modal]"),
  bookCaption: document.querySelector("[data-book-caption]"),
  bookBackdrop: document.querySelector("[data-book-backdrop]"),
  bookModal: document.querySelector("[data-book-modal]")
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadAnime() {
  if (prefersReducedMotion) return Promise.resolve(null);
  if (!animeReady) {
    animeReady = import("https://cdn.jsdelivr.net/npm/animejs/+esm")
      .then((module) => module?.default ?? module?.anime ?? null)
      .catch(() => null);
  }
  return animeReady;
}

async function animatePageIntro() {
  const anime = await loadAnime();
  if (!anime) return;

  anime.set([".site-header", ".hero-copy > *", ".hero-visual"], {
    opacity: 0,
    translateY: 22
  });

  anime({
    targets: ".site-header",
    opacity: [0, 1],
    translateY: [-18, 0],
    duration: 680,
    easing: "easeOutExpo"
  });

  anime({
    targets: ".hero-copy > *",
    opacity: [0, 1],
    translateY: [28, 0],
    delay: anime.stagger(90, { start: 120 }),
    duration: 760,
    easing: "easeOutCubic"
  });

  anime({
    targets: ".hero-visual",
    opacity: [0, 1],
    translateY: [34, 0],
    scale: [0.97, 1],
    delay: 260,
    duration: 900,
    easing: "easeOutExpo"
  });
}

async function animateMenuCards(scope = elements.menuSections) {
  if (prefersReducedMotion || !scope) return;
  if (hasAnimatedMenuCards) return;
  const cards = Array.from(scope.querySelectorAll(".menu-card")).slice(0, 8);
  if (!cards.length) return;

  const anime = await loadAnime();
  if (!anime) return;

  anime.remove(cards);
  anime.set(cards, {
    opacity: 0,
    translateY: 26
  });

  anime({
    targets: cards,
    opacity: [0, 1],
    translateY: [26, 0],
    delay: anime.stagger(42),
    duration: 380,
    easing: "easeOutCubic"
  });

  hasAnimatedMenuCards = true;
}

async function animatePanelOpen(target) {
  if (prefersReducedMotion || !target) return;
  const anime = await loadAnime();
  if (!anime) return;

  anime.remove(target);
  anime.set(target, {
    opacity: 0,
    translateY: 18,
    scale: 0.985
  });

  anime({
    targets: target,
    opacity: [0, 1],
    translateY: [18, 0],
    scale: [0.985, 1],
    duration: 320,
    easing: "easeOutCubic"
  });
}

function formatPrice(value) {
  return new Intl.NumberFormat(state.language === "de" ? "de-DE" : "en-GB", {
    style: "currency",
    currency: "EUR"
  }).format(value);
}

function getCopy() {
  return UI_COPY[state.language];
}

function setLanguage(language) {
  state.language = language;
  state.activeFilter = "all";
  state.bookPage = 0;
  applyTranslations();
  initLanguageSwitcher();
  updateCart();
  renderMenuBook();
  loadMenu(language);
}

function applyTranslations() {
  const copy = getCopy();

  document.documentElement.lang = state.language;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const path = node.getAttribute("data-i18n").split(".");
    let value = copy;
    path.forEach((segment) => {
      value = value?.[segment];
    });
    if (typeof value === "string") {
      node.textContent = value;
    }
  });

  elements.menuSearch.placeholder = copy.menu.search;
  elements.businessFields.forEach((node) => {
    const key = node.getAttribute("data-business");
    if (key && BUSINESS[key]) node.textContent = BUSINESS[key];
  });

  elements.hoursList.innerHTML = BUSINESS.hours
    .map(
      (item) => `
        <div class="hours-row">
          <span>${item.days}</span>
          <span>${item.time}</span>
        </div>
      `
    )
    .join("");

  elements.mapLink.href = BUSINESS.mapUrl;
  elements.phoneLink.href = BUSINESS.phoneHref;
  elements.emailLink.href = `mailto:${BUSINESS.email}`;
  elements.mapFrame.src = BUSINESS.mapEmbedUrl;
}

async function loadMenu(language) {
  const copy = getCopy();
  elements.menuStatus.textContent = copy.menu.loading;
  elements.menuSections.innerHTML = "";

  try {
    if (!state.menuCache[language]) {
      const response = await fetch(`./assets/data/menu.${language}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rawData = await response.json();
      state.menuCache[language] = normalizeMenu(rawData, language);
    }

    state.menu = state.menuCache[language];
    renderFilters();
    renderMenu();
  } catch (error) {
    console.error(error);
    state.menu = null;
    elements.filterList.innerHTML = "";
    elements.menuSections.innerHTML = "";
    elements.menuStatus.textContent = copy.menu.empty;
  }
}

function renderFilters() {
  if (!state.menu) return;
  const filtersMarkup = state.menu.filters
    .map(
      (filter) => `
        <button
          type="button"
          class="${filter.key === state.activeFilter ? "is-active" : ""}"
          data-filter="${filter.key}"
        >
          ${filter.label} <span>${filter.count}</span>
        </button>
      `
    )
    .join("");

  elements.filterList.innerHTML = filtersMarkup;
}

function getVisibleSections() {
  if (!state.menu) return [];
  const query = state.searchQuery.trim().toLowerCase();

  return state.menu.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const matchesFilter = state.activeFilter === "all" || item.filterKeys.includes(state.activeFilter);
        const matchesQuery = !query || item.searchText.includes(query);
        return matchesFilter && matchesQuery;
      })
    }))
    .filter((section) => section.items.length > 0);
}

function renderMenu() {
  if (!state.menu) return;

  const copy = getCopy();
  const tagLabels = copy.tags;
  const visibleSections = getVisibleSections();
  const visibleCount = visibleSections.reduce((sum, section) => sum + section.items.length, 0);

  elements.menuStatus.innerHTML = `<span class="status-pill">${visibleCount}</span> ${copy.menu.results}`;

  elements.menuSections.innerHTML = visibleSections
    .map(
      (section) => `
        <section class="reveal">
          <div class="menu-section-header">
            <h3>${section.name}</h3>
            <span class="category-pill">${section.items.length}</span>
          </div>
          <div class="menu-section-grid">
            ${section.items.map((item) => renderMenuCard(item, tagLabels, copy)).join("")}
          </div>
        </section>
      `
    )
    .join("");

  initScrollAnimations();
  animateMenuCards();
}

function getBookImagePath(pageNumber) {
  const page = String(pageNumber).padStart(2, "0");
  return `./assets/images/menu-book/${state.language}/page-${page}.jpg`;
}

function hasPageFlip() {
  return Boolean(window.St?.PageFlip);
}

function normalizeBookPage(pageIndex) {
  const safeIndex = Math.max(0, Math.min(BOOK_PAGE_COUNT - 1, pageIndex));
  return safeIndex % 2 === 0 ? safeIndex : safeIndex - 1;
}

function getBookPagesMarkup() {
  return Array.from({ length: BOOK_PAGE_COUNT }, (_, index) => {
    const pageNumber = index + 1;
    return `
      <figure class="menu-book-page" data-book-page="${pageNumber}">
        <img src="${getBookImagePath(pageNumber)}" alt="SESAMIE menu page ${pageNumber}" loading="lazy" />
        <figcaption>Page ${pageNumber}</figcaption>
      </figure>
    `;
  }).join("");
}

function getFallbackBookMarkup() {
  const leftPage = state.bookPage + 1;
  const rightPage = Math.min(leftPage + 1, BOOK_PAGE_COUNT);
  const pageNumbers = [leftPage, rightPage].filter(
    (page, index) => page <= BOOK_PAGE_COUNT && (index === 0 || rightPage !== leftPage)
  );

  return pageNumbers
    .map(
      (pageNumber) => `
        <figure class="menu-book-page" data-book-page="${pageNumber}">
          <img src="${getBookImagePath(pageNumber)}" alt="SESAMIE menu page ${pageNumber}" loading="lazy" />
          <figcaption>Page ${pageNumber}</figcaption>
        </figure>
      `
    )
    .join("");
}

function updateBookIndicators() {
  const leftPage = state.bookPage + 1;
  const rightPage = Math.min(leftPage + 1, BOOK_PAGE_COUNT);
  const indicatorText = rightPage > leftPage ? `${leftPage} - ${rightPage}` : `${leftPage}`;

  if (elements.bookPageIndicator) {
    elements.bookPageIndicator.textContent = indicatorText;
  }
  if (elements.bookPageIndicatorModal) {
    elements.bookPageIndicatorModal.textContent = indicatorText;
  }

  document.querySelectorAll("[data-book-prev]").forEach((button) => {
    button.disabled = state.bookPage === 0;
  });
  document.querySelectorAll("[data-book-next]").forEach((button) => {
    button.disabled = state.bookPage >= BOOK_PAGE_COUNT - 2;
  });
}

function destroyBookFlips() {
  Object.keys(bookFlips).forEach((key) => {
    const instance = bookFlips[key];
    if (instance?.destroy) instance.destroy();
    bookFlips[key] = null;
  });
}

function syncBookStateFromFlip(pageIndex, sourceKey) {
  if (bookFlipSyncing) return;

  state.bookPage = normalizeBookPage(pageIndex);
  updateBookIndicators();

  bookFlipSyncing = true;
  Object.entries(bookFlips).forEach(([key, instance]) => {
    if (key === sourceKey || !instance?.turnToPage) return;
    instance.turnToPage(state.bookPage);
  });
  bookFlipSyncing = false;
}

function createBookFlip(target, key, options = {}) {
  if (!target || !hasPageFlip()) return null;

  const PageFlip = window.St.PageFlip;
  const instance = new PageFlip(target, {
    width: options.width ?? 320,
    height: options.height ?? 450,
    size: "stretch",
    minWidth: options.minWidth ?? 180,
    maxWidth: options.maxWidth ?? 640,
    minHeight: options.minHeight ?? 240,
    maxHeight: options.maxHeight ?? 920,
    maxShadowOpacity: options.maxShadowOpacity ?? 0.18,
    showCover: false,
    usePortrait: false,
    mobileScrollSupport: false,
    autoSize: true,
    drawShadow: true,
    flippingTime: 720,
    startPage: state.bookPage
  });

  instance.loadFromHTML(target.querySelectorAll(".menu-book-page"));
  target.classList.add("is-pageflip");

  if (instance.on) {
    instance.on("flip", (event) => {
      if (typeof event.data === "number") {
        syncBookStateFromFlip(event.data, key);
      }
    });
  }

  if (instance.turnToPage) {
    instance.turnToPage(state.bookPage);
  }

  return instance;
}

function initBookFlipInstances() {
  if (!hasPageFlip()) return;

  destroyBookFlips();

  bookFlips.preview = createBookFlip(elements.menuBook, "preview", {
    width: 300,
    height: 422,
    minWidth: 160,
    maxWidth: 360,
    minHeight: 220,
    maxHeight: 520,
    maxShadowOpacity: 0.12
  });

  updateBookIndicators();
}

function ensureModalBookFlip() {
  if (!hasPageFlip() || !elements.menuBookModal) return;
  if (bookFlips.modal?.turnToPage) {
    bookFlips.modal.turnToPage(state.bookPage);
    updateBookIndicators();
    return;
  }

  bookFlips.modal = createBookFlip(elements.menuBookModal, "modal", {
    width: 620,
    height: 874,
    minWidth: 300,
    maxWidth: 860,
    minHeight: 420,
    maxHeight: 1180,
    maxShadowOpacity: 0.18
  });

  updateBookIndicators();
}

function renderMenuBook() {
  const markup = hasPageFlip() ? getBookPagesMarkup() : getFallbackBookMarkup();

  if (elements.menuBook) {
    elements.menuBook.innerHTML = markup;
    elements.menuBook.classList.toggle("is-pageflip", hasPageFlip());
  }
  if (elements.menuBookModal) {
    elements.menuBookModal.innerHTML = markup;
    elements.menuBookModal.classList.toggle("is-pageflip", hasPageFlip());
  }

  if (hasPageFlip()) {
    initBookFlipInstances();
  } else {
    updateBookIndicators();
  }
}

function openBookModal() {
  state.bookModalOpen = true;
  if (elements.bookBackdrop) elements.bookBackdrop.hidden = false;
  if (elements.bookModal) {
    elements.bookModal.classList.add("is-open");
    elements.bookModal.setAttribute("aria-hidden", "false");
  }
  document.body.classList.add("has-book-modal");
  animatePanelOpen(document.querySelector(".book-modal-shell"));
  if (hasPageFlip()) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        ensureModalBookFlip();
      });
    });
  }
}

function closeBookModal() {
  state.bookModalOpen = false;
  if (elements.bookBackdrop) elements.bookBackdrop.hidden = true;
  if (elements.bookModal) {
    elements.bookModal.classList.remove("is-open");
    elements.bookModal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("has-book-modal");
}

function renderMenuCard(item, tagLabels, copy) {
  const hasVariants = item.variants.length > 0;
  const prices = hasVariants ? item.variants.map((variant) => variant.price) : item.price ? [item.price] : [];
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : minPrice;
  const priceText = minPrice !== maxPrice ? `${copy.menu.from} ${formatPrice(minPrice)}` : formatPrice(minPrice);

  const tagsMarkup = [
    ...item.tags.map((tag) => `<span class="tag">${tagLabels[tag]}</span>`),
    hasVariants ? `<span class="tag option-tag">${copy.menu.variants}</span>` : ""
  ]
    .filter(Boolean)
    .join("");

  const ingredientText = item.description || item.ingredients.join(" | ");
  const detailText =
    item.description && item.ingredients.length > 0 ? `<p class="menu-ingredients">${item.ingredients.join(" | ")}</p>` : "";
  const allergenText =
    item.allergens.length > 0 || item.additives.length > 0
      ? `<p class="allergen-line">
          ${item.allergens.length > 0 ? `Allergene: ${item.allergens.join(", ")}` : ""}
          ${item.allergens.length > 0 && item.additives.length > 0 ? " | " : ""}
          ${item.additives.length > 0 ? `Zusatzstoffe: ${item.additives.join(", ")}` : ""}
        </p>`
      : "";

  return `
    <article class="menu-card" data-menu-item="${item.id}">
      <div class="menu-card-top">
        <div>
          <div class="menu-category">${item.sectionName}</div>
          <h3>${item.name}</h3>
        </div>
        <button type="button" class="menu-add" data-add-item="${item.id}" aria-label="${copy.menu.add}">+</button>
      </div>
      ${ingredientText ? `<p>${ingredientText}</p>` : ""}
      ${detailText}
      ${tagsMarkup ? `<div class="tag-row">${tagsMarkup}</div>` : ""}
      <div class="menu-card-bottom">
        <div>
          ${allergenText}
        </div>
        <strong class="price-display">${priceText}</strong>
      </div>
    </article>
  `;
}

function getLocalizedCartEntry(entry) {
  if (!state.menu) return { name: entry.name, variantLabel: entry.variantLabel };

  const currentItem = state.menu.items.find((item) => item.id === entry.itemId);
  if (!currentItem) return { name: entry.name, variantLabel: entry.variantLabel };

  const currentVariant = entry.variantId
    ? currentItem.variants.find((variant) => variant.id === entry.variantId)
    : null;

  return {
    name: currentItem.name,
    variantLabel:
      currentVariant ? [currentVariant.name, currentVariant.size].filter(Boolean).join(" - ") : entry.variantLabel
  };
}

function addToCart(item, variant = null) {
  state.cart.push({
    id: `${item.id}-${variant?.id || "default"}-${Date.now()}`,
    itemId: item.id,
    variantId: variant?.id || "",
    name: item.name,
    sectionName: item.sectionName,
    variantLabel: [variant?.name, variant?.size].filter(Boolean).join(" - "),
    quantity: 1,
    note: "",
    unitPrice: variant?.price ?? item.price ?? 0
  });

  updateCart();
  openCart();
}

function updateCart() {
  const copy = getCopy();
  const total = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  elements.cartTotal.textContent = formatPrice(total);

  if (state.cart.length === 0) {
    elements.cartItems.innerHTML = `<div class="cart-empty">${copy.order.empty}</div>`;
    return;
  }

  elements.cartItems.innerHTML = state.cart
    .map((item) => {
      const localized = getLocalizedCartEntry(item);
      return `
        <article class="cart-line" data-cart-id="${item.id}">
          <div class="cart-line-top">
            <div>
              <h3>${localized.name}</h3>
              ${localized.variantLabel ? `<div class="cart-line-meta">${localized.variantLabel}</div>` : ""}
              <div class="cart-line-section">${item.sectionName}</div>
            </div>
            <strong class="option-price">${formatPrice(item.unitPrice * item.quantity)}</strong>
          </div>

          <div class="cart-line-controls">
            <div class="quantity-stepper">
              <button type="button" data-qty-minus="${item.id}" aria-label="Decrease">-</button>
              <span>${item.quantity}</span>
              <button type="button" data-qty-plus="${item.id}" aria-label="Increase">+</button>
            </div>
            <button type="button" class="remove-line" data-remove-item="${item.id}">${copy.order.remove}</button>
          </div>

          <label>
            <span>${copy.order.note}</span>
            <textarea rows="2" data-note-item="${item.id}">${item.note}</textarea>
          </label>
        </article>
      `;
    })
    .join("");
}

function openCart() {
  elements.drawerBackdrop.hidden = false;
  elements.cartDrawer.classList.add("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  animatePanelOpen(elements.cartDrawer);
}

function closeCart() {
  elements.drawerBackdrop.hidden = true;
  elements.cartDrawer.classList.remove("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
}

function openOptions(item) {
  state.optionItem = item;
  const copy = getCopy();
  elements.optionTitle.textContent = item.name;
  elements.optionList.innerHTML = item.variants
    .map(
      (variant, index) => `
        <button type="button" class="option-item" data-option-index="${index}">
          <div>
            <strong>${[variant.name, variant.size].filter(Boolean).join(" - ") || item.name}</strong>
            <div class="option-meta">
              ${variant.allergens.length > 0 ? `Allergene: ${variant.allergens.join(", ")}` : ""}
            </div>
          </div>
          <div>
            <div class="option-price">${formatPrice(variant.price)}</div>
            <span class="tag option-tag">${copy.menu.choose}</span>
          </div>
        </button>
      `
    )
    .join("");

  elements.optionBackdrop.hidden = false;
  elements.optionModal.classList.add("is-open");
  elements.optionModal.setAttribute("aria-hidden", "false");
  animatePanelOpen(document.querySelector(".option-modal-card"));
}

function closeOptions() {
  state.optionItem = null;
  elements.optionBackdrop.hidden = true;
  elements.optionModal.classList.remove("is-open");
  elements.optionModal.setAttribute("aria-hidden", "true");
}

function buildWhatsAppOrderMessage() {
  const copy = getCopy();
  const formData = new FormData(elements.orderForm);
  const total = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const type = formData.get("type");

  const typeLabelMap = {
    pickup: copy.order.pickup,
    reservation: copy.order.reservation,
    general: copy.order.general
  };

  const itemsText = state.cart.length
    ? state.cart
        .map((item, index) => {
          const localized = getLocalizedCartEntry(item);
          const itemLabel = [localized.name, localized.variantLabel].filter(Boolean).join(" - ");
          const noteLine = item.note ? `\n   ${copy.order.note}: ${item.note}` : "";
          return `${index + 1}. ${itemLabel} x ${item.quantity} - ${formatPrice(item.unitPrice * item.quantity)}${noteLine}`;
        })
        .join("\n")
    : copy.order.empty;

  return [
    state.language === "de" ? "SESAMIE Bestellung" : "SESAMIE Order",
    "",
    `Name: ${formData.get("name") || ""}`,
    `Telefon: ${formData.get("phone") || ""}`,
    `${state.language === "de" ? "Typ" : "Type"}: ${typeLabelMap[type] || type}`,
    `${copy.order.desiredTime}: ${formData.get("desiredTime") || ""}`,
    "",
    `${state.language === "de" ? "Bestellung" : "Order"}:`,
    "",
    itemsText,
    "",
    `${copy.order.total}: ${formatPrice(total)}`,
    `${state.language === "de" ? "Adresse" : "Address"}: ${BUSINESS.address}`,
    formData.get("note") ? `${copy.order.message}: ${formData.get("note")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildWhatsAppReservationMessage() {
  const formData = new FormData(elements.reservationForm);
  return [
    state.language === "de" ? "SESAMIE Tischreservierung" : "SESAMIE Table Reservation",
    "",
    `Name: ${formData.get("name") || ""}`,
    `Telefon: ${formData.get("phone") || ""}`,
    `${getCopy().reservation.date}: ${formData.get("date") || ""}`,
    `${getCopy().reservation.time}: ${formData.get("time") || ""}`,
    `${getCopy().reservation.guests}: ${formData.get("guests") || ""}`,
    `${getCopy().reservation.note}: ${formData.get("note") || ""}`,
    "",
    `${state.language === "de" ? "Adresse" : "Address"}: ${BUSINESS.address}`
  ].join("\n");
}

function sendWhatsApp(message) {
  const url = `https://wa.me/${BUSINESS.whatsappPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  showToast(`${getCopy().toast.opening} ${getCopy().toast.check}`);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function initScrollAnimations() {
  if (prefersReducedMotion) return;

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
          entry.target.removeAttribute("data-reveal-observed");
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
    );
  }

  document.querySelectorAll(".reveal:not(.is-visible)").forEach((node) => {
    if (node.hasAttribute("data-reveal-observed")) return;
    node.setAttribute("data-reveal-observed", "true");
    revealObserver.observe(node);
  });
}

function initAnimationRegions() {
  if (prefersReducedMotion) return;

  if (!animationRegionObserver) {
    animationRegionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("is-in-viewport", entry.isIntersecting);
        });
      },
      {
        threshold: 0.08,
        rootMargin: "18% 0px 18% 0px"
      }
    );
  }

  document.querySelectorAll("[data-animated-region]").forEach((node) => {
    if (node.hasAttribute("data-animation-observed")) return;
    node.setAttribute("data-animation-observed", "true");
    animationRegionObserver.observe(node);
  });
}

function initLanguageSwitcher() {
  elements.languageButtons.forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-language-switch") === state.language);
  });
}

function handleSearch() {
  state.searchQuery = elements.menuSearch.value;
  renderMenu();
}

function handleGlobalClick(event) {
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.activeFilter = filterButton.getAttribute("data-filter");
    renderFilters();
    renderMenu();
    return;
  }

  const addButton = event.target.closest("[data-add-item]");
  if (addButton && state.menu) {
    const item = state.menu.items.find((entry) => entry.id === addButton.getAttribute("data-add-item"));
    if (!item) return;
    if (item.variants.length > 0) {
      openOptions(item);
    } else {
      addToCart(item);
    }
    return;
  }

  const optionButton = event.target.closest("[data-option-index]");
  if (optionButton && state.optionItem) {
    const variant = state.optionItem.variants[Number(optionButton.getAttribute("data-option-index"))];
    addToCart(state.optionItem, variant);
    closeOptions();
    return;
  }

  if (event.target.closest("[data-open-cart]")) {
    openCart();
    return;
  }

  if (
    event.target.closest("[data-close-cart]") ||
    event.target.closest("[data-drawer-backdrop]")
  ) {
    closeCart();
    return;
  }

  if (
    event.target.closest("[data-close-options]") ||
    event.target.closest("[data-option-backdrop]")
  ) {
    closeOptions();
    return;
  }

  if (event.target.closest("[data-open-book-modal]")) {
    openBookModal();
    return;
  }

  if (
    event.target.closest("[data-close-book-modal]") ||
    event.target.closest("[data-book-backdrop]")
  ) {
    closeBookModal();
    return;
  }

  const plusButton = event.target.closest("[data-qty-plus]");
  if (plusButton) {
    const item = state.cart.find((entry) => entry.id === plusButton.getAttribute("data-qty-plus"));
    if (item) {
      item.quantity += 1;
      updateCart();
    }
    return;
  }

  const minusButton = event.target.closest("[data-qty-minus]");
  if (minusButton) {
    const item = state.cart.find((entry) => entry.id === minusButton.getAttribute("data-qty-minus"));
    if (item) {
      item.quantity -= 1;
      if (item.quantity <= 0) {
        state.cart = state.cart.filter((entry) => entry.id !== item.id);
      }
      updateCart();
    }
    return;
  }

  const removeButton = event.target.closest("[data-remove-item]");
  if (removeButton) {
    state.cart = state.cart.filter((entry) => entry.id !== removeButton.getAttribute("data-remove-item"));
    updateCart();
    return;
  }

  if (event.target.closest("[data-book-prev]")) {
    const activeFlip = state.bookModalOpen ? bookFlips.modal : bookFlips.preview;
    if (activeFlip?.flipPrev) {
      activeFlip.flipPrev();
    } else {
      state.bookPage = Math.max(0, state.bookPage - 2);
      renderMenuBook();
    }
    return;
  }

  if (event.target.closest("[data-book-next]")) {
    const activeFlip = state.bookModalOpen ? bookFlips.modal : bookFlips.preview;
    if (activeFlip?.flipNext) {
      activeFlip.flipNext();
    } else {
      state.bookPage = Math.min(BOOK_PAGE_COUNT - 2, state.bookPage + 2);
      renderMenuBook();
    }
  }
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    if (state.bookModalOpen) closeBookModal();
    if (state.optionItem) closeOptions();
    if (elements.cartDrawer.classList.contains("is-open")) closeCart();
    return;
  }

  if (!state.bookModalOpen) return;

  if (event.key === "ArrowRight") {
    if (bookFlips.modal?.flipNext) {
      bookFlips.modal.flipNext();
    } else {
      state.bookPage = Math.min(BOOK_PAGE_COUNT - 2, state.bookPage + 2);
      renderMenuBook();
    }
  }

  if (event.key === "ArrowLeft") {
    if (bookFlips.modal?.flipPrev) {
      bookFlips.modal.flipPrev();
    } else {
      state.bookPage = Math.max(0, state.bookPage - 2);
      renderMenuBook();
    }
  }
}

function handleCartInput(event) {
  const noteField = event.target.closest("[data-note-item]");
  if (!noteField) return;
  const item = state.cart.find((entry) => entry.id === noteField.getAttribute("data-note-item"));
  if (item) item.note = noteField.value;
}

function bindEvents() {
  window.addEventListener("scroll", () => {
    elements.header.classList.toggle("is-scrolled", window.scrollY > 24);
  });

  elements.languageButtons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.getAttribute("data-language-switch")));
  });

  elements.menuSearch.addEventListener("input", handleSearch);
  document.addEventListener("click", handleGlobalClick);
  document.addEventListener("input", handleCartInput);
  document.addEventListener("keydown", handleGlobalKeydown);

  elements.orderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendWhatsApp(buildWhatsAppOrderMessage());
  });

  elements.reservationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendWhatsApp(buildWhatsAppReservationMessage());
  });
}

export function initApp() {
  applyTranslations();
  initLanguageSwitcher();
  bindEvents();
  updateCart();
  renderMenuBook();
  initScrollAnimations();
  initAnimationRegions();
  animatePageIntro();
  loadMenu(state.language);
}

initApp();
