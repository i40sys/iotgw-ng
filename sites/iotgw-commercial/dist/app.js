// UI strings rendered by this script, per page language (<html lang>).
const IOTGW_I18N = {
  ca: {
    audiences: {
      integradors: {
        kicker: 'EMPRESA D’AUTOMATITZACIÓ / INTEGRADOR',
        title: 'Més projectes amb el mateix equip tècnic.',
        copy: 'Executa més projectes amb el mateix equip, redueix els desplaçaments i ofereix contractes de manteniment remot amb serveis recurrents.',
        benefits: ['Instal·lacions homogènies i repetibles, amb menys errors humans.', 'Manteniment en remot de la flota de cada client.', 'Un model de servei recurrent, no només de projecte.'],
        example: 'Preparar els gateways de diversos clients amb la mateixa configuració estàndard i mantenir-los des d’Edge Manager.'
      },
      industria: {
        kicker: 'CLIENT INDUSTRIAL / FÀBRICA',
        title: 'Més fiabilitat. Menys intervencions presencials.',
        copy: 'Obté més fiabilitat, millor control de la ciberseguretat, menys temps de resolució d’incidències i menys dependència d’intervencions presencials.',
        benefits: ['Actualitzacions de seguretat controlades a tots els gateways.', 'Visibilitat centralitzada de l’estat i les incidències.', 'Recuperació més ràpida quan cal substituir un equip.'],
        example: 'Substituir un gateway avariat i recuperar-ne la configuració sense tornar-lo a configurar a mà.'
      },
      oem: {
        kicker: 'FABRICANT DE MAQUINÀRIA (OEM)',
        title: 'La màquina, connectada després de l’entrega.',
        copy: 'Lliura màquines amb gateways preparats per ser gestionats remotament, mantén les instal·lacions dels teus clients i evoluciona les aplicacions sense substituir el hardware.',
        benefits: ['Gateways preparats per a la gestió remota des de l’entrega.', 'Aplicacions que evolucionen sense canviar el hardware.', 'Suport a les instal·lacions dels clients, amb menys desplaçaments.'],
        example: 'Definir un gateway de referència per a una família de màquines i actualitzar-ne les aplicacions a tota la base instal·lada.'
      }
    },
    compare: {
      sense: 'Sense la plataforma: equips instal·lats que cal mantenir un a un.',
      amb: 'Amb IoT Gateway NG + Edge Manager: una flota de gateways gestionada centralitzadament durant tot el seu cicle de vida.'
    },
    iso: {
      on: 'Telemetria de cada línia, processada i contextualitzada, cap al MES i l’ERP en temps real.',
      off: 'El núvol no respon. Les 6 línies continuen produint, cadascuna en el seu entorn aïllat.'
    },
    contact: {
      fallbackInterest: 'Explorar IoT Gateway NG',
      intro: 'M’interessa parlar d’IoT Gateway NG.',
      interest: 'Interès',
      company: 'Empresa',
      context: 'Context',
      outro: 'M’agradaria veure una demostració i valorar l’encaix amb la nostra instal·lació.',
      copied: 'Resum copiat. El pots enganxar al missatge de contacte. No s’ha enviat cap dada.',
      manual: 'El navegador no ha permès copiar automàticament. Copia el resum seleccionat amb Ctrl+C o Cmd+C. No s’ha enviat cap dada.',
      textareaLabel: 'Resum preparat per copiar'
    }
  },
  es: {
    audiences: {
      integradors: {
        kicker: 'EMPRESA DE AUTOMATIZACIÓN / INTEGRADOR',
        title: 'Más proyectos con el mismo equipo técnico.',
        copy: 'Ejecuta más proyectos con el mismo equipo, reduce los desplazamientos y ofrece contratos de mantenimiento remoto con servicios recurrentes.',
        benefits: ['Instalaciones homogéneas y repetibles, con menos errores humanos.', 'Mantenimiento en remoto de la flota de cada cliente.', 'Un modelo de servicio recurrente, no solo de proyecto.'],
        example: 'Preparar los gateways de varios clientes con la misma configuración estándar y mantenerlos desde Edge Manager.'
      },
      industria: {
        kicker: 'CLIENTE INDUSTRIAL / FÁBRICA',
        title: 'Más fiabilidad. Menos intervenciones presenciales.',
        copy: 'Obtén más fiabilidad, mejor control de la ciberseguridad, menos tiempo de resolución de incidencias y menos dependencia de intervenciones presenciales.',
        benefits: ['Actualizaciones de seguridad controladas en todos los gateways.', 'Visibilidad centralizada del estado y las incidencias.', 'Recuperación más rápida cuando hay que sustituir un equipo.'],
        example: 'Sustituir un gateway averiado y recuperar su configuración sin volver a configurarlo a mano.'
      },
      oem: {
        kicker: 'FABRICANTE DE MAQUINARIA (OEM)',
        title: 'La máquina, conectada después de la entrega.',
        copy: 'Entrega máquinas con gateways preparados para ser gestionados en remoto, mantén las instalaciones de tus clientes y evoluciona las aplicaciones sin sustituir el hardware.',
        benefits: ['Gateways preparados para la gestión remota desde la entrega.', 'Aplicaciones que evolucionan sin cambiar el hardware.', 'Soporte a las instalaciones de los clientes, con menos desplazamientos.'],
        example: 'Definir un gateway de referencia para una familia de máquinas y actualizar sus aplicaciones en toda la base instalada.'
      }
    },
    compare: {
      sense: 'Sin la plataforma: equipos instalados que hay que mantener uno a uno.',
      amb: 'Con IoT Gateway NG + Edge Manager: una flota de gateways gestionada de forma centralizada durante todo su ciclo de vida.'
    },
    iso: {
      on: 'Telemetría de cada línea, procesada y contextualizada, hacia el MES y el ERP en tiempo real.',
      off: 'La nube no responde. Las 6 líneas siguen produciendo, cada una en su entorno aislado.'
    },
    contact: {
      fallbackInterest: 'Explorar IoT Gateway NG',
      intro: 'Me interesa hablar de IoT Gateway NG.',
      interest: 'Interés',
      company: 'Empresa',
      context: 'Contexto',
      outro: 'Me gustaría ver una demostración y valorar el encaje con nuestra instalación.',
      copied: 'Resumen copiado. Puedes pegarlo en el mensaje de contacto. No se ha enviado ningún dato.',
      manual: 'El navegador no ha permitido copiar automáticamente. Copia el resumen seleccionado con Ctrl+C o Cmd+C. No se ha enviado ningún dato.',
      textareaLabel: 'Resumen preparado para copiar'
    }
  },
  en: {
    audiences: {
      integradors: {
        kicker: 'AUTOMATION COMPANY / SYSTEM INTEGRATOR',
        title: 'More projects with the same technical team.',
        copy: 'Run more projects with the same team, cut travel and offer remote maintenance contracts with recurring services.',
        benefits: ['Consistent, repeatable installations with fewer human errors.', 'Remote maintenance of each customer’s fleet.', 'A recurring service model, not just project work.'],
        example: 'Prepare the gateways of several customers with the same standard configuration and maintain them from Edge Manager.'
      },
      industria: {
        kicker: 'INDUSTRIAL CUSTOMER / FACTORY',
        title: 'More reliability. Fewer on-site interventions.',
        copy: 'Gain reliability, better control of cybersecurity, faster incident resolution and less dependence on on-site interventions.',
        benefits: ['Controlled security updates on every gateway.', 'Centralised visibility of status and incidents.', 'Faster recovery when a unit has to be replaced.'],
        example: 'Replace a failed gateway and restore its configuration without configuring it again by hand.'
      },
      oem: {
        kicker: 'MACHINE BUILDER (OEM)',
        title: 'The machine, connected after delivery.',
        copy: 'Deliver machines with gateways ready to be managed remotely, maintain your customers’ installations and evolve the applications without replacing the hardware.',
        benefits: ['Gateways ready for remote management from delivery.', 'Applications that evolve without changing the hardware.', 'Support for customer installations, with less travel.'],
        example: 'Define a reference gateway for a machine family and update its applications across the whole installed base.'
      }
    },
    compare: {
      sense: 'Without the platform: installed units that must be maintained one by one.',
      amb: 'With IoT Gateway NG + Edge Manager: a fleet of gateways managed centrally throughout its whole life cycle.'
    },
    iso: {
      on: 'Telemetry from every line, processed and contextualised, flowing to the MES and the ERP in real time.',
      off: 'The cloud is not responding. All 6 lines keep producing, each in its own isolated environment.'
    },
    contact: {
      fallbackInterest: 'Explore IoT Gateway NG',
      intro: 'I would like to talk about IoT Gateway NG.',
      interest: 'Interest',
      company: 'Company',
      context: 'Context',
      outro: 'I would like to see a demo and assess the fit with our installation.',
      copied: 'Summary copied. You can paste it into the contact message. No data has been sent.',
      manual: 'Your browser did not allow automatic copying. Copy the selected summary with Ctrl+C or Cmd+C. No data has been sent.',
      textareaLabel: 'Summary ready to copy'
    }
  }
};
const IOTGW_LANG = (document.documentElement.lang || 'ca').slice(0, 2);
const T = IOTGW_I18N[IOTGW_LANG] || IOTGW_I18N.ca;

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

  const audiences = T.audiences;

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
    const texts = T.compare;
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
    const interest = intent?.selectedOptions?.[0]?.textContent.trim() || T.contact.fallbackInterest;
    return [
      T.contact.intro,
      '',
      `${T.contact.interest}: ${interest}`,
      company ? `${T.contact.company}: ${company}` : '',
      context ? `${T.contact.context}: ${context}` : '',
      '',
      T.contact.outro
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
      setText('#contact-feedback', T.contact.copied);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message;
      textarea.readOnly = true;
      textarea.setAttribute('aria-label', T.contact.textareaLabel);
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
        setText('#contact-feedback', T.contact.copied);
      } else {
        setText('#contact-feedback', T.contact.manual);
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
  const texts = T.iso;
  iso.querySelectorAll('[data-cloud-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      const state = button.dataset.cloudChoice;
      iso.dataset.cloud = state;
      iso.querySelectorAll('[data-cloud-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      if (status) status.textContent = texts[state];
    });
  });
})();

// Language switch: remember the visitor's explicit choice for the next visit to the site root.
document.querySelectorAll('.lang-switch [data-lang]').forEach((link) => {
  link.addEventListener('click', () => {
    try { localStorage.setItem('iotgw-lang', link.dataset.lang); } catch { /* storage blocked: the link still works */ }
  });
});
