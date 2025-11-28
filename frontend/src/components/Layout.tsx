import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { LogWindow } from "./LogWindow";

export function Layout({ children }: { children: ReactNode }) {
  const { manifests, currentTheme, themeOptions, setTheme, siteSettings } = useAppContext();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const helpHref = siteSettings.help_overview || "/help/overview";

  const options = useMemo(
    () =>
      Object.entries(themeOptions || {}).map(([key, meta]) => ({
        key,
        label: meta?.label ?? key,
      })),
    [themeOptions],
  );

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 980) {
        setNavOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header" role="banner">
        <div className="shell">
          <div className="header-top">
            <div className="brand">
              <Link className="brand__link" data-keep-theme to="/">
                <span className="brand__logo" aria-hidden="true">
                  <img src="/static/img/ml_server_icon.png" alt="" />
                </span>
                <span className="brand__text">
                  <span className="brand__title">ML Server AIO</span>
                  <span className="brand__subtitle">Offline ML Toolkit</span>
                </span>
              </Link>
            </div>
            <div className="header-actions">
              <form className="theme-picker" data-theme-selector>
                <label className="sr-only" htmlFor="site-theme">
                  Select theme
                </label>
                <span aria-hidden="true" className="theme-picker__label">
                  Theme
                </span>
                <select
                  id="site-theme"
                  name="theme"
                  data-theme-toggle
                  value={currentTheme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </form>
              <button
                className="nav-toggle"
                type="button"
                data-nav-toggle
                aria-expanded={navOpen}
                aria-controls="primary-nav"
                onClick={() => setNavOpen((prev) => !prev)}
              >
                <span className="nav-toggle__label">Menu</span>
              </button>
            </div>
          </div>
          <nav id="primary-nav" className={`site-nav${navOpen ? " is-open" : ""}`} aria-label="Primary" data-nav-menu>
            <ul className="nav-list" onClick={() => setNavOpen(false)}>
              <li className="nav-list__item">
                <Link className="nav-list__link" data-keep-theme to="/">
                  Home
                </Link>
              </li>
              {manifests.map((plugin) => (
                <li className="nav-list__item" key={plugin.blueprint}>
                  <Link className="nav-list__link" data-keep-theme to={`/tools/${plugin.blueprint}`}>
                    {plugin.title}
                  </Link>
                </li>
              ))}
              {helpHref ? (
                <li className="nav-list__item">
                  {helpHref.startsWith("/") ? (
                    <Link className="nav-list__link" data-keep-theme to={helpHref}>
                      Help
                    </Link>
                  ) : (
                    <a className="nav-list__link" data-keep-theme href={helpHref}>
                      Help
                    </a>
                  )}
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
      </header>
      <div className="global-status" role="status" aria-live="polite" aria-atomic="true"></div>
      <main id="main" className="site-main" tabIndex={-1}>
        {children}
      </main>
      <LogWindow />
      <footer className="site-footer" role="contentinfo">
        <div className="shell">
          <p className="site-footer__tagline">
            {siteSettings.description ?? "Offline only · Privacy first · Built for labs"}
          </p>
          <p className="site-footer__meta">
            &copy; {siteSettings.name ?? "ML Server AIO"} · Offline sandbox
          </p>
        </div>
      </footer>
    </>
  );
}
