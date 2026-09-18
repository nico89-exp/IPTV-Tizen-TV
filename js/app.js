/**
 * app.js — Logique principale de l'application IPTV Manager Tizen TV
 * Gère : connexion, navigation entre onglets, chargement des contenus,
 *         affichage des listes/grilles, modal séries, favoris, récents
 */

const App = (() => {

  // ── État global ──
  let activeAccount = null;
  let isDemoMode = false;
  let currentTab = 'home';
  let sidebarExpanded = false;

  // Données chargées
  let liveCategories = [];
  let liveChannels = [];
  let selectedLiveCategoryId = null;

  let vodCategories = [];
  let vodStreams = [];
  let selectedVodCategoryId = null;

  let seriesCategories = [];
  let seriesList = [];
  let selectedSeriesCategoryId = null;

  // Recherche
  let liveSearch = '';
  let vodSearch = '';
  let seriesSearch = '';

  // ── Timers ──
  let clockTimer = null;
  let toastTimer = null;
  let liveSearchTimer = null;
  let vodSearchTimer = null;
  let seriesSearchTimer = null;

  // ════════════════════════════════════════════
  // DÉMARRAGE
  // ════════════════════════════════════════════

  async function start() {
    // Initialiser les modules
    Player.init();
    Navigation.init();

    // Démarrer l'horloge
    _startClock();

    // Vérifier s'il y a un compte actif sauvegardé
    const savedAccount = Storage.getActiveAccount();

    // Simuler le splash 2s
    await _delay(2000);

    if (savedAccount) {
      activeAccount = savedAccount;
      _showMainApp();
      await _loadAllContent();
    } else {
      _showLoginScreen();
    }
  }

  // ════════════════════════════════════════════
  // CONNEXION
  // ════════════════════════════════════════════

  function _setupLoginEvents() {
    const btnLogin = document.getElementById('btn-login');
    const btnDemo = document.getElementById('btn-demo');

    if (btnLogin) btnLogin.addEventListener('click', _handleLogin);
    if (btnDemo) btnDemo.addEventListener('click', _handleDemo);

    // Enter sur les champs
    ['login-name', 'login-server', 'login-username', 'login-password'].forEach((id, idx, arr) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            if (idx < arr.length - 1) {
              document.getElementById(arr[idx + 1]).focus();
            } else {
              _handleLogin();
            }
          }
        });
      }
    });

    _loadSavedAccountsList();
  }

  async function _handleLogin() {
    const name = (document.getElementById('login-name').value || '').trim() || 'Mein IPTV';
    const server = (document.getElementById('login-server').value || '').trim();
    const username = (document.getElementById('login-username').value || '').trim();
    const password = (document.getElementById('login-password').value || '').trim();

    if (!server || !username || !password) {
      _showLoginError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    _showLoginLoading(true);
    _showLoginError('');

    const account = {
      id: Date.now().toString(),
      name,
      serverUrl: server,
      username,
      password,
      addedAt: new Date().toISOString(),
      userInfo: null,
    };

    try {
      const userInfo = await XtreamAPI.authenticate(account);
      account.userInfo = userInfo;

      Storage.saveAccount(account);
      Storage.setActiveAccount(account);
      activeAccount = account;

      isDemoMode = false;
      _showMainApp();
      await _loadAllContent();
    } catch (err) {
      _showLoginLoading(false);
      _showLoginError('Verbindung fehlgeschlagen: ' + (err.message || err));
    }
  }

  function _handleDemo() {
    const demo = XtreamAPI.getDemoData();
    activeAccount = demo.account;
    isDemoMode = true;

    Storage.setActiveAccount(activeAccount);

    liveCategories = demo.liveCategories;
    liveChannels = demo.liveChannels;
    vodCategories = demo.vodCategories;
    vodStreams = demo.vodStreams;
    seriesCategories = demo.seriesCategories;
    seriesList = demo.seriesList;

    _showMainApp();
    _renderHomeTab();
    _renderLiveTab();
    _renderVodTab();
    _renderSeriesTab();
  }

  function _showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function _showLoginLoading(show) {
    const el = document.getElementById('login-loading');
    const btn = document.getElementById('btn-login');
    if (el) el.classList.toggle('hidden', !show);
    if (btn) btn.disabled = show;
  }

  function _loadSavedAccountsList() {
    const accounts = Storage.getAccounts();
    const section = document.getElementById('saved-accounts-section');
    const list = document.getElementById('saved-accounts-list');
    if (!section || !list) return;

    if (accounts.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    list.innerHTML = '';

    accounts.forEach(acc => {
      const item = document.createElement('div');
      item.className = 'account-item';
      item.tabIndex = 0;
      item.innerHTML = `
        <span class="account-item-name">${_esc(acc.name)}</span>
        <span class="account-item-server">${_esc(acc.serverUrl)}</span>
        <button class="account-item-delete" data-id="${acc.id}" title="Löschen">🗑️</button>
      `;
      item.addEventListener('click', () => _loginWithAccount(acc));
      item.addEventListener('keydown', e => { if (e.key === 'Enter') _loginWithAccount(acc); });
      item.querySelector('.account-item-delete').addEventListener('click', e => {
        e.stopPropagation();
        Storage.deleteAccount(acc.id);
        _loadSavedAccountsList();
      });
      list.appendChild(item);
    });
  }

  async function _loginWithAccount(acc) {
    _showLoginLoading(true);
    _showLoginError('');
    try {
      const userInfo = await XtreamAPI.authenticate(acc);
      acc.userInfo = userInfo;
      Storage.saveAccount(acc);
      Storage.setActiveAccount(acc);
      activeAccount = acc;
      isDemoMode = false;
      _showMainApp();
      await _loadAllContent();
    } catch (err) {
      _showLoginLoading(false);
      _showLoginError('Erreur : ' + (err.message || err));
    }
  }

  // ════════════════════════════════════════════
  // NAVIGATION ÉCRANS
  // ════════════════════════════════════════════

  function _showLoginScreen() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    _setupLoginEvents();
    const firstInput = document.getElementById('login-server');
    if (firstInput) setTimeout(() => firstInput.focus(), 300);
  }

  function _showMainApp() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    _updateAccountDisplay();
    _setupMainEvents();
    _switchTabInternal('home');
  }

  function _updateAccountDisplay() {
    if (!activeAccount) return;
    const nameEl = document.getElementById('account-name-display');
    const statusEl = document.getElementById('account-status-display');
    if (nameEl) nameEl.textContent = activeAccount.name || '-';
    if (statusEl) {
      statusEl.textContent = activeAccount.userInfo
        ? (activeAccount.userInfo.status === 'Active' ? '✅ Actif' : activeAccount.userInfo.status)
        : (isDemoMode ? '🎭 Démo' : '-');
    }
  }

  // ════════════════════════════════════════════
  // ÉVÉNEMENTS INTERFACE PRINCIPALE
  // ════════════════════════════════════════════

  function _setupMainEvents() {
    // Navigation sidebar
    document.querySelectorAll('#sidebar-nav .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (tab) switchTab(tab);
      });
      item.addEventListener('mouseenter', expandSidebar);
    });

    document.getElementById('sidebar').addEventListener('mouseleave', () => {
      if (!document.activeElement.closest('#sidebar-nav')) {
        collapseSidebar();
      }
    });

    // Recherche Live
    const liveSearchEl = document.getElementById('live-search');
    if (liveSearchEl) {
      liveSearchEl.addEventListener('input', e => {
        clearTimeout(liveSearchTimer);
        liveSearchTimer = setTimeout(() => {
          liveSearch = e.target.value.toLowerCase();
          _renderLiveChannels();
        }, 300);
      });
    }

    // Recherche VOD
    const vodSearchEl = document.getElementById('vod-search');
    if (vodSearchEl) {
      vodSearchEl.addEventListener('input', e => {
        clearTimeout(vodSearchTimer);
        vodSearchTimer = setTimeout(() => {
          vodSearch = e.target.value.toLowerCase();
          _renderVodGrid();
        }, 300);
      });
    }

    // Recherche Séries
    const seriesSearchEl = document.getElementById('series-search');
    if (seriesSearchEl) {
      seriesSearchEl.addEventListener('input', e => {
        clearTimeout(seriesSearchTimer);
        seriesSearchTimer = setTimeout(() => {
          seriesSearch = e.target.value.toLowerCase();
          _renderSeriesGrid();
        }, 300);
      });
    }

    // Sous-tabs Favoris
    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const subtab = btn.dataset.subtab;
        document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(subtab)?.classList.add('active');
        _renderFavoritesTab(subtab);
      });
    });

    // Effacer récents
    const btnClearRecents = document.getElementById('btn-clear-recents');
    if (btnClearRecents) {
      btnClearRecents.addEventListener('click', () => {
        if (confirm('Effacer tout l\'historique ?')) {
          Storage.clearRecents();
          _renderRecentsTab();
          showToast('Historique effacé');
        }
      });
    }

    // Bouton ajouter compte (paramètres)
    const btnAddAccount = document.getElementById('btn-add-account');
    if (btnAddAccount) {
      btnAddAccount.addEventListener('click', () => {
        Storage.setActiveAccount(null);
        activeAccount = null;
        _showLoginScreen();
      });
    }
  }

  // ════════════════════════════════════════════
  // CHARGEMENT CONTENU XTREAM
  // ════════════════════════════════════════════

  async function _loadAllContent() {
    _renderHomeTab();
    _renderSettingsTab();

    if (!isDemoMode && activeAccount) {
      await Promise.all([
        _loadLiveContent(),
        _loadVodContent(),
        _loadSeriesContent(),
      ]);
    }
  }

  async function _loadLiveContent() {
    try {
      liveCategories = await XtreamAPI.getLiveCategories(activeAccount);
      liveChannels = await XtreamAPI.getLiveChannels(activeAccount);
      _renderLiveTab();
    } catch (e) {
      console.error('[App] Erreur chargement live:', e);
      _renderError('live-channels-list', 'Erreur de chargement: ' + e.message);
    }
  }

  async function _loadVodContent() {
    try {
      vodCategories = await XtreamAPI.getVodCategories(activeAccount);
      vodStreams = await XtreamAPI.getVodStreams(activeAccount);
      _renderVodTab();
    } catch (e) {
      console.error('[App] Erreur chargement VOD:', e);
      _renderError('vod-grid', 'Erreur de chargement: ' + e.message);
    }
  }

  async function _loadSeriesContent() {
    try {
      seriesCategories = await XtreamAPI.getSeriesCategories(activeAccount);
      seriesList = await XtreamAPI.getSeries(activeAccount);
      _renderSeriesTab();
    } catch (e) {
      console.error('[App] Erreur chargement séries:', e);
      _renderError('series-grid', 'Erreur de chargement: ' + e.message);
    }
  }

  // ════════════════════════════════════════════
  // ONGLET ACCUEIL
  // ════════════════════════════════════════════

  function _renderHomeTab() {
    _renderHomeRecents();
    _renderHomeFavLive();
    _renderHomeFavVod();
  }

  function _renderHomeRecents() {
    const container = document.getElementById('home-recents-list');
    if (!container) return;
    const recents = Storage.getRecents();
    if (recents.length === 0) {
      container.innerHTML = '<div class="empty-row">Keine zuletzt angesehenen Inhalte</div>';
      return;
    }
    container.innerHTML = '';
    recents.slice(0, 20).forEach((item, i) => {
      const tile = _createHomeTile(item, i, () => _playItem(item));
      container.appendChild(tile);
    });
  }

  function _renderHomeFavLive() {
    const container = document.getElementById('home-fav-live-list');
    if (!container) return;
    const favs = Storage.getFavoritesByType('live');
    if (favs.length === 0) {
      container.innerHTML = '<div class="empty-row">Aucune chaîne favorite</div>';
      return;
    }
    container.innerHTML = '';
    favs.forEach((item, i) => {
      const tile = _createHomeTile(item, i, () => _playFavorite(item));
      container.appendChild(tile);
    });
  }

  function _renderHomeFavVod() {
    const container = document.getElementById('home-fav-vod-list');
    if (!container) return;
    const favs = Storage.getFavoritesByType('vod');
    if (favs.length === 0) {
      container.innerHTML = '<div class="empty-row">Aucun film favori</div>';
      return;
    }
    container.innerHTML = '';
    favs.forEach((item, i) => {
      const tile = _createHomeTile(item, i, () => _playFavorite(item));
      container.appendChild(tile);
    });
  }

  function _createHomeTile(item, tabIdx, onPlay) {
    const tile = document.createElement('div');
    tile.className = 'home-tile';
    tile.tabIndex = 100 + tabIdx;

    const progressPct = item.durationSeconds > 0
      ? Math.round((item.positionSeconds / item.durationSeconds) * 100)
      : 0;

    tile.innerHTML = `
      <div class="home-tile-thumb-placeholder">
        ${_getTypeEmoji(item.type)}
      </div>
      <div class="home-tile-info">
        <div class="home-tile-title">${_esc(item.title)}</div>
        <div class="home-tile-sub">${_esc(item.group || item.type)}</div>
        ${progressPct > 0 ? `<div class="progress-mini"><div class="progress-mini-fill" style="width:${progressPct}%"></div></div>` : ''}
      </div>
    `;

    if (item.imageUrl) {
      const img = tile.querySelector('.home-tile-thumb-placeholder');
      img.outerHTML = `<img class="home-tile-thumb" src="${_esc(item.imageUrl)}" alt="" onerror="this.outerHTML='<div class=\\'home-tile-thumb-placeholder\\'>${_getTypeEmoji(item.type)}</div>'">`;
    }

    tile.addEventListener('click', onPlay);
    tile.addEventListener('keydown', e => { if (e.key === 'Enter') onPlay(); });
    return tile;
  }

  // ════════════════════════════════════════════
  // ONGLET TV EN DIRECT
  // ════════════════════════════════════════════

  function _renderLiveTab() {
    _renderLiveCategories();
    _renderLiveChannels();
  }

  function _renderLiveCategories() {
    const panel = document.getElementById('live-categories-panel');
    if (!panel) return;
    panel.innerHTML = '<div class="category-item active" data-id="all" tabindex="200">Toutes les chaînes</div>';

    liveCategories.forEach((cat, i) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      item.dataset.id = cat.id;
      item.tabIndex = 201 + i;
      item.textContent = cat.name;
      item.addEventListener('click', () => {
        panel.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
        item.classList.add('active');
        selectedLiveCategoryId = cat.id === 'all' ? null : cat.id;
        _renderLiveChannels();
      });
      panel.appendChild(item);
    });

    const allItem = panel.querySelector('[data-id="all"]');
    if (allItem) {
      allItem.addEventListener('click', () => {
        panel.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
        allItem.classList.add('active');
        selectedLiveCategoryId = null;
        _renderLiveChannels();
      });
    }
  }

  function _renderLiveChannels() {
    const panel = document.getElementById('live-channels-list');
    if (!panel) return;

    let filtered = liveChannels;
    if (selectedLiveCategoryId) {
      filtered = filtered.filter(ch => ch.categoryId === selectedLiveCategoryId);
    }
    if (liveSearch) {
      filtered = filtered.filter(ch => ch.name.toLowerCase().includes(liveSearch));
    }

    if (filtered.length === 0) {
      panel.innerHTML = '<div class="loading-state"><p>Aucune chaîne trouvée</p></div>';
      return;
    }

    panel.innerHTML = '';
    filtered.forEach((ch, i) => {
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.tabIndex = 300 + i;

      const isFav = Storage.isFavorite(ch.id);
      item.innerHTML = `
        <div class="channel-logo-placeholder">📺</div>
        <div class="channel-info">
          <div class="channel-name">${_esc(ch.name)}</div>
          <div class="channel-group">${_getCategoryName(liveCategories, ch.categoryId)}</div>
        </div>
        <button class="channel-fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Retirer des favoris' : 'Zu Favoriten hinzufügen'}">
          ${isFav ? '⭐' : '☆'}
        </button>
      `;

      if (ch.streamIcon) {
        const ph = item.querySelector('.channel-logo-placeholder');
        ph.outerHTML = `<img class="channel-logo" src="${_esc(ch.streamIcon)}" alt="" onerror="this.outerHTML='<div class=\\'channel-logo-placeholder\\'>📺</div>'">`;
      }

      item.addEventListener('click', () => _playLiveChannel(ch));
      item.addEventListener('keydown', e => { if (e.key === 'Enter') _playLiveChannel(ch); });

      const favBtn = item.querySelector('.channel-fav-btn');
      favBtn.addEventListener('click', e => {
        e.stopPropagation();
        _toggleChannelFavorite(ch, favBtn);
      });

      panel.appendChild(item);
    });
  }

  function _toggleChannelFavorite(ch, btn) {
    const favItem = {
      id: ch.id,
      title: ch.name,
      imageUrl: ch.streamIcon || '',
      type: 'live',
      url: activeAccount ? XtreamAPI.liveStreamUrl(activeAccount, ch.streamId) : '',
      group: _getCategoryName(liveCategories, ch.categoryId),
      streamId: ch.streamId,
    };
    const isNowFav = Storage.toggleFavorite(favItem);
    if (btn) {
      btn.textContent = isNowFav ? '⭐' : '☆';
      btn.classList.toggle('active', isNowFav);
    }
    showToast(isNowFav ? '⭐ Ajouté aux favoris' : '✕ Aus Favoriten entfernt');
  }

  // ════════════════════════════════════════════
  // ONGLET VOD
  // ════════════════════════════════════════════

  function _renderVodTab() {
    _renderVodCategories();
    _renderVodGrid();
  }

  function _renderVodCategories() {
    const panel = document.getElementById('vod-categories-panel');
    if (!panel) return;
    panel.innerHTML = '<div class="category-item active" data-id="all" tabindex="400">Tous les films</div>';

    vodCategories.forEach((cat, i) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      item.dataset.id = cat.id;
      item.tabIndex = 401 + i;
      item.textContent = cat.name;
      item.addEventListener('click', () => {
        panel.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
        item.classList.add('active');
        selectedVodCategoryId = cat.id;
        _renderVodGrid();
      });
      panel.appendChild(item);
    });

    const allItem = panel.querySelector('[data-id="all"]');
    if (allItem) {
      allItem.addEventListener('click', () => {
        panel.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
        allItem.classList.add('active');
        selectedVodCategoryId = null;
        _renderVodGrid();
      });
    }
  }

  function _renderVodGrid() {
    const grid = document.getElementById('vod-grid');
    if (!grid) return;

    let filtered = vodStreams;
    if (selectedVodCategoryId) {
      filtered = filtered.filter(v => v.categoryId === selectedVodCategoryId);
    }
    if (vodSearch) {
      filtered = filtered.filter(v => v.name.toLowerCase().includes(vodSearch));
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="loading-state"><p>Aucun film trouvé</p></div>';
      return;
    }

    grid.innerHTML = '';
    filtered.forEach((vod, i) => {
      const card = _createGridCard(vod, '🎬', i, 500, () => _playVod(vod), () => _toggleVodFavorite(vod));
      grid.appendChild(card);
    });
  }

  function _toggleVodFavorite(vod) {
    const favItem = {
      id: vod.id,
      title: vod.name,
      imageUrl: vod.streamIcon || '',
      type: 'vod',
      url: activeAccount ? XtreamAPI.vodStreamUrl(activeAccount, vod.streamId, vod.containerExtension) : '',
      group: _getCategoryName(vodCategories, vod.categoryId),
      streamId: vod.streamId,
      containerExtension: vod.containerExtension,
      categoryId: vod.categoryId,
    };
    const isNowFav = Storage.toggleFavorite(favItem);
    showToast(isNowFav ? '⭐ Film ajouté aux favoris' : '✕ Film retiré des favoris');
    _renderVodGrid();
  }

  // ════════════════════════════════════════════
  // ONGLET SÉRIES
  // ════════════════════════════════════════════

  function _renderSeriesTab() {
    _renderSeriesCategories();
    _renderSeriesGrid();
  }

  function _renderSeriesCategories() {
    const panel = document.getElementById('series-categories-panel');
    if (!panel) return;
    panel.innerHTML = '<div class="category-item active" data-id="all" tabindex="700">Toutes les séries</div>';

    seriesCategories.forEach((cat, i) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      item.dataset.id = cat.id;
      item.tabIndex = 701 + i;
      item.textContent = cat.name;
      item.addEventListener('click', () => {
        panel.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
        item.classList.add('active');
        selectedSeriesCategoryId = cat.id;
        _renderSeriesGrid();
      });
      panel.appendChild(item);
    });

    const allItem = panel.querySelector('[data-id="all"]');
    if (allItem) {
      allItem.addEventListener('click', () => {
        panel.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
        allItem.classList.add('active');
        selectedSeriesCategoryId = null;
        _renderSeriesGrid();
      });
    }
  }

  function _renderSeriesGrid() {
    const grid = document.getElementById('series-grid');
    if (!grid) return;

    let filtered = seriesList;
    if (selectedSeriesCategoryId) {
      filtered = filtered.filter(s => s.categoryId === selectedSeriesCategoryId);
    }
    if (seriesSearch) {
      filtered = filtered.filter(s => s.name.toLowerCase().includes(seriesSearch));
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="loading-state"><p>Keine Serie gefunden</p></div>';
      return;
    }

    grid.innerHTML = '';
    filtered.forEach((series, i) => {
      const card = _createGridCard(series, '📺', i, 800, () => _openSeriesDetail(series), () => _toggleSeriesFavorite(series));
      grid.appendChild(card);
    });
  }

  function _toggleSeriesFavorite(series) {
    const favItem = {
      id: series.id,
      title: series.name,
      imageUrl: series.cover || '',
      type: 'series',
      url: '',
      group: _getCategoryName(seriesCategories, series.categoryId),
      categoryId: series.categoryId,
    };
    const isNowFav = Storage.toggleFavorite(favItem);
    showToast(isNowFav ? '⭐ Serie zu Favoriten hinzugefügt' : '✕ Serie aus Favoriten entfernt');
    _renderSeriesGrid();
  }

  // ════════════════════════════════════════════
  // MODAL DÉTAIL SÉRIE
  // ════════════════════════════════════════════

  async function _openSeriesDetail(series) {
    const modal = document.getElementById('series-detail-modal');
    if (!modal) return;

    // Afficher la modal avec le loading
    modal.classList.remove('hidden');
    document.getElementById('series-detail-title').textContent = series.name;
    document.getElementById('series-detail-cover').src = series.cover || '';
    document.getElementById('series-detail-plot').textContent = series.plot || '';
    document.getElementById('series-detail-genre').textContent = series.genre || '';
    document.getElementById('series-detail-rating').textContent = series.rating ? `⭐ ${series.rating}` : '';
    document.getElementById('series-detail-year').textContent = series.releaseDate || '';

    const isFav = Storage.isFavorite(series.id);
    const favBtn = document.getElementById('btn-series-favorite');
    if (favBtn) {
      favBtn.textContent = isFav ? '⭐ In Favoriten' : '☆ Zu Favoriten hinzufügen';
      favBtn.onclick = () => {
        _toggleSeriesFavorite(series);
        const nowFav = Storage.isFavorite(series.id);
        favBtn.textContent = nowFav ? '⭐ In Favoriten' : '☆ Zu Favoriten hinzufügen';
      };
    }

    const episodesList = document.getElementById('episodes-list');
    const seasonSelector = document.getElementById('season-selector');
    episodesList.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Wird geladen...</p></div>';
    seasonSelector.innerHTML = '';

    const closeBtn = document.getElementById('btn-close-series');
    if (closeBtn) closeBtn.onclick = closeSeriesModal;

    if (isDemoMode) {
      episodesList.innerHTML = '<div class="loading-state"><p>Episoden sind im Demo-Modus nicht verfügbar</p></div>';
      return;
    }

    try {
      const detail = await XtreamAPI.getSeriesDetail(activeAccount, series.id);
      _renderSeriesSeasons(detail, series);
    } catch (e) {
      episodesList.innerHTML = `<div class="loading-state"><p>Erreur: ${_esc(e.message)}</p></div>`;
    }
  }

  function _renderSeriesSeasons(detail, series) {
    const seasonSelector = document.getElementById('season-selector');
    const episodesList = document.getElementById('episodes-list');
    seasonSelector.innerHTML = '';

    if (detail.seasons.length === 0) {
      episodesList.innerHTML = '<div class="loading-state"><p>Keine Episode verfügbar</p></div>';
      return;
    }

    detail.seasons.forEach((season, idx) => {
      const btn = document.createElement('button');
      btn.className = 'season-btn' + (idx === 0 ? ' active' : '');
      btn.textContent = season.displayName;
      btn.tabIndex = 900 + idx;
      btn.addEventListener('click', () => {
        seasonSelector.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _renderEpisodes(season.episodes, series);
      });
      seasonSelector.appendChild(btn);
    });

    _renderEpisodes(detail.seasons[0].episodes, series);
  }

  function _renderEpisodes(episodes, series) {
    const list = document.getElementById('episodes-list');
    list.innerHTML = '';

    episodes.forEach((ep, i) => {
      const item = document.createElement('div');
      item.className = 'episode-item';
      item.tabIndex = 950 + i;

      item.innerHTML = `
        <span class="episode-num">${ep.episodeNum}</span>
        <span class="episode-title">${_esc(ep.displayTitle || ep.title || 'Épisode ' + ep.episodeNum)}</span>
        ${ep.duration ? `<span class="episode-duration">${ep.duration}</span>` : ''}
      `;

      item.addEventListener('click', () => {
        if (!activeAccount) return;
        const url = XtreamAPI.seriesStreamUrl(activeAccount, ep.streamId, ep.containerExtension);
        Player.load({
          id: `series_${series.id}_ep_${ep.id}`,
          title: series.name,
          subtitle: `${ep.displayTitle} — Ép. ${ep.episodeNum}`,
          url,
          type: 'episode',
          isLive: false,
          imageUrl: ep.cover || series.cover || '',
          group: 'Séries',
          seriesId: series.id,
          seriesName: series.name,
          seasonNum: ep.season,
          episodeNum: ep.episodeNum,
        }, () => {
          document.getElementById('player-screen').classList.add('hidden');
        });
        closeSeriesModal();
      });
      item.addEventListener('keydown', e => { if (e.key === 'Enter') item.click(); });

      list.appendChild(item);
    });
  }

  function closeSeriesModal() {
    document.getElementById('series-detail-modal').classList.add('hidden');
  }

  // ════════════════════════════════════════════
  // ONGLET FAVORIS
  // ════════════════════════════════════════════

  function _renderFavoritesTab(subTab) {
    if (!subTab || subTab === 'fav-live') _renderFavGrid('fav-live-grid', 'live');
    if (!subTab || subTab === 'fav-vod') _renderFavGrid('fav-vod-grid', 'vod');
    if (!subTab || subTab === 'fav-series') _renderFavGrid('fav-series-grid', 'series');
  }

  function _renderFavGrid(containerId, type) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    const favs = Storage.getFavoritesByType(type);

    if (favs.length === 0) {
      grid.innerHTML = '<div class="loading-state"><p>Keine Favoriten</p></div>';
      return;
    }

    grid.innerHTML = '';
    favs.forEach((fav, i) => {
      const emoji = type === 'live' ? '📺' : type === 'vod' ? '🎬' : '📺';
      const card = _createGridCard(fav, emoji, i, 600, () => _playFavorite(fav), () => {
        Storage.removeFavorite(fav.id);
        showToast('✕ Aus Favoriten entfernt');
        _renderFavGrid(containerId, type);
      });
      grid.appendChild(card);
    });
  }

  // ════════════════════════════════════════════
  // ONGLET RÉCENTS
  // ════════════════════════════════════════════

  function _renderRecentsTab() {
    const grid = document.getElementById('recents-grid');
    if (!grid) return;
    const recents = Storage.getRecents();

    if (recents.length === 0) {
      grid.innerHTML = '<div class="loading-state"><p>Keine zuletzt angesehenen Inhalte</p></div>';
      return;
    }

    grid.innerHTML = '';
    recents.forEach((item, i) => {
      const card = _createGridCard(
        { ...item, cover: item.imageUrl },
        _getTypeEmoji(item.type),
        i,
        650,
        () => _playItem(item),
        null
      );
      grid.appendChild(card);
    });
  }

  // ════════════════════════════════════════════
  // ONGLET PARAMÈTRES
  // ════════════════════════════════════════════

  function _renderSettingsTab() {
    const activeCard = document.getElementById('settings-active-account');
    if (activeCard && activeAccount) {
      const exp = activeAccount.userInfo?.expDate;
      let expDisplay = 'Unbegrenzt';
      if (exp && exp !== '' && exp !== 'null') {
        const ts = parseInt(exp);
        if (!isNaN(ts)) {
          const dt = new Date(ts * 1000);
          expDisplay = dt.toLocaleDateString('de-DE');
        }
      }
      activeCard.innerHTML = `
        <div class="account-card-name">${_esc(activeAccount.name)}</div>
        <div class="account-card-server">${_esc(activeAccount.serverUrl)}</div>
        <div class="account-card-status">${isDemoMode ? '🎭 Demo-Modus' : '✅ ' + (activeAccount.userInfo?.status || 'Verbunden')}</div>
        <div class="account-card-exp">Ablauf: ${expDisplay}</div>
      `;
    }

    const accountsList = document.getElementById('settings-accounts-list');
    if (accountsList) {
      const accounts = Storage.getAccounts();
      if (accounts.length === 0) {
        accountsList.innerHTML = '<p style="color:var(--text-dim);font-size:24px">Keine gespeicherten Konten</p>';
        return;
      }
      accountsList.innerHTML = '';
      accounts.forEach(acc => {
        const item = document.createElement('div');
        item.className = 'account-item';
        item.tabIndex = 0;
        item.innerHTML = `
          <span class="account-item-name">${_esc(acc.name)}</span>
          <span class="account-item-server">${_esc(acc.serverUrl)}</span>
          <button class="account-item-delete" title="Löschen">🗑️</button>
        `;
        if (activeAccount && acc.id === activeAccount.id) {
          item.style.borderColor = 'var(--accent)';
        }
        item.addEventListener('click', async () => {
          try {
            const ui = await XtreamAPI.authenticate(acc);
            acc.userInfo = ui;
            Storage.saveAccount(acc);
            Storage.setActiveAccount(acc);
            activeAccount = acc;
            _showMainApp();
            await _loadAllContent();
          } catch (e) {
            showToast('Verbindungsfehler: ' + e.message);
          }
        });
        item.querySelector('.account-item-delete').addEventListener('click', e => {
          e.stopPropagation();
          Storage.deleteAccount(acc.id);
          _renderSettingsTab();
        });
        accountsList.appendChild(item);
      });
    }
  }

  // ════════════════════════════════════════════
  // LECTURE
  // ════════════════════════════════════════════

  function _playLiveChannel(ch) {
    if (!activeAccount) { showToast('Kein aktives Konto'); return; }
    const url = XtreamAPI.liveStreamUrl(activeAccount, ch.streamId);
    Player.load({
      id: ch.id,
      title: ch.name,
      subtitle: _getCategoryName(liveCategories, ch.categoryId),
      url,
      type: 'live',
      isLive: true,
      imageUrl: ch.streamIcon || '',
      group: _getCategoryName(liveCategories, ch.categoryId),
      streamId: ch.streamId,
      categoryId: ch.categoryId,
    }, null);
  }

  function _playVod(vod) {
    if (!activeAccount) { showToast('Kein aktives Konto'); return; }
    const url = XtreamAPI.vodStreamUrl(activeAccount, vod.streamId, vod.containerExtension);
    Player.load({
      id: vod.id,
      title: vod.name,
      subtitle: vod.genre || '',
      url,
      type: 'vod',
      isLive: false,
      imageUrl: vod.streamIcon || '',
      group: _getCategoryName(vodCategories, vod.categoryId),
      streamId: vod.streamId,
      containerExtension: vod.containerExtension,
      categoryId: vod.categoryId,
    }, null);
  }

  function _playFavorite(fav) {
    if (!fav.url) { showToast('Wiedergabe-URL nicht gefunden'); return; }
    Player.load({
      id: fav.id,
      title: fav.title,
      subtitle: fav.group || '',
      url: fav.url,
      type: fav.type,
      isLive: fav.type === 'live',
      imageUrl: fav.imageUrl || '',
      group: fav.group || '',
    }, null);
  }

  function _playItem(item) {
    if (!item.url) { showToast('URL nicht gefunden'); return; }
    Player.load({
      id: item.id,
      title: item.title,
      subtitle: item.seriesName || item.group || '',
      url: item.url,
      type: item.type,
      isLive: item.type === 'live',
      imageUrl: item.imageUrl || '',
      group: item.group || '',
      seriesId: item.seriesId,
      seriesName: item.seriesName,
      seasonNum: item.seasonNum,
      episodeNum: item.episodeNum,
    }, null);
  }

  // ════════════════════════════════════════════
  // NAVIGATION ONGLETS
  // ════════════════════════════════════════════

  function switchTab(tabName) {
    _switchTabInternal(tabName);
    collapseSidebar();
  }

  function _switchTabInternal(tabName) {
    currentTab = tabName;

    // Mise à jour nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // Afficher le bon onglet
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
    });
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) targetTab.classList.add('active');

    // Charger les données si nécessaire
    if (tabName === 'favorites') _renderFavoritesTab(null);
    if (tabName === 'recents') _renderRecentsTab();
    if (tabName === 'settings') _renderSettingsTab();
    if (tabName === 'home') _renderHomeTab();

    // Focus premier élément focusable
    setTimeout(() => focusContentArea(), 100);
  }

  // ════════════════════════════════════════════
  // SIDEBAR
  // ════════════════════════════════════════════

  function expandSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.remove('collapsed');
      sidebarExpanded = true;
    }
  }

  function collapseSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.add('collapsed');
      sidebarExpanded = false;
    }
  }

  function focusContentArea() {
    const activeTab = document.getElementById('tab-' + currentTab);
    if (!activeTab) return;
    const focusable = activeTab.querySelector('[tabindex]:not([tabindex="-1"]), input, select, button');
    if (focusable) focusable.focus();
  }

  // ════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════

  function _createGridCard(item, defaultEmoji, index, tabBase, onPlay, onFav) {
    const card = document.createElement('div');
    card.className = 'grid-card';
    card.tabIndex = tabBase + index;

    const isFav = Storage.isFavorite(item.id);
    const coverSrc = item.streamIcon || item.cover || item.imageUrl || '';

    card.innerHTML = `
      ${coverSrc
        ? `<img class="grid-card-poster" src="${_esc(coverSrc)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'grid-card-poster-placeholder\\'>${defaultEmoji}</div>'">`
        : `<div class="grid-card-poster-placeholder">${defaultEmoji}</div>`
      }
      <div class="grid-card-info">
        <div class="grid-card-title">${_esc(item.name || item.title)}</div>
        <div class="grid-card-meta">${_esc(item.genre || item.rating || item.type || '')}</div>
      </div>
      ${onFav ? `<button class="grid-card-fav" title="Favori">${isFav ? '⭐' : '☆'}</button>` : ''}
    `;

    card.addEventListener('click', onPlay);
    card.addEventListener('keydown', e => { if (e.key === 'Enter') onPlay(); });

    if (onFav) {
      const favBtn = card.querySelector('.grid-card-fav');
      if (favBtn) {
        favBtn.addEventListener('click', e => {
          e.stopPropagation();
          onFav();
        });
      }
    }

    return card;
  }

  function _getCategoryName(categories, id) {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : '';
  }

  function _getTypeEmoji(type) {
    const emojis = { live: '📡', vod: '🎬', episode: '📺', series: '📺' };
    return emojis[type] || '▶️';
  }

  function _renderError(containerId, msg) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="loading-state"><p style="color:var(--danger)">⚠️ ${_esc(msg)}</p></div>`;
  }

  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Horloge ──
  function _startClock() {
    function update() {
      const el = document.getElementById('header-clock');
      if (el) {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      }
    }
    update();
    clockTimer = setInterval(update, 30000);
  }

  // ── Toast ──
  function showToast(msg, duration = 2500) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
  }

  // ── Exposition publique ──
  return {
    start,
    switchTab,
    expandSidebar,
    collapseSidebar,
    focusContentArea,
    closeSeriesModal,
    showToast,
  };
})();

// ── Démarrage au chargement de la page ──
window.addEventListener('DOMContentLoaded', () => {
  App.start();
});
