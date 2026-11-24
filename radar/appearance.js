'use strict';

(() => {
  const key = 'shawyAppearanceV1';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const names = {
    accent: 'Акцент', bg: 'Фон', surface: 'Панели', text: 'Текст',
    border: 'Границы', button: 'Кнопки', success: 'Подключено',
    warning: 'Ожидание', error: 'Ошибка',
  };
  const validHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const range = (value, fallback, min, max) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const oneOf = (value, choices, fallback) => choices.includes(value) ? value : fallback;
  const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const luminance = hex => rgb(hex).map(n => {
    const c = n / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => {
    const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (light + .05) / (dark + .05);
  };
  const mix = (a, b, amount) => '#' + rgb(a).map((n, i) =>
    Math.round(n * (1 - amount) + rgb(b)[i] * amount).toString(16).padStart(2, '0')).join('');
  const onColor = color => contrast(color, '#000000') > contrast(color, '#FFFFFF') ? '#000000' : '#FFFFFF';
  const legible = (color, background) => contrast(color, background) >= 4.5 ? color : onColor(background);

  function readSettings(defaults, palettes) {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
    const colors = value => Object.fromEntries(Object.keys(names)
      .filter(name => validHex(value?.[name])).map(name => [name, value[name]]));
    const custom = (Array.isArray(saved?.custom) ? saved.custom : []).slice(0, 24)
      .filter(item => typeof item?.name === 'string' && item.name.trim() && typeof item.id === 'string')
      .map(item => ({ id: item.id, name: item.name.slice(0, 32), colors: colors(item.colors) }));
    return {
      version: 1,
      mode: oneOf(saved?.mode, ['light', 'dark', 'system'], defaults.mode),
      palette: oneOf(saved?.palette, [...palettes.map(p => p.name), ...custom.map(p => p.id)], palettes[0].name),
      radius: range(saved?.radius, defaults.radius, 0, 28),
      density: oneOf(saved?.density, ['compact', 'comfortable', 'spacious'], defaults.density),
      opacity: range(saved?.opacity, defaults.opacity, 70, 100),
      blur: range(saved?.blur, defaults.blur, 0, 20),
      scale: range(saved?.scale, defaults.scale, 85, 125),
      card: oneOf(saved?.card, ['tonal', 'outlined', 'flat'], defaults.card),
      motion: typeof saved?.motion === 'boolean' ? saved.motion : defaults.motion,
      colors: colors(saved?.colors),
      custom,
    };
  }

  function element(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function colorField(label, value, update) {
    const input = element('input', { type: 'color', value });
    input.setAttribute('aria-label', label);
    const hex = element('input', { type: 'text', value: value.toUpperCase(), maxLength: 7, spellcheck: false });
    hex.autocomplete = 'off';
    hex.setAttribute('aria-label', label + ' HEX');
    input.addEventListener('input', () => {
      hex.value = input.value.toUpperCase();
      hex.setCustomValidity('');
      update(input.value);
    });
    hex.addEventListener('input', () => {
      const color = hex.value.trim();
      const valid = validHex(color);
      hex.setCustomValidity(valid ? '' : 'Введите цвет в формате #9EA3FF.');
      if (valid) {
        input.value = color;
        update(color);
      }
    });
    return element('div', { className: 'color-field' }, element('span', {}, label), input, hex);
  }

  async function mount(container) {
    const result = await fetch('./design-tokens.json?v=5');
    if (!result.ok) throw Error('Не удалось загрузить палитры');
    const { defaults, palettes, schemes, density } = await result.json();
    let settings = readSettings(defaults, palettes);
    const root = document.documentElement;
    const controls = new Map();
    const feedback = element('p', { className: 'appearance-feedback' });
    feedback.setAttribute('role', 'status');
    const colorGrid = element('div', { className: 'color-grid' });
    const paletteGrid = element('div', { className: 'palette-grid' });
    paletteGrid.setAttribute('role', 'group');
    paletteGrid.setAttribute('aria-label', 'Палитры');
    const title = element('h2', {}, 'Внешний вид');
    const deletePalette = element('button', { type: 'button', textContent: 'Удалить палитру' });

    function scheme() {
      return settings.mode === 'system' ? system.matches ? 'dark' : 'light' : settings.mode;
    }

    function tokens() {
      const mode = scheme();
      const preset = palettes.find(p => p.name === settings.palette) || palettes[0];
      const custom = settings.custom.find(p => p.id === settings.palette);
      const accent = preset[mode];
      const schemeColors = { ...schemes[mode] };
      if (preset !== palettes[0]) {
        schemeColors.bg = mix(schemeColors.bg, accent, .035);
        schemeColors.surface = mix(schemeColors.surface, accent, .065);
        schemeColors.border = mix(schemeColors.border, accent, .15);
      }
      const base = { ...schemeColors, accent, ...custom?.colors, ...settings.colors };
      base.button = base.button || base.accent;
      return base;
    }

    function apply() {
      const color = tokens();
      const surface = mix(color.bg, color.surface, settings.opacity / 100);
      const ink = legible(color.text, surface);
      const muted = mix(ink, surface, .23);
      const props = {
        ...color, surface, text: ink, 'bg-text': legible(color.text, color.bg),
        muted: legible(muted, surface), 'accent-ink': legible(color.accent, surface),
        'on-button': onColor(color.button), 'accent-soft': mix(surface, color.accent, .17),
        'surface-high': mix(surface, ink, .065), radius: settings.radius + 'px',
        blur: settings.blur + 'px', 'ui-scale': settings.scale / 100,
        space: density[settings.density].space + 'px', row: density[settings.density].control + 'px',
      };
      for (const [name, value] of Object.entries(props)) root.style.setProperty('--' + name, value);
      root.dataset.scheme = scheme();
      root.dataset.density = settings.density;
      root.dataset.card = settings.card;
      root.dataset.motion = String(settings.motion);
      document.querySelector('meta[name=theme-color]').content = color.bg;
    }

    function persist() {
      apply();
      try { localStorage.setItem(key, JSON.stringify(settings)); }
      catch { feedback.textContent = 'Браузер не разрешил сохранить изменения.'; }
    }

    function refresh() {
      paletteGrid.replaceChildren();
      const mode = scheme();
      for (const palette of [...palettes, ...settings.custom]) {
        const id = palette.id || palette.name;
        const swatch = element('i', { className: 'swatch' });
        swatch.style.backgroundColor = palette[mode] || palette.colors?.accent || palettes[0][mode];
        const button = element('button', { type: 'button', className: 'palette-option' }, swatch, palette.name);
        button.setAttribute('aria-pressed', String(settings.palette === id));
        button.onclick = () => {
          settings.palette = id;
          settings.colors = {};
          persist();
          refresh();
          [...paletteGrid.children].find(option => option.getAttribute('aria-pressed') === 'true')?.focus();
        };
        paletteGrid.append(button);
      }
      const color = tokens();
      colorGrid.replaceChildren(...Object.entries(names).map(([id, label]) =>
        colorField(label, color[id], value => { settings.colors[id] = value; persist(); })));
      for (const [id, control] of controls) {
        if (control.type === 'checkbox') control.checked = settings[id];
        else control.value = settings[id];
        control.nextElementSibling?.localName === 'output' && (control.nextElementSibling.value = settings[id] + control.dataset.unit);
      }
      deletePalette.hidden = !settings.custom.some(p => p.id === settings.palette);
    }

    function select(id, label, choices) {
      const input = element('select');
      input.setAttribute('aria-label', label);
      input.append(...choices.map(([value, name]) => element('option', { value }, name)));
      controls.set(id, input);
      input.onchange = () => {
        settings[id] = input.value;
        persist();
        if (id === 'mode') refresh();
      };
      return element('label', { className: 'setting-row' }, element('span', {}, label), input);
    }

    function slider(id, label, min, max, unit) {
      const input = element('input', { type: 'range', min, max });
      input.setAttribute('aria-label', label);
      const output = element('output');
      input.dataset.unit = unit;
      controls.set(id, input);
      input.oninput = () => {
        settings[id] = Number(input.value);
        output.value = settings[id] + unit;
        persist();
      };
      return element('label', { className: 'setting-row slider-row' }, element('span', {}, label), input, output);
    }

    const motion = element('input', { type: 'checkbox', role: 'switch' });
    controls.set('motion', motion);
    motion.onchange = () => { settings.motion = motion.checked; persist(); };
    const paletteName = element('input', { type: 'text', placeholder: 'Название палитры', maxLength: 32, required: true });
    paletteName.setAttribute('aria-label', 'Название палитры');
    const save = element('form', { className: 'palette-actions' }, paletteName,
      element('button', { type: 'submit', textContent: 'Сохранить' }), deletePalette);
    save.onsubmit = event => {
      event.preventDefault();
      const name = paletteName.value.trim();
      if (!name) return;
      let palette = settings.custom.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!palette && settings.custom.length >= 24) {
        feedback.textContent = 'Можно сохранить до 24 палитр.';
        return;
      }
      const colors = tokens();
      if (!palette) {
        palette = { id: 'custom-' + Date.now(), name };
        settings.custom.push(palette);
      }
      palette.colors = colors;
      settings.palette = palette.id;
      settings.colors = {};
      paletteName.value = '';
      feedback.textContent = 'Палитра сохранена.';
      persist();
      refresh();
    };
    deletePalette.onclick = () => {
      settings.custom = settings.custom.filter(p => p.id !== settings.palette);
      settings.palette = palettes[0].name;
      settings.colors = {};
      persist();
      refresh();
      paletteName.focus();
    };
    const reset = element('button', { type: 'button', textContent: 'Восстановить по умолчанию' });
    reset.onclick = () => {
      settings = { ...defaults, version: 1, palette: palettes[0].name, colors: {}, custom: settings.custom };
      feedback.textContent = 'Настройки сброшены. Сохранённые палитры доступны.';
      persist();
      refresh();
    };
    const colors = element('details', { className: 'settings-block' },
      element('summary', {}, 'Настроить цвета'), colorGrid, save, feedback);
    const layout = element('div', { className: 'settings-block' }, element('h3', {}, 'Интерфейс'),
      select('density', 'Плотность', [['compact', 'Компактно'], ['comfortable', 'Обычно'], ['spacious', 'Просторно']]),
      select('card', 'Панели', [['tonal', 'Тональные'], ['outlined', 'С рамкой'], ['flat', 'Плоские']]),
      slider('radius', 'Скругления', 0, 28, ' px'),
      slider('scale', 'Масштаб интерфейса', 85, 125, '%'),
      slider('opacity', 'Непрозрачность панелей', 70, 100, '%'),
      slider('blur', 'Размытие под диалогом', 0, 20, ' px'),
      element('label', { className: 'setting-row' }, element('span', {}, 'Анимации'), motion));
    container.replaceChildren(title, select('mode', 'Тема', [['dark', 'Тёмная'], ['light', 'Светлая'], ['system', 'Системная']]),
      element('h3', {}, 'Палитра'), paletteGrid, colors, layout, reset);
    system.addEventListener('change', () => { if (settings.mode === 'system') { apply(); refresh(); } });
    apply();
    refresh();
  }

  window.ShaWyAppearance = { mount, colorField };
})();
