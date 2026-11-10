(() => {
  'use strict';

  const example = document.querySelector('#exemple-forn');
  if (!example) return;

  const choices = [...example.querySelectorAll('[data-connection-choice]')];
  const title = example.querySelector('#example-delivery-title');
  const copy = example.querySelector('#example-delivery-copy');
  const icon = example.querySelector('.example-delivery-icon');

  const showConnection = (connection) => {
    const offline = connection === 'offline';
    const restored = !offline && example.dataset.connection === 'offline';
    example.dataset.connection = connection;
    choices.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.connectionChoice === connection));
    });
    title.textContent = offline
      ? 'La connexió cau. Les dades es queden.'
      : restored ? 'Torna la connexió. L’enviament es reprèn.' : 'Les dades arriben al servidor.';
    copy.textContent = offline
      ? 'El gateway conserva les dades pendents. El dashboard local continua disponible.'
      : restored
        ? 'El gateway envia les dades pendents al servidor. L’històric local continua disponible.'
        : 'El gateway guarda les lectures i les envia al destí configurat.';
    icon.textContent = offline ? 'Ⅱ' : '↗';
  };

  choices.forEach((button) => {
    button.addEventListener('click', () => showConnection(button.dataset.connectionChoice));
  });
  example.querySelector('.example-switch').hidden = false;
})();
