const LOG_MAX_ENTRIES = 50;
const LOG_LEVEL_CLASS = {
  success: 'log-window__entry--success',
  error: 'log-window__entry--error',
  warning: 'log-window__entry--warning',
  progress: 'log-window__entry--progress',
};

const logWindowController = (() => {
  const container = document.querySelector('[data-log-window]');
  if (!container) {
    return { push() {}, clear() {} };
  }

  const list = container.querySelector('[data-log-list]');
  const toggle = container.querySelector('[data-log-toggle]');
  const clearButton = container.querySelector('[data-log-clear]');
  const emptyState = container.querySelector('[data-log-empty]');

  let collapsed = container.dataset.state === 'collapsed';

  const updateState = () => {
    container.dataset.state = collapsed ? 'collapsed' : 'open';
    if (toggle) {
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? 'Show activity log' : 'Hide activity log');
    }
    if (clearButton) {
      clearButton.disabled = !list || list.children.length === 0;
    }
  };

  const updateEmpty = () => {
    if (!emptyState || !list) {
      return;
    }
    emptyState.hidden = list.children.length > 0;
  };

  const setOpen = (open) => {
    const shouldCollapse = !open;
    if (collapsed === shouldCollapse) {
      return;
    }
    collapsed = shouldCollapse;
    updateState();
  };

  if (toggle) {
    toggle.addEventListener('click', () => {
      collapsed = !collapsed;
      updateState();
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (list) {
        list.innerHTML = '';
      }
      updateEmpty();
      updateState();
    });
  }

  updateState();
  updateEmpty();

  const push = (message, level = 'info') => {
    if (!list || !message) {
      return;
    }
    const entry = document.createElement('li');
    entry.className = 'log-window__entry';
    const normalised = typeof level === 'string' ? level.toLowerCase() : 'info';
    const levelClass = LOG_LEVEL_CLASS[normalised];
    if (levelClass) {
      entry.classList.add(levelClass);
    }

    const time = document.createElement('span');
    time.className = 'log-window__time';
    time.textContent = new Date().toLocaleTimeString([], { hour12: false });

    const text = document.createElement('p');
    text.className = 'log-window__message';
    text.textContent = message;

    entry.append(time, text);
    list.append(entry);

    while (list.children.length > LOG_MAX_ENTRIES) {
      list.removeChild(list.firstChild);
    }

    updateEmpty();
    updateState();
    setOpen(true);
  };

  return {
    push,
    clear() {
      if (list) {
        list.innerHTML = '';
      }
      updateEmpty();
      updateState();
    },
  };
})();

export function logMessage(message, level = 'info', { context } = {}) {
  if (message == null) {
    return;
  }
  const trimmed = String(message).trim();
  if (!trimmed) {
    return;
  }
  const normalised = typeof level === 'string' ? level.toLowerCase() : 'info';
  const safeLevel = Object.prototype.hasOwnProperty.call(LOG_LEVEL_CLASS, normalised)
    ? normalised
    : 'info';
  const formatted = context ? `${context}: ${trimmed}` : trimmed;
  logWindowController.push(formatted, safeLevel);
}

function applyTheme(theme) {
  if (!theme) return;
  document.documentElement.setAttribute('data-theme', theme);
}

function updateThemeLinks(theme) {
  document.querySelectorAll('[data-keep-theme]').forEach((anchor) => {
    if (!anchor.href) return;
    const url = new URL(anchor.href, window.location.origin);
    if (theme) {
      url.searchParams.set('theme', theme);
    } else {
      url.searchParams.delete('theme');
    }
    anchor.href = `${url.pathname}${url.search}${url.hash}`;
  });
}

function initThemeToggle() {
  const root = document.documentElement;
  const select = document.querySelector('[data-theme-toggle]');
  const optionsRaw = root.dataset.themeOptions || '{}';
  let options;
  try {
    options = JSON.parse(optionsRaw);
  } catch (error) {
    options = {};
  }
  const availableThemes = Object.keys(options);
  const currentTheme = root.getAttribute('data-theme') || availableThemes[0] || 'midnight';
  applyTheme(currentTheme);
  updateThemeLinks(currentTheme);

  if (!select) {
    return;
  }

  select.addEventListener('change', (event) => {
    const value = event.target.value;
    applyTheme(value);
    updateThemeLinks(value);
    const url = new URL(window.location.href);
    url.searchParams.set('theme', value);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  });

  if (select.value !== currentTheme) {
    select.value = currentTheme;
  }
}

function initNavigation() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-nav-menu]');
  if (!toggle || !menu) {
    return;
  }

  const closeMenu = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const next = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(next));
    if (next) {
      menu.querySelector('a, button')?.focus({ preventScroll: true });
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      closeMenu();
    }
  });
}

export function bindForm(
  form,
  { onSubmit, pendingText = 'Processing…', successText = 'Done', logContext }
) {
  if (!form) {
    return { setStatus() {} };
  }

  const statusEls = Array.from(form.querySelectorAll('[data-role="status"]'));
  const setStatus = (message, type = 'info') => {
    statusEls.forEach((el) => {
      el.textContent = message || '';
      if (message) {
        el.dataset.status = type;
      } else {
        delete el.dataset.status;
      }
    });
    if (message) {
      logMessage(message, type, { context: logContext });
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (typeof onSubmit !== 'function') {
      return;
    }
    try {
      setStatus(pendingText, 'progress');
      await onSubmit(new FormData(form));
      setStatus(successText, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      setStatus(message, 'error');
    }
  });

  return { setStatus };
}

export function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function setInputFiles(input, files) {
  if (!input) return;
  const data = new DataTransfer();
  ([]).concat(files || []).forEach((file) => {
    if (file) {
      data.items.add(file);
    }
  });
  input.files = data.files;
}

export function setupDropzone(zone, input, { onFiles, accept } = {}) {
  if (!zone || !input) {
    return () => {};
  }

  const matchesAccept = (file) => {
    if (!accept) return true;
    const accepted = accept.split(',').map((item) => item.trim()).filter(Boolean);
    if (!accepted.length) return true;
    const lowerName = file.name.toLowerCase();
    return accepted.some((candidate) => {
      if (!candidate) return false;
      if (candidate.endsWith('/*')) {
        const prefix = candidate.slice(0, -1);
        return file.type.startsWith(prefix);
      }
      if (candidate.startsWith('.')) {
        return lowerName.endsWith(candidate.toLowerCase());
      }
      return file.type === candidate;
    });
  };

  const handleFiles = (files) => {
    const validFiles = files.filter((file) => matchesAccept(file));
    if (!validFiles.length) {
      if (typeof onFiles === 'function') {
        onFiles([], { rejected: files });
      }
      return;
    }
    setInputFiles(input, validFiles);
    if (typeof onFiles === 'function') {
      onFiles(validFiles, { rejected: files.filter((file) => !validFiles.includes(file)) });
    }
  };

  zone.addEventListener('click', () => {
    input.click();
  });

  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-active');
  });

  zone.addEventListener('dragleave', (event) => {
    if (!zone.contains(event.relatedTarget)) {
      zone.classList.remove('is-active');
    }
  });

  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-active');
    if (event.dataTransfer?.files?.length) {
      handleFiles(Array.from(event.dataTransfer.files));
    }
  });

  input.addEventListener('change', (event) => {
    const target = event.target;
    if (target.files?.length) {
      handleFiles(Array.from(target.files));
    }
  });

  return () => {
    zone.classList.remove('is-active');
    setInputFiles(input, []);
  };
}

initNavigation();
initThemeToggle();
