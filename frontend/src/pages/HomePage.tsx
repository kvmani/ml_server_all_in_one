import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PluginManifest } from "../types";
import { useAppContext } from "../contexts/AppContext";

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "Microstructural Analysis": "Advanced microscopy tooling with parameterised pipelines and live previews.",
  "Document Utilities": "Fast, offline-safe document manipulation with drag-and-drop simplicity.",
  "Machine Learning": "In-browser model training pipelines optimised for tabular datasets.",
  "General Utilities": "Everyday laboratory helpers with instant validation and clarity.",
};

function normaliseCategory(category?: string | null) {
  return category?.trim() || "Tools";
}

export default function HomePage() {
  const { manifests } = useAppContext();
  const plugins = useMemo(
    () =>
      manifests.map((plugin) => ({
        ...plugin,
        category: normaliseCategory(plugin.category),
        tags: plugin.tags || [],
      })),
    [manifests],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    plugins.forEach((plugin) => set.add(plugin.category));
    return ["All tools", ...Array.from(set)];
  }, [plugins]);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All tools");
  const [preview, setPreview] = useState<PluginManifest | null>(plugins[0] ?? null);

  useEffect(() => {
    if (!preview && plugins.length) {
      setPreview(plugins[0]);
    }
  }, [plugins, preview]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const active = document.activeElement as HTMLElement | null;
        if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) {
          return;
        }
        event.preventDefault();
        const element = document.querySelector<HTMLInputElement>("[data-tool-search]");
        element?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const category = activeCategory.toLowerCase();
    const matches = plugins.filter((plugin) => {
      const haystack = `${plugin.title} ${plugin.summary} ${(plugin.tags || []).join(" ")}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesCategory =
        category === "all tools" || plugin.category.toLowerCase() === category;
      return matchesQuery && matchesCategory;
    });
    if (matches.length && !preview) {
      setPreview(matches[0]);
    }
    if (!matches.length && preview) {
      setPreview(null);
    }
    return matches;
  }, [activeCategory, plugins, preview, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PluginManifest[]>();
    filtered.forEach((plugin) => {
      const key = plugin.category;
      const bucket = groups.get(key) ?? [];
      bucket.push(plugin);
      groups.set(key, bucket);
    });
    return groups;
  }, [filtered]);

  const iconHues = [210, 330, 155, 32, 265, 15, 190];

  return (
    <section className="home-page">
      <section className="shell hero" aria-labelledby="home-hero-title">
        <p className="hero__eyebrow">Unified toolkit</p>
        <h1 id="home-hero-title" className="hero__title">
          Consistent offline ML experiences
        </h1>
        <p className="hero__subtitle">
          Launch segmentation, document, and analytics workflows from one privacy-first hub. Every tool runs in-memory with a cohesive interface designed for lab technicians, researchers, and engineers working without internet access.
        </p>
        <div className="tag-list" role="list">
          <span className="badge" role="listitem">
            No cloud uploads
          </span>
          <span className="badge" role="listitem">
            Cross-browser ready
          </span>
          <span className="badge" role="listitem">
            Keyboard accessible
          </span>
        </div>
      </section>

      <div className="shell">
        {plugins.length ? (
          <>
            <section className="surface-block discovery-panel" aria-label="Tool discovery controls">
              <div className="discovery-panel__grid">
                <div>
                  <label className="form-field__label" htmlFor="tool-search">
                    Search tools
                    <span className="form-field__hint">
                      Filter by title, summary, or capability tags. Press <kbd>/</kbd> to focus.
                    </span>
                  </label>
                  <input
                    id="tool-search"
                    className="tool-search"
                    type="search"
                    placeholder="e.g. segmentation"
                    autoComplete="off"
                    data-tool-search
                    aria-describedby="tool-search-hint"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <p className="form-field__hint" id="tool-search-hint">
                    Filters update as you type.
                  </p>
                  <div className="discovery-categories" role="list">
                    {categories.map((category) => {
                      const isActive = activeCategory === category;
                      return (
                        <button
                          key={category}
                          className={`badge badge--interactive${isActive ? " is-active" : ""}`}
                          type="button"
                          data-tool-category={category === "All tools" ? "all" : category}
                          aria-pressed={isActive}
                          onClick={() => setActiveCategory(category)}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <aside
                  className="discovery-preview"
                  data-tool-preview
                  hidden={!preview}
                  aria-live="polite"
                >
                  <p className="tool-card__category" data-tool-preview-category>
                    {preview?.category ?? ""}
                  </p>
                  <h2 className="section-heading discovery-preview__title" data-tool-preview-title>
                    {preview?.title ?? ""}
                  </h2>
                  <p className="discovery-preview__summary" data-tool-preview-summary>
                    {preview?.summary ?? "Select a tool to preview details."}
                  </p>
                  <dl className="discovery-preview__meta">
                    <div>
                      <dt>Launch</dt>
                      <dd>
                        {preview ? (
                          <Link
                            className="btn btn--subtle"
                            data-tool-preview-launch
                            data-keep-theme
                            to={`/tools/${preview.blueprint}`}
                          >
                            Open tool
                          </Link>
                        ) : (
                          <button className="btn btn--subtle" type="button" disabled>
                            Open tool
                          </button>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Documentation</dt>
                      <dd>
                        <a
                          className="btn btn--ghost"
                          data-tool-preview-docs
                          data-keep-theme
                          href={preview?.docs || "#"}
                          aria-disabled={!preview?.docs}
                          hidden={!preview?.docs}
                        >
                          View guide
                        </a>
                      </dd>
                    </div>
                  </dl>
                </aside>
              </div>
            </section>
            {Array.from(grouped.entries()).map(([category, items]) => (
              <section key={category} className="surface-block" aria-label={category} hidden={!items.length}>
                <header>
                  <p className="tool-card__category">{category}</p>
                  <h2 className="section-heading">{category}</h2>
                  <p className="hero__subtitle">
                    {CATEGORY_DESCRIPTIONS[category] ||
                      "Launch any tool with a consistent experience across the platform."}
                  </p>
                </header>
                <div className="card-grid" role="list" data-tool-section={category}>
                  {items.map((plugin, index) => {
                    const hue = iconHues[index % iconHues.length];
                    const iconUrl = plugin.icon ? `/${plugin.blueprint}/static/${plugin.icon}` : null;
                    return (
                      <article
                        key={plugin.blueprint}
                        className="tool-card"
                        role="listitem"
                        data-tool-card
                        data-tool-title={plugin.title}
                        data-tool-category={plugin.category}
                        data-tool-summary={plugin.summary}
                        data-tool-tags={(plugin.tags || []).join(" ")}
                        data-tool-launch={`/tools/${plugin.blueprint}`}
                        data-tool-docs={plugin.docs || undefined}
                      >
                        <div className="tool-card__icon" aria-hidden="true" style={{ ["--icon-hue" as string]: `${hue}` }}>
                          {iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : (
                            <span className="tool-card__icon-fallback">{plugin.title.charAt(0)}</span>
                          )}
                        </div>
                        <p className="tool-card__category">{plugin.category}</p>
                        <h3 className="tool-card__title">{plugin.title}</h3>
                        <p className="tool-card__summary">{plugin.summary}</p>
                        <div className="tool-card__actions">
                          <Link className="btn" data-keep-theme to={`/tools/${plugin.blueprint}`}>
                            Launch tool
                          </Link>
                          {plugin.docs ? (
                            <a className="btn btn--subtle" data-keep-theme href={plugin.docs}>
                              Read guide
                            </a>
                          ) : null}
                          <button
                            className="btn btn--ghost"
                            type="button"
                            data-tool-preview-trigger
                            onClick={() => setPreview(plugin)}
                          >
                            Quick view
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
            <p className="surface-muted discovery-empty" data-tool-empty hidden={filtered.length > 0} role="status">
              No tools match the current filters. Adjust the search or category to continue.
            </p>
          </>
        ) : (
          <p className="surface-block" role="status">
            No tools are currently registered. Add a plugin package under <code>plugins/</code> to get started.
          </p>
        )}
      </div>
    </section>
  );
}
