/**
 * storage.js — Gestion du stockage local pour Tizen TV
 * Utilise localStorage (disponible sur Samsung Tizen 5.0+)
 * Fallback sur IndexedDB ou mémoire si nécessaire
 */

const Storage = (() => {
  const KEYS = {
    ACCOUNTS: 'iptv_accounts_v1',
    ACTIVE_ACCOUNT: 'iptv_active_account_v1',
    RECENTS: 'iptv_recents_v2',
    FAVORITES: 'iptv_favorites_v2',
    POSITIONS: 'iptv_positions_v2',
    PREFERENCES: 'iptv_preferences_v1',
  };

  const MAX_RECENTS = 50;

  // ── Vérification disponibilité localStorage ──
  function isAvailable() {
    try {
      const test = '__test__';
      localStorage.setItem(test, '1');
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      console.warn('[Storage] localStorage non disponible:', e);
      return false;
    }
  }

  // ── Helpers JSON ──
  function getJSON(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch (e) {
      console.error('[Storage] Erreur lecture', key, e);
      return defaultValue;
    }
  }

  function setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Storage] Erreur écriture', key, e);
      return false;
    }
  }

  // ════════════════════════════════════════════
  // COMPTES XTREAM
  // ════════════════════════════════════════════

  function getAccounts() {
    return getJSON(KEYS.ACCOUNTS, []);
  }

  function saveAccount(account) {
    const accounts = getAccounts();
    const idx = accounts.findIndex(a => a.id === account.id);
    if (idx >= 0) {
      accounts[idx] = account;
    } else {
      accounts.push(account);
    }
    setJSON(KEYS.ACCOUNTS, accounts);
  }

  function deleteAccount(accountId) {
    const accounts = getAccounts().filter(a => a.id !== accountId);
    setJSON(KEYS.ACCOUNTS, accounts);
    const active = getActiveAccount();
    if (active && active.id === accountId) {
      localStorage.removeItem(KEYS.ACTIVE_ACCOUNT);
    }
  }

  function getActiveAccount() {
    return getJSON(KEYS.ACTIVE_ACCOUNT, null);
  }

  function setActiveAccount(account) {
    setJSON(KEYS.ACTIVE_ACCOUNT, account);
  }

  // ════════════════════════════════════════════
  // HISTORIQUE RÉCENT (max 50)
  // ════════════════════════════════════════════

  function getRecents() {
    return getJSON(KEYS.RECENTS, []);
  }

  function addRecent(item) {
    // item: { id, title, imageUrl, type, url, group, watchedAt, positionSeconds, durationSeconds, seriesId, seriesName, seasonNum, episodeNum }
    let recents = getRecents();
    // Retirer doublon existant
    recents = recents.filter(r => r.id !== item.id);
    // Ajouter en tête
    item.watchedAt = new Date().toISOString();
    recents.unshift(item);
    // Limiter
    if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
    setJSON(KEYS.RECENTS, recents);
  }

  function updateRecentPosition(id, positionSeconds, durationSeconds) {
    const recents = getRecents();
    const item = recents.find(r => r.id === id);
    if (item) {
      item.positionSeconds = positionSeconds;
      if (durationSeconds > 0) item.durationSeconds = durationSeconds;
      item.watchedAt = new Date().toISOString();
      setJSON(KEYS.RECENTS, recents);
    }
  }

  function clearRecents() {
    setJSON(KEYS.RECENTS, []);
  }

  // ════════════════════════════════════════════
  // POSITIONS DE LECTURE
  // ════════════════════════════════════════════

  function getPositions() {
    return getJSON(KEYS.POSITIONS, {});
  }

  function savePosition(id, seconds) {
    const positions = getPositions();
    positions[id] = { seconds, savedAt: Date.now() };
    setJSON(KEYS.POSITIONS, positions);
  }

  function getPosition(id) {
    const positions = getPositions();
    return positions[id] ? positions[id].seconds : 0;
  }

  function clearPosition(id) {
    const positions = getPositions();
    delete positions[id];
    setJSON(KEYS.POSITIONS, positions);
  }

  // ════════════════════════════════════════════
  // FAVORIS
  // ════════════════════════════════════════════

  function getFavorites() {
    return getJSON(KEYS.FAVORITES, []);
  }

  function addFavorite(item) {
    // item: { id, title, imageUrl, type, url, group, addedAt, streamId, containerExtension, categoryId }
    const favorites = getFavorites();
    if (!favorites.find(f => f.id === item.id)) {
      item.addedAt = new Date().toISOString();
      favorites.unshift(item);
      setJSON(KEYS.FAVORITES, favorites);
    }
  }

  function removeFavorite(id) {
    const favorites = getFavorites().filter(f => f.id !== id);
    setJSON(KEYS.FAVORITES, favorites);
  }

  function isFavorite(id) {
    return getFavorites().some(f => f.id === id);
  }

  function toggleFavorite(item) {
    if (isFavorite(item.id)) {
      removeFavorite(item.id);
      return false;
    } else {
      addFavorite(item);
      return true;
    }
  }

  function getFavoritesByType(type) {
    return getFavorites().filter(f => f.type === type);
  }

  // ════════════════════════════════════════════
  // PRÉFÉRENCES
  // ════════════════════════════════════════════

  function getPreferences() {
    return getJSON(KEYS.PREFERENCES, {
      quality: 'auto',
      language: 'de',
    });
  }

  function setPreference(key, value) {
    const prefs = getPreferences();
    prefs[key] = value;
    setJSON(KEYS.PREFERENCES, prefs);
  }

  // ── Exposition publique ──
  return {
    isAvailable,
    // Comptes
    getAccounts,
    saveAccount,
    deleteAccount,
    getActiveAccount,
    setActiveAccount,
    // Récents
    getRecents,
    addRecent,
    updateRecentPosition,
    clearRecents,
    // Positions
    savePosition,
    getPosition,
    clearPosition,
    // Favoris
    getFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    getFavoritesByType,
    // Préférences
    getPreferences,
    setPreference,
  };
})();
