/**
 * xtream-api.js — Client API Xtream Codes pour Tizen TV
 * Compatible avec Samsung Tizen 6.0+ (Fetch API disponible)
 */

const XtreamAPI = (() => {

  // ── Timeout pour les requêtes réseau ──
  const TIMEOUT_MS = 30000;

  /**
   * Fetch avec timeout
   */
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Construit l'URL de l'API Xtream
   */
  function buildApiUrl(account) {
    let base = account.serverUrl.trim();
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      base = 'http://' + base;
    }
    if (base.endsWith('/')) base = base.slice(0, -1);
    return `${base}/player_api.php?username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password)}`;
  }

  function buildStreamBase(account) {
    let base = account.serverUrl.trim();
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      base = 'http://' + base;
    }
    if (base.endsWith('/')) base = base.slice(0, -1);
    return base;
  }

  /**
   * Authentification — renvoie les infos utilisateur
   */
  async function authenticate(account) {
    const url = buildApiUrl(account) + '&action=get_user_info';
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data.user_info) {
      throw new Error('Identifiants incorrects ou serveur invalide');
    }
    const ui = data.user_info;
    return {
      username: ui.username || account.username,
      status: ui.status || 'active',
      expDate: ui.exp_date ? String(ui.exp_date) : '',
      maxConnections: parseInt(ui.max_connections || '1'),
      activeConnections: parseInt(ui.active_connections || '0'),
      isTrial: ui.is_trial === '1' || ui.is_trial === 1,
    };
  }

  // ─── URL de stream ───

  function liveStreamUrl(account, streamId) {
    const base = buildStreamBase(account);
    return `${base}/live/${account.username}/${account.password}/${streamId}.ts`;
  }

  function vodStreamUrl(account, streamId, ext) {
    const base = buildStreamBase(account);
    return `${base}/movie/${account.username}/${account.password}/${streamId}.${ext || 'mp4'}`;
  }

  function seriesStreamUrl(account, streamId, ext) {
    const base = buildStreamBase(account);
    return `${base}/series/${account.username}/${account.password}/${streamId}.${ext || 'mkv'}`;
  }

  // ─── Catégories ───

  async function getLiveCategories(account) {
    return _fetchList(account, 'get_live_categories', _mapCategory);
  }

  async function getVodCategories(account) {
    return _fetchList(account, 'get_vod_categories', _mapCategory);
  }

  async function getSeriesCategories(account) {
    return _fetchList(account, 'get_series_categories', _mapCategory);
  }

  // ─── Contenus ───

  async function getLiveChannels(account, categoryId = null) {
    const action = categoryId
      ? `get_live_streams&category_id=${categoryId}`
      : 'get_live_streams';
    return _fetchList(account, action, _mapChannel);
  }

  async function getVodStreams(account, categoryId = null) {
    const action = categoryId
      ? `get_vod_streams&category_id=${categoryId}`
      : 'get_vod_streams';
    return _fetchList(account, action, _mapVod);
  }

  async function getSeries(account, categoryId = null) {
    const action = categoryId
      ? `get_series&category_id=${categoryId}`
      : 'get_series';
    return _fetchList(account, action, _mapSeries);
  }

  async function getSeriesDetail(account, seriesId) {
    const url = `${buildApiUrl(account)}&action=get_series_info&series_id=${seriesId}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const data = await response.json();

    const series = _mapSeries(data.info || {});
    series.id = String(seriesId);

    const episodesMap = data.episodes;
    const seasons = [];

    if (episodesMap && typeof episodesMap === 'object') {
      const sortedKeys = Object.keys(episodesMap).sort((a, b) => {
        return (parseInt(a) || 0) - (parseInt(b) || 0);
      });
      for (const key of sortedKeys) {
        const list = episodesMap[key];
        if (Array.isArray(list) && list.length > 0) {
          seasons.push({
            seasonNumber: key,
            displayName: `Saison ${key}`,
            episodes: list.map(_mapEpisode),
          });
        }
      }
    }

    return { series, seasons };
  }

  // ─── Mappers ───

  function _mapCategory(m) {
    return {
      id: String(m.category_id || ''),
      name: m.category_name || 'Inconnu',
      parentId: parseInt(m.parent_id || 0),
    };
  }

  function _mapChannel(m) {
    return {
      id: String(m.stream_id || ''),
      name: m.name || '',
      streamId: String(m.stream_id || ''),
      streamIcon: m.stream_icon || '',
      categoryId: String(m.category_id || ''),
      epgChannelId: m.epg_channel_id || '',
    };
  }

  function _mapVod(m) {
    return {
      id: String(m.stream_id || ''),
      name: m.name || '',
      streamId: String(m.stream_id || ''),
      streamIcon: m.stream_icon || '',
      categoryId: String(m.category_id || ''),
      containerExtension: m.container_extension || 'mp4',
      rating: String(m.rating || ''),
      plot: m.plot || '',
      genre: m.genre || '',
      releaseDate: m.releasedate || '',
    };
  }

  function _mapSeries(m) {
    return {
      id: String(m.series_id || m.id || ''),
      name: m.name || '',
      cover: m.cover || '',
      categoryId: String(m.category_id || ''),
      plot: m.plot || '',
      genre: m.genre || '',
      rating: String(m.rating || ''),
      releaseDate: m.releaseDate || m.year || '',
    };
  }

  function _mapEpisode(m) {
    return {
      id: String(m.id || ''),
      title: m.title || '',
      episodeNum: String(m.episode_num || ''),
      season: String(m.season || ''),
      plot: m.plot || '',
      duration: (m.info && m.info.duration) ? m.info.duration : '',
      rating: String(m.rating || ''),
      streamId: String(m.id || ''),
      containerExtension: m.container_extension || 'mkv',
      cover: (m.info && m.info.movie_image) ? m.info.movie_image : '',
      displayTitle: m.title || `Épisode ${m.episode_num || ''}`,
    };
  }

  // ─── Helper fetch liste ───

  async function _fetchList(account, action, mapper) {
    const url = `${buildApiUrl(account)}&action=${action}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const text = await response.text();
    if (!text || text === 'null') return [];
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Réponse invalide du serveur');
    }
    if (!Array.isArray(data)) return [];
    return data.map(mapper).filter(Boolean);
  }

  // ─── Données démo ───

  function getDemoData() {
    return {
      account: {
        id: 'demo',
        name: 'Démo IPTV',
        serverUrl: 'http://demo.example.com',
        username: 'demo',
        password: 'demo',
        addedAt: new Date().toISOString(),
        userInfo: {
          username: 'Démo',
          status: 'Active',
          expDate: '',
          maxConnections: 1,
          activeConnections: 0,
          isTrial: true,
        },
      },
      liveCategories: [
        { id: 'demo_news', name: '📰 Actualités', parentId: 0 },
        { id: 'demo_sport', name: '⚽ Sport', parentId: 0 },
        { id: 'demo_music', name: '🎵 Musique', parentId: 0 },
      ],
      liveChannels: [
        { id: 'd1', name: 'BFM TV', streamId: 'd1', streamIcon: '', categoryId: 'demo_news' },
        { id: 'd2', name: 'CNEWS', streamId: 'd2', streamIcon: '', categoryId: 'demo_news' },
        { id: 'd3', name: 'LCI', streamId: 'd3', streamIcon: '', categoryId: 'demo_news' },
        { id: 'd4', name: 'beIN Sports 1', streamId: 'd4', streamIcon: '', categoryId: 'demo_sport' },
        { id: 'd5', name: 'Canal+ Sport', streamId: 'd5', streamIcon: '', categoryId: 'demo_sport' },
        { id: 'd6', name: 'RFM TV', streamId: 'd6', streamIcon: '', categoryId: 'demo_music' },
      ],
      vodCategories: [
        { id: 'demo_action', name: '💥 Action', parentId: 0 },
        { id: 'demo_comedy', name: '😂 Comédie', parentId: 0 },
      ],
      vodStreams: [
        { id: 'v1', name: 'Film Démo 1', streamId: 'v1', streamIcon: '', categoryId: 'demo_action', containerExtension: 'mp4', rating: '7.5', plot: 'Un film de démonstration.', genre: 'Action', releaseDate: '2023' },
        { id: 'v2', name: 'Film Démo 2', streamId: 'v2', streamIcon: '', categoryId: 'demo_comedy', containerExtension: 'mp4', rating: '6.8', plot: 'Un film comique de démonstration.', genre: 'Comédie', releaseDate: '2022' },
      ],
      seriesCategories: [
        { id: 'demo_drama', name: '🎭 Drame', parentId: 0 },
      ],
      seriesList: [
        { id: 's1', name: 'Série Démo', cover: '', categoryId: 'demo_drama', plot: 'Une série de démonstration.', genre: 'Drame', rating: '8.0', releaseDate: '2021' },
      ],
    };
  }

  // ── Exposition publique ──
  return {
    authenticate,
    liveStreamUrl,
    vodStreamUrl,
    seriesStreamUrl,
    getLiveCategories,
    getVodCategories,
    getSeriesCategories,
    getLiveChannels,
    getVodStreams,
    getSeries,
    getSeriesDetail,
    getDemoData,
  };
})();
