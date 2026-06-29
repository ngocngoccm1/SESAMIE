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
let cartTriggerElement = null;
let orderUiQuantityLast = 0;
let orderUiBumpTimer = null;
const bookFlips = {
  preview: null,
  modal: null
};

const elements = {
  header: document.querySelector("[data-header]"),
  tabLinks: document.querySelectorAll("[data-tab]"),
  tabPanels: document.querySelectorAll(".tab-content"),
  businessFields: document.querySelectorAll("[data-business]"),
  hoursLists: document.querySelectorAll("[data-business-hours]"),
  mapFrame: document.querySelector("[data-map-frame]"),
  mapLinks: document.querySelectorAll('[data-business-link="map"]'),
  phoneLinks: document.querySelectorAll('[data-business-link="phone"]'),
  emailLinks: document.querySelectorAll('[data-business-link="email"]'),
  languageButtons: document.querySelectorAll("[data-language-switch]"),
  featuredMenu: document.querySelector("[data-featured-menu]"),
  menuNav: document.querySelector("[data-menu-nav]"),
  filterList: document.querySelector("[data-filter-list]"),
  menuSearch: document.querySelector("[data-menu-search]"),
  menuStatus: document.querySelector("[data-menu-status]"),
  menuSections: document.querySelector("[data-menu-sections]"),
  drawerBackdrop: document.querySelector("[data-drawer-backdrop]"),
  cartDrawer: document.querySelector("[data-cart-drawer]"),
  cartItems: document.querySelector("[data-cart-items]"),
  cartTotals: document.querySelectorAll("[data-cart-total]"),
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
  bookModal: document.querySelector("[data-book-modal]"),
  orderUiBadge: document.querySelector("[data-order-ui-badge]"),
  orderUiTotal: document.querySelector("[data-order-ui-total]")
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileBookQuery = window.matchMedia("(max-width: 768px)");
const isOrderPage =
  document.body.classList.contains("order-page") ||
  window.location.pathname.toLowerCase().includes("order.html");
const placeholderLogo = "./assets/images/logo_sesamie_transparent.png";
const featuredHomeImages = [
  "./assets/images/site/featured-1.jpg",
  "./assets/images/site/featured-2.jpg",
  "./assets/images/site/featured-3.jpg"
];
const CASH_DISCOUNT_RATE = 0.1;

function loadAnime() {
  if (prefersReducedMotion) return Promise.resolve(null);
  if (!animeReady) {
    animeReady = import("https://cdn.jsdelivr.net/npm/animejs/+esm")
      .then((module) => module?.default ?? module?.anime ?? null)
      .catch(() => null);
  }
  return animeReady;
}

function getMenuTabNameFromHash() {
  const hash = window.location.hash.replace("#", "").trim().toLowerCase();
  if (hash.startsWith("menu-section-")) return "menu";
  const allowedTabs = new Set(["home", "menu", "reservation", "contact"]);
  return allowedTabs.has(hash) ? hash : "menu";
}

function setActiveTab(tabName, { updateHash = true, scrollToTop = true } = {}) {
  const safeTab = ["home", "menu", "reservation", "contact"].includes(tabName) ? tabName : "menu";

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === safeTab);
  });

  elements.tabLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("data-tab") === safeTab);
  });

  if (updateHash) {
    const newHash = `#${safeTab}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
  }

  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }
}

function initTabs() {
  setActiveTab(getMenuTabNameFromHash(), { updateHash: false, scrollToTop: false });

  window.addEventListener("hashchange", () => {
    setActiveTab(getMenuTabNameFromHash(), { updateHash: false, scrollToTop: false });
  });
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
  if (prefersReducedMotion || !scope || hasAnimatedMenuCards) return;
  const cards = Array.from(scope.querySelectorAll(".menu-card")).slice(0, 6);
  if (!cards.length) return;

  const anime = await loadAnime();
  if (!anime) return;

  anime.remove(cards);
  anime.set(cards, { opacity: 0 });

  anime({
    targets: cards,
    opacity: [0, 1],
    delay: anime.stagger(30),
    duration: 240,
    easing: "linear"
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

function openBookingUrl(url) {
  if (!url) return;
  window.location.href = url;
}

function getCartSubtotal() {
  return state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

function getSelectedPaymentMethod() {
  if (!elements.orderForm) return "cash";
  const selected = elements.orderForm.querySelector('input[name="paymentMethod"]:checked');
  return selected?.value === "card" ? "card" : "cash";
}

function getCartDiscountAmount(subtotal = getCartSubtotal()) {
  return getSelectedPaymentMethod() === "cash" ? subtotal * CASH_DISCOUNT_RATE : 0;
}

function getCartTotalAmount(subtotal = getCartSubtotal()) {
  return Math.max(0, subtotal - getCartDiscountAmount(subtotal));
}

function getCopy() {
  return UI_COPY[state.language];
}

function setLanguage(language) {
  state.language = language;
  state.activeFilter = "all";
  state.searchQuery = "";
  state.bookPage = 0;
  if (elements.menuSearch) {
    elements.menuSearch.value = "";
  }
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

  if (elements.menuSearch) {
    elements.menuSearch.placeholder = copy.menu.search;
  }
  elements.businessFields.forEach((node) => {
    const key = node.getAttribute("data-business");
    if (key && BUSINESS[key]) node.textContent = BUSINESS[key];
  });

  const hoursMarkup = BUSINESS.hours
    .map(
      (item) => `
        <div class="hours-row">
          <span>${item.days}</span>
          <span>${item.time}</span>
        </div>
      `
    )
    .join("");

  elements.hoursLists.forEach((node) => {
    node.innerHTML = hoursMarkup;
  });

  elements.mapLinks.forEach((node) => {
    node.href = BUSINESS.mapUrl;
  });
  elements.phoneLinks.forEach((node) => {
    node.href = BUSINESS.phoneHref;
  });
  elements.emailLinks.forEach((node) => {
    node.href = `mailto:${BUSINESS.email}`;
  });
  if (elements.mapFrame) {
    elements.mapFrame.src = BUSINESS.mapEmbedUrl;
  }
}

async function loadMenu(language) {
  const copy = getCopy();
  if (elements.menuStatus) {
    elements.menuStatus.textContent = copy.menu.loading;
  }
  if (elements.menuSections) {
    elements.menuSections.innerHTML = "";
  }

  try {
    if (!state.menuCache[language]) {
      const response = await fetch(`./assets/data/menu.${language}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rawData = await response.json();
      state.menuCache[language] = normalizeMenu(rawData, language);
    }

    state.menu = state.menuCache[language];
    renderFeaturedMenu();
    renderFilters();
    renderMenu();
  } catch (error) {
    console.error(error);
    state.menu = null;
    if (elements.filterList) elements.filterList.innerHTML = "";
    if (elements.menuSections) elements.menuSections.innerHTML = "";
    if (elements.menuStatus) elements.menuStatus.textContent = copy.menu.empty;
  }
}

function renderFilters() {
  if (!state.menu || !elements.filterList) return;
  const sourceItems = isOrderPage ? state.menu.items.filter((item) => item.availableOnline) : state.menu.items;
  const filters = state.menu.filters
    .map((filter) => ({
      ...filter,
      count:
        filter.key === "all"
          ? sourceItems.length
          : sourceItems.filter((item) => item.filterKeys.includes(filter.key)).length
    }))
    .filter((filter) => filter.count > 0);

  if (!filters.some((filter) => filter.key === state.activeFilter)) {
    state.activeFilter = "all";
  }

  const filtersMarkup = filters
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

function renderMenuNavigation(sections) {
  if (!elements.menuNav) return;

  elements.menuNav.innerHTML = sections
    .map(
      (section) => `
        <a class="menu-tab-anchor" href="#menu-section-${section.id}">
          ${section.name}
        </a>
      `
    )
    .join("");
}

function getFeaturedPreviewPath(index) {
  if (isOrderPage) return placeholderLogo;
  return featuredHomeImages[index % featuredHomeImages.length];
}

function renderFeaturedMenu() {
  if (!elements.featuredMenu || !state.menu) return;

  const recommendedItems = state.menu.items.filter((item) => item.tags.includes("recommended"));
  const sourceItems = (recommendedItems.length >= 3 ? recommendedItems : state.menu.items).slice(0, 3);

  elements.featuredMenu.innerHTML = sourceItems
    .map((item, index) => {
      const detail = item.description || item.ingredients.slice(0, 3).join(" | ");
      const previewImage = getFeaturedPreviewPath(index);

      return `
        <article class="featured-menu-card reveal-on-scroll">
          <div class="featured-menu-image">
            <img src="${previewImage}" alt="${item.name}" loading="lazy" />
          </div>
          <div class="featured-menu-copy">
            <div class="featured-menu-heading">
              <h3>${item.name}</h3>
              <span>${formatPrice(item.variants[0]?.price ?? item.price ?? 0)}</span>
            </div>
            <p>${detail}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function getVisibleSections() {
  if (!state.menu) return [];
  const query = state.searchQuery.trim().toLowerCase();

  return state.menu.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const matchesAvailability = !isOrderPage || item.availableOnline;
        const matchesFilter = state.activeFilter === "all" || item.filterKeys.includes(state.activeFilter);
        const matchesQuery = !query || item.searchText.includes(query);
        return matchesAvailability && matchesFilter && matchesQuery;
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

  if (elements.menuStatus) {
    elements.menuStatus.innerHTML = `<span class="status-pill">${visibleCount}</span> ${copy.menu.results}`;
  }

  if (elements.menuSections) {
    const sectionRevealClass = isOrderPage ? "" : "reveal";
    elements.menuSections.innerHTML = visibleSections
      .map(
        (section) => `
          <section class="${sectionRevealClass} menu-render-section" id="menu-section-${section.id}">
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
  }

  renderMenuNavigation(visibleSections);
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

function usePageFlipBook() {
  return hasPageFlip() && !mobileBookQuery.matches;
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

function getScrollBookMarkup() {
  return Array.from({ length: BOOK_PAGE_COUNT }, (_, index) => {
    const pageNumber = index + 1;
    return `
      <figure class="menu-book-page menu-book-page--scroll" data-book-page="${pageNumber}">
        <img src="${getBookImagePath(pageNumber)}" alt="SESAMIE menu page ${pageNumber}" loading="lazy" />
        <figcaption>Page ${pageNumber}</figcaption>
      </figure>
    `;
  }).join("");
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

function updateOrderUi() {
  const quantityTotal = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = getCartSubtotal();
  const totalAmount = getCartTotalAmount(subtotal);
  const checkoutButtons = document.querySelectorAll(".drawer-submit");

  if (elements.orderUiTotal) {
    elements.orderUiTotal.textContent = formatPrice(totalAmount);
  }

  if (elements.orderUiBadge) {
    elements.orderUiBadge.textContent = String(quantityTotal);
    elements.orderUiBadge.hidden = quantityTotal === 0;
    if (quantityTotal !== orderUiQuantityLast) {
      elements.orderUiBadge.classList.remove("is-bumped");
      window.clearTimeout(orderUiBumpTimer);
      elements.orderUiBadge.getBoundingClientRect();
      elements.orderUiBadge.classList.add("is-bumped");
      orderUiBumpTimer = window.setTimeout(() => {
        elements.orderUiBadge.classList.remove("is-bumped");
      }, 240);
      orderUiQuantityLast = quantityTotal;
    }
  }

  checkoutButtons.forEach((button) => {
    button.disabled = quantityTotal === 0;
    button.setAttribute("aria-disabled", quantityTotal === 0 ? "true" : "false");
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
  if (!target || !usePageFlipBook()) return null;

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
  if (!usePageFlipBook()) return;

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
  if (!usePageFlipBook() || !elements.menuBookModal) return;
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
  const markup = usePageFlipBook() ? getBookPagesMarkup() : getScrollBookMarkup();

  if (elements.menuBook) {
    elements.menuBook.innerHTML = markup;
    elements.menuBook.classList.toggle("is-pageflip", usePageFlipBook());
  }
  if (elements.menuBookModal) {
    elements.menuBookModal.innerHTML = markup;
    elements.menuBookModal.classList.toggle("is-pageflip", usePageFlipBook());
  }

  if (usePageFlipBook()) {
    initBookFlipInstances();
  } else {
    destroyBookFlips();
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
  if (usePageFlipBook()) {
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

  if (isOrderPage) {
    const orderPreview = getFeaturedPreviewPath(item.name.length);
    return `
      <article class="menu-card order-product-card" data-menu-item="${item.id}">
        <div class="order-product-media">
          <img src="${orderPreview}" alt="${item.name}" loading="lazy" />
        </div>
        <div class="order-product-copy">
          <h3>${item.name}</h3>
          ${ingredientText ? `<p>${ingredientText}</p>` : ""}
          ${detailText}
          ${tagsMarkup ? `<div class="tag-row">${tagsMarkup}</div>` : ""}
          <div class="order-product-footer">
            <strong class="price-display">${priceText}</strong>
          </div>
          ${allergenText}
        </div>
      </article>
    `;
  }

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
  const variantId = variant?.id || "";
  const existingEntry = state.cart.find((entry) => entry.itemId === item.id && entry.variantId === variantId);

  if (existingEntry) {
    existingEntry.quantity += 1;
  } else {
    state.cart.push({
      id: `${item.id}-${variantId || "default"}`,
      itemId: item.id,
      variantId,
      name: item.name,
      sectionName: item.sectionName,
      variantLabel: [variant?.name, variant?.size].filter(Boolean).join(" - "),
      quantity: 1,
      note: "",
      unitPrice: variant?.price ?? item.price ?? 0
    });
  }

  updateCart();
  if (isOrderPage) {
    showToast(getCopy().menu.added);
    return;
  }
  openCart();
}

function updateCart() {
  if (!elements.cartTotals || elements.cartTotals.length === 0 || !elements.cartItems) return;
  const copy = getCopy();
  const subtotal = getCartSubtotal();
  const discount = getCartDiscountAmount(subtotal);
  const total = getCartTotalAmount(subtotal);

  elements.cartTotals.forEach((node) => {
    node.textContent = formatPrice(total);
  });
  document.querySelectorAll("[data-cart-subtotal]").forEach((node) => {
    node.textContent = formatPrice(subtotal);
  });
  document.querySelectorAll("[data-cart-discount]").forEach((node) => {
    node.textContent = `-${formatPrice(discount)}`;
  });
  document.querySelectorAll("[data-cart-discount-row]").forEach((node) => {
    node.hidden = discount <= 0;
  });
  updateOrderUi();

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

          <label class="cart-note-field">
            <textarea
              rows="2"
              data-note-item="${item.id}"
              aria-label="${copy.order.note}"
              placeholder=""
            >${item.note}</textarea>
          </label>
        </article>
      `;
    })
    .join("");
}

function openCart() {
  if (!elements.drawerBackdrop || !elements.cartDrawer) return;
  cartTriggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.drawerBackdrop.hidden = false;
  elements.cartDrawer.classList.add("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-cart-open");
  document.querySelectorAll("[data-open-cart]").forEach((button) => {
    button.setAttribute("aria-expanded", "true");
  });
  animatePanelOpen(elements.cartDrawer);
  window.requestAnimationFrame(() => {
    const firstFocusable = elements.cartDrawer.querySelector("button, textarea, input, select, [href], [tabindex]:not([tabindex='-1'])");
    if (firstFocusable instanceof HTMLElement) firstFocusable.focus();
  });
}

function closeCart() {
  if (!elements.drawerBackdrop || !elements.cartDrawer) return;
  elements.drawerBackdrop.hidden = true;
  elements.cartDrawer.classList.remove("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-cart-open");
  document.querySelectorAll("[data-open-cart]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
  if (cartTriggerElement instanceof HTMLElement) {
    cartTriggerElement.focus();
  }
}

function openOptions(item) {
  if (!elements.optionTitle || !elements.optionList || !elements.optionBackdrop || !elements.optionModal) return;
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
  if (!elements.optionBackdrop || !elements.optionModal) return;
  state.optionItem = null;
  elements.optionBackdrop.hidden = true;
  elements.optionModal.classList.remove("is-open");
  elements.optionModal.setAttribute("aria-hidden", "true");
}

function buildWhatsAppOrderMessage() {
  if (!elements.orderForm) return "";
  const copy = getCopy();
  const formData = new FormData(elements.orderForm);
  const subtotal = getCartSubtotal();
  const discount = getCartDiscountAmount(subtotal);
  const total = getCartTotalAmount(subtotal);
  const paymentMethod = formData.get("paymentMethod") || "cash";
  const paymentLabelMap = {
    cash: copy.order.paymentCash,
    card: copy.order.paymentCard
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
    `${copy.order.paymentLabel}: ${paymentLabelMap[paymentMethod] || paymentMethod}`,
    `${copy.order.desiredTime}: ${formData.get("desiredTime") || ""}`,
    "",
    `${state.language === "de" ? "Bestellung" : "Order"}:`,
    "",
    itemsText,
    "",
    `${copy.order.subtotal}: ${formatPrice(subtotal)}`,
    discount > 0 ? `${copy.order.discount}: -${formatPrice(discount)}` : "",
    `${copy.order.total}: ${formatPrice(total)}`,
    `${state.language === "de" ? "Adresse" : "Address"}: ${BUSINESS.address}`,
    formData.get("note") ? `${copy.order.message}: ${formData.get("note")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildWhatsAppReservationMessage() {
  if (!elements.reservationForm) return "";
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
  if (!elements.toast) return;
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

  document.querySelectorAll(".reveal:not(.is-visible), .reveal-on-scroll:not(.is-visible)").forEach((node) => {
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
  if (!elements.menuSearch) return;
  state.searchQuery = elements.menuSearch.value;
  renderMenu();
}

function handleGlobalClick(event) {
  const tabTrigger = event.target.closest("[data-tab], [data-tab-target]");
  if (tabTrigger) {
    const tabName = tabTrigger.getAttribute("data-tab") || tabTrigger.getAttribute("data-tab-target");
    if (tabName) {
      event.preventDefault();
      setActiveTab(tabName);
      return;
    }
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.activeFilter = filterButton.getAttribute("data-filter");
    renderFilters();
    renderMenu();
    return;
  }

  const addButton = event.target.closest("[data-add-item]");
  if (addButton && state.menu) {
    openBookingUrl(BUSINESS.orderUrl);
    return;
  }

  if (event.target.closest("[data-open-cart]")) {
    openBookingUrl(BUSINESS.orderUrl);
    return;
  }

  if (event.target.closest("[data-external-order]")) {
    openBookingUrl(BUSINESS.orderUrl);
    return;
  }

  if (event.target.closest("[data-external-reservation]")) {
    openBookingUrl(BUSINESS.reservationUrl);
    return;
  }

  const optionButton = event.target.closest("[data-option-index]");
  if (optionButton && state.optionItem) {
    openBookingUrl(BUSINESS.orderUrl);
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

  if (elements.cartDrawer?.classList.contains("is-open") && event.key === "Tab") {
    const focusables = elements.cartDrawer.querySelectorAll(
      "button, textarea, input, select, [href], [tabindex]:not([tabindex='-1'])"
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
      return;
    }
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
  if (event.target.matches('input[name="paymentMethod"]')) {
    updateCart();
    return;
  }
  const noteField = event.target.closest("[data-note-item]");
  if (!noteField) return;
  const item = state.cart.find((entry) => entry.id === noteField.getAttribute("data-note-item"));
  if (item) item.note = noteField.value;
}

function bindEvents() {
  window.addEventListener("scroll", () => {
    if (elements.header) {
      elements.header.classList.toggle("is-scrolled", window.scrollY > 24);
    }
  });

  elements.languageButtons.forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.getAttribute("data-language-switch")));
  });

  if (elements.menuSearch) {
    elements.menuSearch.addEventListener("input", handleSearch);
  }
  document.addEventListener("click", handleGlobalClick);
  document.addEventListener("input", handleCartInput);
  document.addEventListener("keydown", handleGlobalKeydown);

  if (elements.orderForm) {
    elements.orderForm.addEventListener("submit", (event) => {
      event.preventDefault();
      openBookingUrl(BUSINESS.orderUrl);
    });
  }

  if (elements.reservationForm) {
    elements.reservationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      openBookingUrl(BUSINESS.reservationUrl);
    });
  }

  if (mobileBookQuery.addEventListener) {
    mobileBookQuery.addEventListener("change", renderMenuBook);
  } else if (mobileBookQuery.addListener) {
    mobileBookQuery.addListener(renderMenuBook);
  }
}

export function initApp() {
  applyTranslations();
  initLanguageSwitcher();
  initTabs();
  bindEvents();
  updateCart();
  updateOrderUi();
  renderMenuBook();
  initScrollAnimations();
  initAnimationRegions();
  animatePageIntro();
  loadMenu(state.language);
}

initApp();
