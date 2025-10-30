import { useEffect } from "react";

function updateThemeLinks(theme: string) {
  const anchors = document.querySelectorAll<HTMLAnchorElement>("[data-keep-theme]");
  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) {
      return;
    }
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) {
        return;
      }
      if (theme) {
        url.searchParams.set("theme", theme);
      } else {
        url.searchParams.delete("theme");
      }
      anchor.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      // Ignore malformed URLs
    }
  });
}

export function useTheme(theme: string) {
  useEffect(() => {
    if (!theme) {
      return;
    }
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeLinks(theme);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("theme", theme);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      // Ignore history errors in restrictive environments
    }
  }, [theme]);
}
