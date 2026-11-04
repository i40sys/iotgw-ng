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
      kicker: 'INTEGRADORS OT / IT',
      title: 'Reutilitza la base. Dedica el criteri a la integració.',
      copy: 'Parteix d’una configuració versionada, selecciona els serveis necessaris i adapta la connexió a cada instal·lació. El teu coneixement del procés continua sent la peça essencial.',
      benefits: [
        'Una estructura comuna per organitzar clients, xarxes i gateways.',
        'Configuracions i serveis que pots adaptar a cada projecte.',
        'Historial d’execucions per revisar què s’ha aplicat i amb quin resultat.'
      ],
      example: 'Un cas possible: validar la captura de dades d’una línia i adaptar el mateix patró a una altra instal·lació.'
    },
    planta: {
      kicker: 'DIRECCIÓ I CAPS DE PLANTA',
      title: 'Digitalitza amb una base que puguis mantenir.',
      copy: 'Organitza els gateways i les xarxes, defineix un patró de desplegament i conserva el registre de les operacions. Comença per un objectiu de planta concret abans d’ampliar l’abast.',
      benefits: [
        'Inventari organitzat per domini, xarxa i dispositiu.',
        'Configuracions identificades per nom i versió.',
        'Una base compartida per coordinar planta, manteniment i integradors.'
      ],
      example: 'Un cas possible: preparar els gateways d’una àrea de producció i validar-ne les integracions abans d’estendre el projecte.'
    },
    manteniment: {
      kicker: 'OPERACIÓ I MANTENIMENT',
      title: 'Més context quan alguna cosa falla.',
      copy: 'Un gateway identificat, una configuració coneguda i un historial d’operacions ajuden l’equip tècnic a acotar una incidència. El control de la màquina continua als sistemes industrials corresponents.',
      benefits: [
        'Informació de xarxa i identitat del gateway en un mateix lloc.',
        'Accés als resultats i als logs dels desplegaments.',
        'Serveis de supervisió configurables segons les necessitats de la instal·lació.'
      ],
      example: 'Un cas possible: revisar la configuració i l’última execució amb l’integrador abans de planificar una intervenció.'
    },
    oem: {
      kicker: 'FABRICANTS DE MAQUINÀRIA / OEM',
      title: 'Acompanya la màquina més enllà de l’entrega.',
      copy: 'Avalua una capa de connectivitat i serveis locals per a les teves màquines, amb gestió dels gateways desplegats i configuracions adaptades als teus equips.',
      benefits: [
        'Una base per integrar dades i serveis al costat de la màquina.',
        'Configuracions de referència adaptables a cada instal·lació.',
        'Gestió del gateway separada del control industrial de la màquina.'
      ],
      example: 'Un cas possible: definir una configuració de gateway per a una família de màquines i validar-la amb el teu equip tècnic.'
    },
    serveis: {
      kicker: 'EMPRESES DE SERVEIS INDUSTRIALS',
      title: 'Gestiona els gateways dels teus clients.',
      copy: 'Organitza instal·lacions, aplica configuracions i consulta les execucions. Un mateix entorn per al desplegament i el manteniment dels gateways.',
      benefits: [
        'Un flux de treball compartit entre instal·lacions.',
        'Serveis locals seleccionables segons cada necessitat.',
        'Traçabilitat tècnica per donar suport a l’operació.'
      ],
      example: 'Un cas possible: revisar els gateways de diverses plantes des d’un sol entorn.'
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

  const steps = [
    {
      title: 'Arrenca. Identifica. Connecta.',
      description: 'Arrenca per xarxa amb iPXE al VP4651 amb coreboot. Identifica el gateway amb un codi d’un sol ús. En altres equips compatibles, el Live USB és una alternativa.',
      body: '<div class="demo-field"><span>Dispositiu d’exemple</span><strong>Gateway · Línia 01</strong></div><div class="demo-field"><span>Entorn d’arrencada</span><strong>iPXE · arrencada per xarxa</strong></div><div class="demo-field"><span>Identificació inicial</span><strong>Codi d’un sol ús</strong></div><p class="demo-note">L’equip s’identifica abans de preparar la instal·lació. Aquesta demostració no genera codis ni connecta amb cap gateway.</p>'
    },
    {
      title: 'Una instal·lació amb el destí clar.',
      description: 'Selecciona la versió d’OpenWrt i el disc de destí. Revisa l’equip i els paràmetres abans d’iniciar l’operació.',
      body: '<div class="demo-field"><span>Sistema base</span><strong>OpenWrt · versió seleccionada</strong></div><div class="demo-field"><span>Destí d’exemple</span><strong>Disc intern del gateway</strong></div><div class="demo-review"><span class="demo-status">Revisió prèvia</span><p>La instal·lació modifica el disc de destí. A l’eina, una revisió separada precedeix l’execució.</p></div><p class="demo-note">Aquí només mostrem el flux. No s’executa cap instal·lació.</p>'
    },
    {
      title: 'Verifica abans de continuar.',
      description: 'Arrenca des del disc intern i comprova l’accés al gateway amb el sistema instal·lat. Si has utilitzat un USB, retira’l abans de reiniciar.',
      body: '<ol class="demo-checks"><li><span>01</span><div><strong>Seleccionar el disc intern</strong><small>El següent inici es fa des del disc intern.</small></div></li><li><span>02</span><div><strong>Arrencar el sistema instal·lat</strong><small>El gateway posa en marxa OpenWrt.</small></div></li><li><span>03</span><div><strong>Comprovar l’accés</strong><small>L’operador verifica que l’equip és accessible.</small></div></li></ol><p class="demo-note">La comprovació real es fa des de la plataforma. Aquesta vista no informa de l’estat de cap equip.</p>'
    },
    {
      title: 'Els serveis que cada planta necessita.',
      description: 'Defineix la configuració amb formularis o JSON, selecciona els serveis i revisa els paràmetres abans d’aplicar-los al gateway.',
      body: '<div class="demo-services" aria-label="Exemples de serveis disponibles"><span class="demo-service">Node-RED</span><span class="demo-service">MQTT</span><span class="demo-service">Observabilitat</span><span class="demo-service">Còpies de seguretat</span><span class="demo-service">Telegraf</span><span class="demo-service">Uptime Kuma</span></div><div class="demo-field"><span>Configuració</span><strong>Versionada · formulari o JSON</strong></div><div class="demo-field"><span>Seguiment</span><strong>Resultat i logs de l’execució</strong></div><p class="demo-note">Guardar una configuració i aplicar-la al dispositiu són accions separades. Serveis mostrats a títol il·lustratiu.</p>'
    }
  ];

  const demoTabs = createTabs('[data-step]', '#demo-panel', (button, index) => {
    const stepIndex = Number(button.dataset.step);
    const step = steps[stepIndex] || steps[index];
    if (!step) return;
    setText('#demo-step-number', String(stepIndex + 1).padStart(2, '0'));
    setText('#demo-title', step.title);
    setText('#demo-description', step.description);
    const body = $('#demo-body');
    // All markup comes from the fixed local demonstration above, never user input.
    if (body) body.innerHTML = step.body;
    const progress = $('#demo-progress');
    if (progress) {
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '4');
      progress.setAttribute('aria-valuenow', String(stepIndex + 1));
      progress.setAttribute('aria-valuetext', `Etapa ${stepIndex + 1} de 4`);
      const fill = $('.progress-fill', progress);
      if (fill) fill.style.width = `${((stepIndex + 1) / steps.length) * 100}%`;
    }
    const next = $('#demo-next');
    if (next) {
      next.setAttribute('aria-label', stepIndex === steps.length - 1 ? 'Tornar a la primera etapa de la demostració' : `Veure l’etapa ${stepIndex + 2} de la demostració`);
      next.dataset.lastStep = String(stepIndex === steps.length - 1);
    }
  }, 'demo-tab');
  $('#demo-next')?.addEventListener('click', () => demoTabs?.next());

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
