(function () {
  'use strict';

  var DESIGN_WIDTH = 700;
  var wrapper;
  var dpad;

  function fitGame() {
    if (!wrapper) wrapper = document.getElementById('wrapper');
    if (!wrapper) return;

    var viewportWidth = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    var viewportHeight = Math.max(1, document.documentElement.clientHeight || window.innerHeight);
    var compact = viewportWidth <= 760 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var scale = Math.min(1, viewportWidth / DESIGN_WIDTH);
    if (compact && viewportWidth > viewportHeight) scale = Math.min(scale, viewportHeight / 700);
    wrapper.style.transform = compact ? 'scale(' + scale + ')' : '';
    wrapper.style.left = compact ? Math.max(0, (viewportWidth - DESIGN_WIDTH * scale) / 2) + 'px' : '';
    document.body.style.height = compact ? Math.ceil(1080 * scale) + 'px' : '';
  }

  function activeModule() {
    return window.Engine && window.Engine.activeModule;
  }

  function eventIsOpen() {
    var eventPanel = document.getElementById('event');
    return eventPanel && eventPanel.offsetParent !== null;
  }

  function isDirectionScene() {
    var active = activeModule();
    return !eventIsOpen() && (active === window.World || active === window.Space);
  }

  function moveWorld(direction) {
    if (!window.World || (window.Engine && window.Engine.keyLock)) return;
    var method = {
      up: 'moveNorth',
      down: 'moveSouth',
      left: 'moveWest',
      right: 'moveEast'
    }[direction];
    if (method && typeof window.World[method] === 'function') window.World[method]();
  }

  function setSpaceDirection(direction, pressed) {
    if (!window.Space) return;
    window.Space[direction] = pressed;
  }

  function releaseDirections() {
    ['up', 'down', 'left', 'right'].forEach(function (direction) {
      setSpaceDirection(direction, false);
    });
  }

  function syncShell() {
    if (window.parent === window) return;
    window.parent.postMessage({ source: 'xiaohw-classic', type: 'title', value: document.title }, window.location.origin);
    var language = new URLSearchParams(window.location.search).get('lang');
    if (language) {
      window.parent.postMessage({ source: 'xiaohw-classic', type: 'language', value: language }, window.location.origin);
    }
  }

  function pressDirection(event) {
    event.preventDefault();
    if (!isDirectionScene()) return;
    var direction = event.currentTarget.getAttribute('data-direction');
    if (activeModule() === window.Space) setSpaceDirection(direction, true);
    else moveWorld(direction);
  }

  function releaseDirection(event) {
    event.preventDefault();
    var direction = event.currentTarget.getAttribute('data-direction');
    setSpaceDirection(direction, false);
  }

  function createDpad() {
    dpad = document.createElement('nav');
    dpad.className = 'mobile-dpad';
    dpad.setAttribute('aria-label', '方向控制');
    [
      ['up', '↑', '向上'],
      ['left', '←', '向左'],
      ['right', '→', '向右'],
      ['down', '↓', '向下']
    ].forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = item[1];
      button.setAttribute('aria-label', item[2]);
      button.setAttribute('data-direction', item[0]);
      button.addEventListener('pointerdown', pressDirection);
      button.addEventListener('pointerup', releaseDirection);
      button.addEventListener('pointercancel', releaseDirection);
      button.addEventListener('pointerleave', releaseDirection);
      dpad.appendChild(button);
    });
    document.body.appendChild(dpad);

    window.setInterval(function () {
      dpad.classList.toggle('is-visible', isDirectionScene());
      if (activeModule() !== window.Space) releaseDirections();
    }, 250);
  }

  function init() {
    wrapper = document.getElementById('wrapper');
    fitGame();
    createDpad();
    syncShell();
    var title = document.querySelector('title');
    if (title) new MutationObserver(syncShell).observe(title, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', fitGame, { passive: true });
    window.addEventListener('orientationchange', fitGame, { passive: true });
    window.addEventListener('blur', releaseDirections);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) releaseDirections();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
