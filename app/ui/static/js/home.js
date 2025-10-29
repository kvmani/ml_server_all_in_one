const searchInput = document.querySelector("[data-tool-search]");
const cards = Array.from(document.querySelectorAll("[data-tool-card]"));
const categoryButtons = Array.from(document.querySelectorAll("[data-tool-category]"));
const cardGrids = Array.from(document.querySelectorAll("[data-tool-section]"));
const preview = document.querySelector("[data-tool-preview]");
const previewTitle = document.querySelector("[data-tool-preview-title]");
const previewCategory = document.querySelector("[data-tool-preview-category]");
const previewSummary = document.querySelector("[data-tool-preview-summary]");
const previewLaunch = document.querySelector("[data-tool-preview-launch]");
const previewDocs = document.querySelector("[data-tool-preview-docs]");
const emptyState = document.querySelector("[data-tool-empty]");
const previewTriggers = Array.from(document.querySelectorAll("[data-tool-preview-trigger]"));

let activeCategory = "all";

function setActiveCategory(category) {
  activeCategory = category.toLowerCase();
  categoryButtons.forEach((button) => {
    const isActive = button.dataset.toolCategory?.toLowerCase() === activeCategory;
    if (button.dataset.toolCategory === "all" && activeCategory === "all") {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
      return;
    }
    if (button.dataset.toolCategory === "all") {
      button.classList.remove("is-active");
      button.setAttribute("aria-pressed", "false");
      return;
    }
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  const allButton = categoryButtons.find((btn) => btn.dataset.toolCategory === "all");
  if (allButton && activeCategory !== "all") {
    allButton.classList.remove("is-active");
    allButton.setAttribute("aria-pressed", "false");
  } else if (allButton && activeCategory === "all") {
    allButton.classList.add("is-active");
    allButton.setAttribute("aria-pressed", "true");
  }
  updateVisibility();
}

function cardMatches(card, query) {
  const haystack = `${card.dataset.toolTitle || ""} ${card.dataset.toolSummary || ""} ${card.dataset.toolTags || ""}`.toLowerCase();
  const category = (card.dataset.toolCategory || "").toLowerCase();
  const matchesCategory = activeCategory === "all" || category === activeCategory;
  const matchesQuery = !query || haystack.includes(query);
  return matchesCategory && matchesQuery;
}

function updateVisibility() {
  const query = searchInput?.value?.trim().toLowerCase() || "";
  let visibleCount = 0;
  cards.forEach((card) => {
    const visible = cardMatches(card, query);
    card.hidden = !visible;
    card.classList.toggle("is-dimmed", !visible);
    if (visible) {
      visibleCount += 1;
    }
  });

  cardGrids.forEach((grid) => {
    const gridCards = Array.from(grid.querySelectorAll("[data-tool-card]"));
    const anyVisible = gridCards.some((card) => !card.hidden);
    const section = grid.closest("section.surface-block");
    if (section && !section.classList.contains("discovery-panel")) {
      section.hidden = !anyVisible;
    }
  });

  if (emptyState) {
    emptyState.hidden = visibleCount > 0;
  }

  if (visibleCount === 0 && preview) {
    preview.hidden = true;
  } else if (visibleCount > 0) {
    const firstVisible = cards.find((card) => !card.hidden);
    if (firstVisible) {
      showPreview(firstVisible);
    }
  }
}

function showPreview(card) {
  if (!preview || !card || card.hidden) {
    return;
  }
  const title = card.dataset.toolTitle || "";
  const category = card.dataset.toolCategory || "";
  const summary = card.dataset.toolSummary || "";
  const launchHref = card.dataset.toolLaunch || "#";
  const docsHref = card.dataset.toolDocs;

  if (previewTitle) {
    previewTitle.textContent = title;
  }
  if (previewCategory) {
    previewCategory.textContent = category;
  }
  if (previewSummary) {
    previewSummary.textContent = summary;
  }
  if (previewLaunch) {
    previewLaunch.href = launchHref;
  }
  if (previewDocs) {
    if (docsHref) {
      previewDocs.href = docsHref;
      previewDocs.removeAttribute("aria-disabled");
      previewDocs.classList.remove("is-disabled");
      previewDocs.hidden = false;
    } else {
      previewDocs.href = "#";
      previewDocs.setAttribute("aria-disabled", "true");
      previewDocs.classList.add("is-disabled");
      previewDocs.hidden = true;
    }
  }
  preview.hidden = false;
}

if (categoryButtons.length) {
  categoryButtons.forEach((button) => {
    button.type = "button";
    button.addEventListener("click", () => {
      const category = button.dataset.toolCategory || "all";
      setActiveCategory(category);
    });
  });
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    updateVisibility();
  });
}

cards.forEach((card) => {
  card.addEventListener("mouseenter", () => showPreview(card));
  card.addEventListener("focusin", () => showPreview(card));
});

previewTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    const card = event.currentTarget.closest("[data-tool-card]");
    if (!card) {
      return;
    }
    showPreview(card);
    preview?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

if (!categoryButtons.some((btn) => btn.dataset.toolCategory === "all")) {
  updateVisibility();
} else {
  setActiveCategory("all");
}

updateVisibility();

window.addEventListener("keydown", (event) => {
  if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
      return;
    }
    event.preventDefault();
    searchInput?.focus();
  }
});
