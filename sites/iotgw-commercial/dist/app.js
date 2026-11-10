(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const setText = (selector, value) => {
    const element = $(selector);
    if (element) element.textContent = value;
  };

  const menuToggle = $('#menu-toggle');
  const navigation = $('#site-nav');
  const closeMenu = () => {
    navigation?.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  };
  menuToggle?.addEventListener('click', () => {
    if (!navigation) return;
    const open = navigation.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  navigation?.addEventListener('click', (event) => {
    if (event.target.closest('a, [data-contact]')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navigation?.classList.contains('open')) {
      closeMenu();
      menuToggle?.focus();
    }
  });

  const audiences = {
    integradors: {
      kicker: 'EMPRESA D’AUTOMATITZACIÓ / INTEGRADOR',
      title: 'Més projectes amb el mateix equip tècnic.',
      copy: 'Executa més projectes amb el mateix equip, redueix els desplaçaments i ofereix contractes de manteniment remot amb serveis recurrents.',
      benefits: [
        'Instal·lacions homogènies i repetibles, amb menys errors humans.',
        'Manteniment en remot de la flota de cada client.',
        'Un model de servei recurrent, no només de projecte.'
      ],
      example: 'Preparar els gateways de diversos clients amb la mateixa configuració estàndard i mantenir-los des d’Edge Manager.'
    },
    industria: {
      kicker: 'CLIENT INDUSTRIAL / FÀBRICA',
      title: 'Més fiabilitat. Menys intervencions presencials.',
      copy: 'Obté més fiabilitat, millor control de la ciberseguretat, menys temps de resolució d’incidències i menys dependència d’intervencions presencials.',
      benefits: [
        'Actualitzacions de seguretat controlades a tots els gateways.',
        'Visibilitat centralitzada de l’estat i les incidències.',
        'Recuperació més ràpida quan cal substituir un equip.'
      ],
      example: 'Substituir un gateway avariat i recuperar-ne la configuració sense tornar-lo a configurar a mà.'
    },
    oem: {
      kicker: 'FABRICANT DE MAQUINÀRIA (OEM)',
      title: 'La màquina, connectada després de l’entrega.',
      copy: 'Lliura màquines amb gateways preparats per ser gestionats remotament, mantén les instal·lacions dels teus clients i evoluciona les aplicacions sense substituir el hardware.',
      benefits: [
        'Gateways preparats per a la gestió remota des de l’entrega.',
        'Aplicacions que evolucionen sense canviar el hardware.',
        'Suport a les instal·lacions dels clients, amb menys desplaçaments.'
      ],
      example: 'Definir un gateway de referència per a una família de màquines i actualitzar-ne les aplicacions a tota la base instal·lada.'
    }
  };

  // Automatic-activation tabs: arrows move focus and select; Tab leaves the list.
  function createTabs(selector, panelSelector, onSelect, prefix) {
    const buttons = $$(selector);
    const panel = $(panelSelector);
    if (!buttons.length || !panel) return null;
    let current = Math.max(0, buttons.findIndex((button) => button.getAttribute('aria-selected') === 'true'));
    const select = (index, focus = false) => {
      current = (index + buttons.length) % buttons.length;
      buttons.forEach((button, position) => {
        const active = position === current;
        if (!button.id) button.id = `${prefix}-${position}`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(active));
        button.setAttribute('aria-controls', panel.id);
        button.tabIndex = active ? 0 : -1;
        button.classList.toggle('active', active);
      });
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', buttons[current].id);
      onSelect(buttons[current], current);
      if (focus) buttons[current].focus();
    };
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(index));
      button.addEventListener('keydown', (event) => {
        const indexes = {
          ArrowRight: index + 1,
          ArrowLeft: index - 1,
          ArrowDown: index + 1,
          ArrowUp: index - 1,
          Home: 0,
          End: buttons.length - 1
        };
        if (!(event.key in indexes)) return;
        event.preventDefault();
        select(indexes[event.key], true);
      });
    });
    select(current);
    return { next: () => select(current + 1), select };
  }

  createTabs('[data-audience]', '#audience-panel', (button) => {
    const audience = audiences[button.dataset.audience];
    if (!audience) return;
    setText('#audience-kicker', audience.kicker);
    setText('#audience-title', audience.title);
    setText('#audience-copy', audience.copy);
    setText('#audience-example', audience.example);
    const list = $('#audience-benefits');
    if (list) {
      list.replaceChildren(...audience.benefits.map((benefit) => {
        const item = document.createElement('li');
        item.textContent = benefit;
        return item;
      }));
    }
  }, 'audience-tab');

  // Benefits page: "equip a equip" vs "flota gestionada" comparison.
  const compare = $('.compare');
  if (compare) {
    const cards = $$('.cmp-card', compare);
    const count = $('.compare-count', compare);
    const summary = $('.compare-summary', compare);
    const choices = $$('[data-mode-choice]', compare);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const texts = {
      sense: 'Sense la plataforma: equips instal·lats que cal mantenir un a un.',
      amb: 'Amb IoT Gateway NG + Edge Manager: una flota de gateways gestionada centralitzadament durant tot el seu cicle de vida.'
    };
    let timer = null;
    let touched = false;
    const setMode = (mode) => {
      if (compare.dataset.mode === mode) return;
      compare.dataset.mode = mode;
      choices.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.modeChoice === mode)));
      if (summary) summary.textContent = texts[mode];
      clearInterval(timer);
      const target = mode === 'amb' ? cards.length : 0;
      let value = mode === 'amb' ? 0 : cards.length;
      const show = () => { if (count) count.textContent = `${value} / ${cards.length}`; };
      if (still) { value = target; show(); return; }
      show();
      timer = setInterval(() => {
        value += mode === 'amb' ? 1 : -1;
        show();
        if (value === target) clearInterval(timer);
      }, 70);
    };
    choices.forEach((button) => button.addEventListener('click', () => {
      touched = true;
      setMode(button.dataset.modeChoice);
    }));
    compare.classList.add('is-ready');
    // Play the change once when the grid comes into view, unless the visitor already chose.
    if (!still && 'IntersectionObserver' in window) {
      const grid = $('.compare-grid', compare);
      const watcher = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        setTimeout(() => { if (!touched) setMode('amb'); }, 900);
      }, { threshold: 0.35 });
      if (grid) watcher.observe(grid);
    }
  }

  const dialog = $('#contact-dialog');
  let contactOpener = null;
  let copyFallback = null;
  const closeContact = () => {
    if (dialog?.open) dialog.close();
  };
  $$('[data-contact]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!dialog || typeof dialog.showModal !== 'function') return;
      contactOpener = button;
      closeMenu();
      if (!dialog.open) dialog.showModal();
    });
  });
  $('#contact-close')?.addEventListener('click', closeContact);
  dialog?.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeContact();
  });
  dialog?.addEventListener('close', () => {
    copyFallback?.remove();
    copyFallback = null;
    setText('#contact-feedback', '');
    contactOpener?.focus();
  });
  dialog?.addEventListener('submit', (event) => event.preventDefault());

  const brief = () => {
    const intent = $('#contact-intent');
    const company = $('#contact-company')?.value.trim();
    const context = $('#contact-context')?.value.trim();
    const interest = intent?.selectedOptions?.[0]?.textContent.trim() || 'Explorar IoT Gateway NG';
    return [
      'M’interessa parlar d’IoT Gateway NG.',
      '',
      `Interès: ${interest}`,
      company ? `Empresa: ${company}` : '',
      context ? `Context: ${context}` : '',
      '',
      'M’agradaria veure una demostració i valorar l’encaix amb la nostra instal·lació.'
    ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n');
  };

  $('#contact-summary')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const message = brief();
    copyFallback?.remove();
    copyFallback = null;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(message);
      setText('#contact-feedback', 'Resum copiat. El pots enganxar al missatge de contacte. No s’ha enviat cap dada.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message;
      textarea.readOnly = true;
      textarea.setAttribute('aria-label', 'Resum preparat per copiar');
      textarea.className = 'copy-fallback';
      textarea.rows = 6;
      textarea.style.cssText = 'width:100%;margin-top:1rem;';
      (dialog || document.body).appendChild(textarea);
      copyFallback = textarea;
      textarea.focus();
      textarea.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* Keep the selected text available. */ }
      if (copied) {
        textarea.remove();
        copyFallback = null;
        $('#contact-summary')?.focus();
        setText('#contact-feedback', 'Resum copiat. El pots enganxar al missatge de contacte. No s’ha enviat cap dada.');
      } else {
        setText('#contact-feedback', 'El navegador no ha permès copiar automàticament. Copia el resum seleccionat amb Ctrl+C o Cmd+C. No s’ha enviat cap dada.');
      }
    }
  });

  const header = $('header');
  let scrollScheduled = false;
  const updateHeader = () => {
    header?.classList.toggle('scrolled', window.scrollY > 24);
    scrollScheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (!scrollScheduled) {
      scrollScheduled = true;
      requestAnimationFrame(updateHeader);
    }
  }, { passive: true });
  updateHeader();
  setText('#year', new Date().getFullYear());

  // The page is visible without JS. This class is only an optional animation hook.
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$('.reveal').forEach((element) => observer.observe(element));
  } else {
    $$('.reveal').forEach((element) => element.classList.add('is-visible'));
  }
})();

// Architecture figure: keep each flow SVG in real pixels so packets (pathLength=100) run the full path.
(() => {
  const svgs = document.querySelectorAll('.fig-bus, .fig-split svg');
  if (!svgs.length) return;
  const toPoints = (d, vw, vh) => {
    const pts = []; let x = 0, y = 0;
    const re = /([MVH])\s*([\d.]+)(?:[ ,]+([\d.]+))?/g; let m;
    while ((m = re.exec(d))) {
      if (m[1] === 'M') { x = +m[2]; y = +m[3]; }
      else if (m[1] === 'V') y = +m[2];
      else x = +m[2];
      pts.push([x / vw, y / vh]);
    }
    return pts;
  };
  svgs.forEach((svg) => {
    const [, , vw, vh] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const paths = [...svg.querySelectorAll('path')].map((p) => ({ p, pts: toPoints(p.getAttribute('d'), vw, vh) }));
    const fit = () => {
      const { width: w, height: h } = svg.getBoundingClientRect();
      if (!w || !h) return;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      paths.forEach(({ p, pts }) => {
        p.setAttribute('d', pts.map(([fx, fy], i) => `${i ? 'L' : 'M'}${(fx * w).toFixed(1)} ${(fy * h).toFixed(1)}`).join(''));
        p.removeAttribute('vector-effect');
      });
    };
    new ResizeObserver(fit).observe(svg);
    fit();
  });
})();

// Deployment page: highlight the step in view on the side rail and fill its progress line.
(() => {
  const links = [...document.querySelectorAll('[data-step-link]')];
  const cards = [...document.querySelectorAll('.step-card')];
  const fill = document.querySelector('.rail-progress b');
  if (!links.length || !cards.length || !('IntersectionObserver' in window)) return;
  const activate = (index) => {
    links.forEach((link, i) => {
      link.classList.toggle('is-active', i === index);
      link.classList.toggle('is-done', i < index);
      if (i === index) link.setAttribute('aria-current', 'step'); else link.removeAttribute('aria-current');
    });
    cards.forEach((card, i) => card.classList.toggle('is-active', i === index));
    if (fill) fill.style.height = `${((index + 1) / cards.length) * 100}%`;
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) activate(cards.indexOf(entry.target));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  cards.forEach((card) => observer.observe(card));
})();

// Success cases: simulate a cloud outage on the isolated-lines diagram.
(() => {
  const iso = document.querySelector('.iso');
  if (!iso) return;
  const status = iso.querySelector('.iso-status');
  const texts = {
    on: 'Telemetria de cada línia, processada i contextualitzada, cap al MES i l’ERP en temps real.',
    off: 'El núvol no respon. Les 6 línies continuen produint, cadascuna en el seu entorn aïllat.'
  };
  iso.querySelectorAll('[data-cloud-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      const state = button.dataset.cloudChoice;
      iso.dataset.cloud = state;
      iso.querySelectorAll('[data-cloud-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      if (status) status.textContent = texts[state];
    });
  });
})();
