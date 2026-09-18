/**
 * player.js — Lecteur vidéo pour Samsung Tizen TV
 * Gère HLS (via hls.js) et les flux MPEG-TS natifs
 * Compatible avec Tizen 6.0+ (Chromium 76+)
 */

const Player = (() => {

  // ── Éléments DOM ──
  let videoEl = null;
  let overlayEl = null;
  let loadingEl = null;
  let errorEl = null;

  // ── État ──
  let hlsInstance = null;
  let currentItem = null;  // { id, title, subtitle, url, type, isLive }
  let isOverlayVisible = false;
  let overlayTimer = null;
  let savePositionTimer = null;
  let onCloseCallback = null;

  const OVERLAY_TIMEOUT = 5000;  // masquer overlay après 5s
  const SEEK_STEP_SHORT = 10;    // secondes
  const SEEK_STEP_LONG = 30;     // secondes
  const SAVE_INTERVAL = 15000;   // sauvegarder position toutes les 15s

  // ════════════════════════════════════════════
  // INITIALISATION
  // ════════════════════════════════════════════

  function init() {
    videoEl = document.getElementById('main-video');
    overlayEl = document.getElementById('player-overlay');
    loadingEl = document.getElementById('player-loading');
    errorEl = document.getElementById('player-error');

    if (!videoEl) return;

    // Événements vidéo
    videoEl.addEventListener('waiting', _onWaiting);
    videoEl.addEventListener('canplay', _onCanPlay);
    videoEl.addEventListener('playing', _onPlaying);
    videoEl.addEventListener('pause', _onPause);
    videoEl.addEventListener('ended', _onEnded);
    videoEl.addEventListener('error', _onError);
    videoEl.addEventListener('timeupdate', _onTimeUpdate);

    // Boutons contrôles
    _bindButton('player-btn-playpause', _togglePlayPause);
    _bindButton('player-btn-seek-back', () => _seek(-SEEK_STEP_SHORT));
    _bindButton('player-btn-seek-fwd', () => _seek(SEEK_STEP_SHORT));
    _bindButton('player-btn-seek-back30', () => _seek(-SEEK_STEP_LONG));
    _bindButton('player-btn-seek-fwd30', () => _seek(SEEK_STEP_LONG));
    _bindButton('player-btn-close', _closePlayer);
    _bindButton('player-btn-back-from-error', _closePlayer);
    _bindButton('player-btn-retry', _retryLoad);
    _bindButton('player-btn-favorite', _toggleFavorite);
  }

  function _bindButton(id, fn) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', fn);
  }

  // ════════════════════════════════════════════
  // CHARGEMENT D'UN STREAM
  // ════════════════════════════════════════════

  function load(item, onClose) {
    currentItem = item;
    onCloseCallback = onClose || null;

    _showPlayerScreen();
    _showLoading(`Chargement de "${item.title}"...`);
    _hideError();
    _hideOverlay();

    // Rétablir position sauvegardée
    const savedPos = Storage.getPosition(item.id);

    _destroyHls();
    videoEl.src = '';
    videoEl.load();

    if (item.url.includes('.m3u8') || item.type === 'live') {
      _loadHls(item.url, savedPos);
    } else {
      _loadDirect(item.url, savedPos);
    }

    // Mise à jour UI
    document.getElementById('player-channel-name').textContent = item.title || '';
    document.getElementById('player-subtitle').textContent = item.subtitle || '';

    const liveBadge = document.getElementById('player-live-badge');
    if (item.isLive) {
      liveBadge.classList.remove('hidden');
      document.getElementById('player-progress-area').classList.add('hidden');
    } else {
      liveBadge.classList.add('hidden');
      document.getElementById('player-progress-area').classList.remove('hidden');
    }

    // Mettre à jour bouton favori
    const isFav = Storage.isFavorite(item.id);
    const favBtn = document.getElementById('player-btn-favorite');
    if (favBtn) favBtn.style.color = isFav ? '#ffaa33' : 'white';

    // Ajouter aux récents
    Storage.addRecent({
      id: item.id,
      title: item.title,
      imageUrl: item.imageUrl || '',
      type: item.type,
      url: item.url,
      group: item.group || '',
      positionSeconds: savedPos,
      durationSeconds: 0,
      seriesId: item.seriesId,
      seriesName: item.seriesName,
      seasonNum: item.seasonNum,
      episodeNum: item.episodeNum,
    });

    // Timer sauvegarde position
    _startSaveTimer();
  }

  function _loadHls(url, startPosition) {
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      hlsInstance = new Hls({
        startPosition: startPosition > 5 ? startPosition : -1,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        lowLatencyMode: false,
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch(e => console.warn('[Player] autoplay bloqué:', e));
      });
      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('[Player] HLS fatal error:', data);
          _onError(null, 'Erreur de lecture du flux HLS.');
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Tizen supporte HLS nativement
      videoEl.src = url;
      if (startPosition > 5) {
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.currentTime = startPosition;
        }, { once: true });
      }
      videoEl.play().catch(e => console.warn('[Player] autoplay bloqué:', e));
    } else {
      _loadDirect(url, startPosition);
    }
  }

  function _loadDirect(url, startPosition) {
    videoEl.src = url;
    if (startPosition > 5) {
      videoEl.addEventListener('loadedmetadata', () => {
        videoEl.currentTime = startPosition;
      }, { once: true });
    }
    videoEl.play().catch(e => console.warn('[Player] autoplay bloqué:', e));
  }

  function _destroyHls() {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  // ════════════════════════════════════════════
  // CONTRÔLES
  // ════════════════════════════════════════════

  function _togglePlayPause() {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
    } else {
      videoEl.pause();
    }
    _showOverlay();
  }

  function _seek(seconds) {
    if (!videoEl || !currentItem || currentItem.isLive) return;
    const newTime = Math.max(0, Math.min(videoEl.currentTime + seconds, videoEl.duration || 0));
    videoEl.currentTime = newTime;
    _showSeekIndicator(seconds);
    _showOverlay();
  }

  function _showSeekIndicator(seconds) {
    const indicator = document.getElementById('seek-indicator');
    const text = document.getElementById('seek-indicator-text');
    if (!indicator || !text) return;

    text.textContent = seconds > 0 ? `+${seconds}s ⏩` : `${seconds}s ⏪`;
    indicator.classList.remove('hidden');

    clearTimeout(indicator._timer);
    indicator._timer = setTimeout(() => {
      indicator.classList.add('hidden');
    }, 1500);
  }

  function _toggleFavorite() {
    if (!currentItem) return;
    const favItem = {
      id: currentItem.id,
      title: currentItem.title,
      imageUrl: currentItem.imageUrl || '',
      type: currentItem.type,
      url: currentItem.url,
      group: currentItem.group || '',
      streamId: currentItem.streamId,
      containerExtension: currentItem.containerExtension,
      categoryId: currentItem.categoryId,
    };
    const isNowFav = Storage.toggleFavorite(favItem);
    const favBtn = document.getElementById('player-btn-favorite');
    if (favBtn) favBtn.style.color = isNowFav ? '#ffaa33' : 'white';
    App.showToast(isNowFav ? '⭐ Zu Favoriten hinzugefügt' : '✕ Aus Favoriten entfernt');
  }

  // ════════════════════════════════════════════
  // OVERLAY
  // ════════════════════════════════════════════

  function _showOverlay() {
    isOverlayVisible = true;
    overlayEl.classList.add('visible');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(_hideOverlay, OVERLAY_TIMEOUT);
  }

  function _hideOverlay() {
    isOverlayVisible = false;
    overlayEl.classList.remove('visible');
  }

  function toggleOverlay() {
    if (isOverlayVisible) {
      _hideOverlay();
    } else {
      _showOverlay();
    }
  }

  // ════════════════════════════════════════════
  // ÉVÉNEMENTS VIDÉO
  // ════════════════════════════════════════════

  function _onWaiting() {
    _showLoading('Pufferung...');
  }

  function _onCanPlay() {
    _hideLoading();
    _showOverlay();
  }

  function _onPlaying() {
    _hideLoading();
    _hideError();
    const btn = document.getElementById('player-btn-playpause');
    if (btn) btn.textContent = '⏸';
  }

  function _onPause() {
    const btn = document.getElementById('player-btn-playpause');
    if (btn) btn.textContent = '▶';
    _showOverlay();
  }

  function _onEnded() {
    _saveCurrentPosition();
    _showOverlay();
    if (onCloseCallback) onCloseCallback();
  }

  function _onError(event, customMsg) {
    const msg = customMsg || 'Wiedergabefehler. Der Stream ist möglicherweise nicht verfügbar.';
    _hideLoading();
    _showError(msg);
  }

  function _onTimeUpdate() {
    if (!videoEl || currentItem?.isLive) return;

    const current = videoEl.currentTime;
    const total = videoEl.duration || 0;

    // Mise à jour temps
    document.getElementById('player-time-current').textContent = _formatTime(current);
    document.getElementById('player-time-total').textContent = _formatTime(total);

    // Barre progression
    if (total > 0) {
      const pct = (current / total) * 100;
      document.getElementById('player-progress-bar').style.width = pct + '%';
    }

    // Sauvegarder durée
    if (currentItem && total > 0) {
      Storage.updateRecentPosition(currentItem.id, Math.floor(current), Math.floor(total));
    }
  }

  // ════════════════════════════════════════════
  // GESTION POSITION / TIMER
  // ════════════════════════════════════════════

  function _startSaveTimer() {
    clearInterval(savePositionTimer);
    savePositionTimer = setInterval(_saveCurrentPosition, SAVE_INTERVAL);
  }

  function _stopSaveTimer() {
    clearInterval(savePositionTimer);
    savePositionTimer = null;
  }

  function _saveCurrentPosition() {
    if (!videoEl || !currentItem) return;
    const pos = Math.floor(videoEl.currentTime);
    if (pos > 5) {
      Storage.savePosition(currentItem.id, pos);
    }
  }

  // ════════════════════════════════════════════
  // FERMETURE / RETRY
  // ════════════════════════════════════════════

  function _closePlayer() {
    _saveCurrentPosition();
    _stopSaveTimer();
    _destroyHls();
    videoEl.pause();
    videoEl.src = '';
    videoEl.load();
    _hidePlayerScreen();
    if (onCloseCallback) onCloseCallback();
  }

  function _retryLoad() {
    if (!currentItem) return;
    _hideError();
    _showLoading('Neuer Versuch...');
    setTimeout(() => {
      if (currentItem.url.includes('.m3u8') || currentItem.type === 'live') {
        _loadHls(currentItem.url, 0);
      } else {
        _loadDirect(currentItem.url, 0);
      }
    }, 1000);
  }

  // ════════════════════════════════════════════
  // GESTION TOUCHES (appelée depuis navigation.js)
  // ════════════════════════════════════════════

  function handleKey(keyCode) {
    switch (keyCode) {
      case 'MediaPlayPause':
      case 'Enter':
      case 32:  // Espace
        _togglePlayPause();
        return true;

      case 'ArrowLeft':
      case 37:
        _seek(-SEEK_STEP_SHORT);
        return true;

      case 'ArrowRight':
      case 39:
        _seek(SEEK_STEP_SHORT);
        return true;

      case 'ArrowUp':
      case 38:
        _seek(SEEK_STEP_LONG);
        return true;

      case 'ArrowDown':
      case 40:
        _seek(-SEEK_STEP_LONG);
        return true;

      case 'MediaPlay':
        videoEl && videoEl.play();
        return true;

      case 'MediaPause':
      case 'MediaStop':
        videoEl && videoEl.pause();
        return true;

      case 'MediaFastForward':
        _seek(SEEK_STEP_LONG);
        return true;

      case 'MediaRewind':
        _seek(-SEEK_STEP_LONG);
        return true;

      // Touche rouge Samsung = ColorF0Red (keyCode 403)
      case 'ColorF0Red':
      case 403:
        _toggleFavorite();
        return true;

      case 'Back':
      case 'Backspace':
      case 10009:  // Tizen back key
        if (isOverlayVisible) {
          _hideOverlay();
        } else {
          _closePlayer();
        }
        return true;

      default:
        if (!isOverlayVisible) {
          _showOverlay();
          return true;
        }
        return false;
    }
  }

  function isPlayerVisible() {
    return !document.getElementById('player-screen').classList.contains('hidden');
  }

  // ════════════════════════════════════════════
  // UI HELPERS
  // ════════════════════════════════════════════

  function _showPlayerScreen() {
    document.getElementById('player-screen').classList.remove('hidden');
  }

  function _hidePlayerScreen() {
    document.getElementById('player-screen').classList.add('hidden');
    clearTimeout(overlayTimer);
    _hideOverlay();
  }

  function _showLoading(msg) {
    loadingEl.classList.remove('hidden');
    const txt = document.getElementById('player-loading-text');
    if (txt) txt.textContent = msg || 'Wird geladen...';
    errorEl.classList.add('hidden');
  }

  function _hideLoading() {
    loadingEl.classList.add('hidden');
  }

  function _showError(msg) {
    errorEl.classList.remove('hidden');
    const txt = document.getElementById('player-error-text');
    if (txt) txt.textContent = msg;
    _hideLoading();
  }

  function _hideError() {
    errorEl.classList.add('hidden');
  }

  // ── Formatage temps ──
  function _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    if (h > 0) return `${h}:${m}:${s}`;
    return `${m}:${s}`;
  }

  // ── Exposition publique ──
  return {
    init,
    load,
    handleKey,
    isPlayerVisible,
    toggleOverlay,
    closePlayer: _closePlayer,
  };
})();
