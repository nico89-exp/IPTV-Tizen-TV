/**
 * navigation.js — Gestion de la navigation D-pad pour Samsung Tizen TV
 * Intercepte les touches de la télécommande et gère le focus
 *
 * Codes de touches Tizen TV :
 *   37 = ArrowLeft, 38 = ArrowUp, 39 = ArrowRight, 40 = ArrowDown
 *   13 = Enter/OK
 *   10009 = Return/Back (Tizen)
 *   8 = Backspace
 *   403 = ColorF0Red (touche rouge)
 *   404 = ColorF1Green (touche verte)
 *   405 = ColorF2Yellow (touche jaune)
 *   406 = ColorF3Blue (touche bleue)
 *   412 = MediaRewind
 *   413 = MediaStop
 *   415 = MediaPlay
 *   19 = MediaPause
 *   417 = MediaFastForward
 *   10252 = MediaPlayPause
 */

const Navigation = (() => {

  // ── Registre des touches Tizen ──
  const TizenKey = {
    ENTER: 13,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    BACK: 10009,
    BACKSPACE: 8,
    RED: 403,
    GREEN: 404,
    YELLOW: 405,
    BLUE: 406,
    REWIND: 412,
    STOP: 413,
    PLAY: 415,
    PAUSE: 19,
    FAST_FWD: 417,
    PLAY_PAUSE: 10252,
  };

  let initialized = false;

  // ════════════════════════════════════════════
  // INITIALISATION
  // ════════════════════════════════════════════

  function init() {
    if (initialized) return;
    initialized = true;

    // Enregistrer les touches Tizen si l'API est disponible
    _registerTizenKeys();

    // Écouter les événements clavier
    document.addEventListener('keydown', _handleKeyDown, true);

    console.log('[Navigation] Initialisé — D-pad prêt');
  }

  function _registerTizenKeys() {
    // L'API tizen.tvinputdevice est disponible sur Samsung Tizen
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
      try {
        const keys = [
          'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
          'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
          'MediaPlayPause',
        ];
        keys.forEach(key => {
          try {
            tizen.tvinputdevice.registerKey(key);
          } catch (e) {
            // Ignorer si la touche n'est pas disponible
          }
        });
        console.log('[Navigation] Touches Tizen enregistrées');
      } catch (e) {
        console.warn('[Navigation] Impossible d\'enregistrer les touches Tizen:', e);
      }
    }
  }

  // ════════════════════════════════════════════
  // GESTIONNAIRE PRINCIPAL
  // ════════════════════════════════════════════

  function _handleKeyDown(event) {
    const key = event.key;
    const code = event.keyCode;

    // 1. Si le lecteur est ouvert, il prend priorité
    if (Player.isPlayerVisible()) {
      const handled = Player.handleKey(key || code);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // 2. Si une modal est ouverte
    const seriesModal = document.getElementById('series-detail-modal');
    if (seriesModal && !seriesModal.classList.contains('hidden')) {
      _handleModalKeys(event, key, code);
      return;
    }

    // 3. Navigation principale de l'application
    _handleAppKeys(event, key, code);
  }

  function _handleModalKeys(event, key, code) {
    if (key === 'Escape' || code === TizenKey.BACK || code === TizenKey.BACKSPACE) {
      event.preventDefault();
      App.closeSeriesModal();
      return;
    }
    // Laisser la navigation normale dans la modal
  }

  function _handleAppKeys(event, key, code) {
    // Login: D-Pad-Navigation zwischen Eingabefeldern und Schaltflächen
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen && !loginScreen.classList.contains('hidden')) {
      const loginItems = [
        document.getElementById('login-name'),
        document.getElementById('login-server'),
        document.getElementById('login-username'),
        document.getElementById('login-password'),
        document.getElementById('btn-login'),
        document.getElementById('btn-demo')
      ].filter(Boolean);

      const focused = document.activeElement;
      const index = loginItems.indexOf(focused);

      if (code === TizenKey.DOWN) {
        event.preventDefault();
        event.stopPropagation();
        const next = index >= 0 && index < loginItems.length - 1 ? index + 1 : 0;
        loginItems[next].focus();
        return;
      }

      if (code === TizenKey.UP) {
        event.preventDefault();
        event.stopPropagation();
        const previous = index > 0 ? index - 1 : loginItems.length - 1;
        loginItems[previous].focus();
        return;
      }
    }
    // Retour / Escape
    if (key === 'Escape' || code === TizenKey.BACK || code === TizenKey.BACKSPACE) {
      event.preventDefault();
      _handleBack();
      return;
    }

    // Touche rouge = favori dans liste
    if (code === TizenKey.RED) {
      event.preventDefault();
      const focused = document.activeElement;
      const favBtn = focused && focused.querySelector('.channel-fav-btn, .grid-card-fav');
      if (favBtn) favBtn.click();
      return;
    }

    // Navigation spatiale dans les listes / grilles
    if ([TizenKey.LEFT, TizenKey.RIGHT, TizenKey.UP, TizenKey.DOWN].includes(code)) {
      _handleSpatialNavigation(event, code);
      return;
    }
  }

  // ════════════════════════════════════════════
  // NAVIGATION SPATIALE
  // ════════════════════════════════════════════

  function _handleSpatialNavigation(event, code) {
    const focused = document.activeElement;
    if (!focused) return;

    // Si on est dans la sidebar
    if (focused.closest('#sidebar-nav')) {
      event.preventDefault();
      _navigateSidebar(code, focused);
      return;
    }

    // Si on est dans un panel catégories
    if (focused.closest('.categories-panel')) {
      event.preventDefault();
      _navigateList(code, focused, '.categories-panel', '.category-item');
      return;
    }

    // Si on est dans une liste de chaînes
    if (focused.closest('.channels-panel')) {
      event.preventDefault();
      if (code === TizenKey.LEFT) {
        // Retour aux catégories ou à la sidebar
        const catPanel = focused.closest('.two-column-layout').querySelector('.categories-panel .category-item.active, .categories-panel .category-item');
        if (catPanel) catPanel.focus();
      } else {
        _navigateList(code, focused, '.channels-panel', '.channel-item');
      }
      return;
    }

    // Si on est dans une grille
    if (focused.closest('.grid-panel')) {
      event.preventDefault();
      if (code === TizenKey.LEFT) {
        const layout = focused.closest('.two-column-layout');
        if (layout) {
          const catPanel = layout.querySelector('.categories-panel .category-item.active, .categories-panel .category-item');
          if (catPanel) { catPanel.focus(); return; }
        }
      }
      _navigateGrid(code, focused);
      return;
    }

    // Si on est dans les épisodes (modal)
    if (focused.closest('.episodes-list')) {
      event.preventDefault();
      _navigateList(code, focused, '.episodes-list', '.episode-item');
      return;
    }

    // Si on est dans la liste des récents / favoris horizontaux
    if (focused.closest('.horizontal-scroll')) {
      event.preventDefault();
      if (code === TizenKey.LEFT || code === TizenKey.RIGHT) {
        _navigateHorizontal(code, focused);
      }
      return;
    }

    // Flèche gauche en haut niveau → ouvrir sidebar
    if (code === TizenKey.LEFT) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('collapsed')) {
        event.preventDefault();
        App.expandSidebar();
        const activeNav = sidebar.querySelector('.nav-item.active');
        if (activeNav) activeNav.focus();
        return;
      }
    }

    // Flèche droite depuis sidebar → contenu
    if (code === TizenKey.RIGHT && focused.closest('#sidebar-nav')) {
      event.preventDefault();
      App.collapseSidebar();
      App.focusContentArea();
      return;
    }
  }

  function _navigateSidebar(code, focused) {
    if (code === TizenKey.RIGHT) {
      App.collapseSidebar();
      App.focusContentArea();
      return;
    }
    const items = Array.from(document.querySelectorAll('#sidebar-nav .nav-item'));
    const idx = items.indexOf(focused);
    if (code === TizenKey.UP && idx > 0) items[idx - 1].focus();
    if (code === TizenKey.DOWN && idx < items.length - 1) items[idx + 1].focus();
    if (code === TizenKey.LEFT) {
      App.collapseSidebar();
    }
  }

  function _navigateList(code, focused, containerSel, itemSel) {
    const container = focused.closest(containerSel);
    if (!container) return;
    const items = Array.from(container.querySelectorAll(itemSel));
    const idx = items.indexOf(focused);
    if (code === TizenKey.UP && idx > 0) {
      items[idx - 1].focus();
      items[idx - 1].scrollIntoView({ block: 'nearest' });
    }
    if (code === TizenKey.DOWN && idx < items.length - 1) {
      items[idx + 1].focus();
      items[idx + 1].scrollIntoView({ block: 'nearest' });
    }
  }

  function _navigateHorizontal(code, focused) {
    const container = focused.closest('.horizontal-scroll');
    if (!container) return;
    const items = Array.from(container.querySelectorAll('[tabindex]'));
    const idx = items.indexOf(focused);
    if (code === TizenKey.LEFT && idx > 0) {
      items[idx - 1].focus();
      items[idx - 1].scrollIntoView({ inline: 'nearest' });
    }
    if (code === TizenKey.RIGHT && idx < items.length - 1) {
      items[idx + 1].focus();
      items[idx + 1].scrollIntoView({ inline: 'nearest' });
    }
  }

  function _navigateGrid(code, focused) {
    const grid = focused.closest('.grid-panel');
    if (!grid) return;
    const items = Array.from(grid.querySelectorAll('.grid-card'));
    const idx = items.indexOf(focused);
    if (idx < 0) return;

    // Calculer nombre de colonnes
    const gridStyle = window.getComputedStyle(grid);
    const colCount = Math.round(grid.offsetWidth / (items[0] ? items[0].offsetWidth + 20 : 200));

    let newIdx = idx;
    if (code === TizenKey.LEFT && idx % colCount !== 0) newIdx = idx - 1;
    if (code === TizenKey.RIGHT && (idx + 1) % colCount !== 0 && idx < items.length - 1) newIdx = idx + 1;
    if (code === TizenKey.UP && idx >= colCount) newIdx = idx - colCount;
    if (code === TizenKey.DOWN && idx + colCount < items.length) newIdx = idx + colCount;

    if (newIdx !== idx && items[newIdx]) {
      items[newIdx].focus();
      items[newIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  // ════════════════════════════════════════════
  // GESTION RETOUR
  // ════════════════════════════════════════════

  function _handleBack() {
    // Si sidebar ouverte → la fermer
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      App.collapseSidebar();
      return;
    }

    // Si on n'est pas sur l'accueil → revenir à l'accueil
    const activeTab = document.querySelector('.nav-item.active');
    if (activeTab && activeTab.dataset.tab !== 'home') {
      App.switchTab('home');
      return;
    }

    // Sur l'accueil → demande confirmation de fermeture
    _confirmExit();
  }

  function _confirmExit() {
    // Sur Tizen, on peut appeler tizen.application.getCurrentApplication().exit()
    if (confirm('IPTV Manager beenden?')) {
      if (typeof tizen !== 'undefined') {
        try {
          tizen.application.getCurrentApplication().exit();
        } catch (e) {
          window.close();
        }
      } else {
        window.close();
      }
    }
  }

  // ── Exposition publique ──
  return {
    init,
  };
})();
