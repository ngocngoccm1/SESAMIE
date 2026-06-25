import { UI_COPY } from "./config.js";

const FILTER_ORDER = ["all", "drinks", "tapas", "vegan", "chef", "mains", "sushi", "dessert"];
const HIDDEN_SECTION_NAMES = new Set(["hauptspeisen 2", "hauptspeisen / main course 2"]);

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function parsePrice(value) {
  if (typeof value === "number") return value;
  if (!value) return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTags(tags = []) {
  const tagMap = {
    vegan: "vegan",
    mildly_spicy: "spicy",
    spicy: "spicy",
    gluten_free: "glutenFree",
    glutenFree: "glutenFree",
    recommended: "recommended"
  };

  return [...new Set(tags.map((tag) => tagMap[tag]).filter(Boolean))];
}

function inferFilterKeys(sectionName, tags) {
  const haystack = sectionName.toLowerCase();
  const result = new Set(["all"]);

  if (
    [
      "hausgemachte limonade",
      "lassi-shakes",
      "cafe",
      "mocktails",
      "wasser",
      "nektar & spritzer",
      "tee",
      "softdrink",
      "cocktails",
      "long drink / aperitif drink",
      "bier",
      "beer",
      "spirituosen",
      "spirits",
      "wein",
      "wine"
    ].includes(haystack)
  ) {
    result.add("drinks");
  }

  if (/tapas/.test(haystack)) result.add("tapas");
  if (/vegan/.test(haystack) || tags.includes("vegan")) result.add("vegan");
  if (/chef|empfehlung/.test(haystack) || tags.includes("recommended")) result.add("chef");
  if (/hauptspeisen|main course|beilagen|sides|kinder|kid/.test(haystack)) result.add("mains");
  if (/sushi|sashimi|roll|nigiri|maki/.test(haystack)) result.add("sushi");
  if (/dessert/.test(haystack)) result.add("dessert");

  return [...result];
}

function inferOnlineAvailability(sectionName) {
  const haystack = sectionName.toLowerCase().trim();
  return ![
    "hausgemachte limonade",
    "lassi-shakes",
    "cafe",
    "mocktails",
    "wasser",
    "nektar & spritzer",
    "tee",
    "softdrink",
    "cocktails",
    "long drink / aperitif drink",
    "bier",
    "beer",
    "spirituosen",
    "spirits",
    "wein",
    "wine"
  ].includes(haystack);
}

function createVariant(sectionId, itemName, variant, fallbackPrice, fallbackAllergens, fallbackAdditives, fallbackTags) {
  const label = [variant.name, variant.size].filter(Boolean).join(" - ");
  const price = parsePrice(variant.price_eur ?? variant.price_display) ?? fallbackPrice ?? 0;

  return {
    id: slugify(`${sectionId}-${itemName}-${label || price}`),
    name: variant.name || "",
    size: variant.size || "",
    price,
    priceDisplay: variant.price_display || String(price).replace(".", ","),
    allergens: variant.allergens || fallbackAllergens,
    additives: variant.additives || fallbackAdditives,
    tags: variant.tags ? normalizeTags(variant.tags) : fallbackTags
  };
}

export function normalizeMenu(rawData, language) {
  const sections = rawData.sections
    .filter((section) => !HIDDEN_SECTION_NAMES.has(String(section.name || "").trim().toLowerCase()))
    .map((section) => {
    const sectionId = slugify(`${language}-${section.name}`);
    const items = section.items.map((item) => {
      const price = parsePrice(item.price_eur ?? item.price_display);
      const tags = normalizeTags(item.tags || []);
      const allergens = item.allergens || [];
      const additives = item.additives || [];
      const variants = (item.variants || []).map((variant) =>
        createVariant(sectionId, item.name, variant, price, allergens, additives, tags)
      );
      const filterKeys = inferFilterKeys(section.name, tags);
      const availableOnline = inferOnlineAvailability(section.name);

      return {
        id: slugify(`${sectionId}-${item.name}`),
        language,
        sectionId,
        sectionName: section.name,
        name: item.name,
        description: item.description || "",
        ingredients: item.ingredients || [],
        price,
        priceDisplay: item.price_display || "",
        size: item.size || "",
        allergens,
        additives,
        tags,
        variants,
        filterKeys,
        availableOnline,
        searchText: [
          section.name,
          item.name,
          item.description,
          (item.ingredients || []).join(" "),
          variants.map((variant) => [variant.name, variant.size].filter(Boolean).join(" ")).join(" ")
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
      };
    });

    return {
      id: sectionId,
      name: section.name,
      items,
      availableOnline: items.some((item) => item.availableOnline),
      filterKeys: [...new Set(items.flatMap((item) => item.filterKeys))]
    };
  });

  const items = sections.flatMap((section) => section.items);
  const filterLabels = UI_COPY[language].filters;
  const filters = FILTER_ORDER.map((key) => ({
    key,
    label: filterLabels[key],
    count: key === "all" ? items.length : items.filter((item) => item.filterKeys.includes(key)).length
  })).filter((filter) => filter.count > 0);

  return {
    language,
    legend: rawData.legend,
    sections,
    items,
    filters
  };
}
