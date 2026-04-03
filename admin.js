const KEYAUTH_CONFIG = {
  enabled: true,
  apiUrl: 'https://keyauth.win/api/1.3/',
  appName: 'InvItems',
  ownerId: 'RZsbvRZczd',
  version: '1.0',
  hash: '',
  token: '',
  thash: '',
  code: ''
};

const els = {
  loginScreen: document.getElementById('login-screen'),
  appShell: document.getElementById('app-shell'),
  loginName: document.getElementById('login-name'),
  loginKey: document.getElementById('login-key'),
  loginEnter: document.getElementById('login-enter'),
  loginStatus: document.getElementById('login-status'),
  loginDevice: document.getElementById('login-device'),
  whoBadge: document.getElementById('who-badge'),
  deviceBadge: document.getElementById('device-badge'),
  planBadge: document.getElementById('plan-badge'),
  logoutBtn: document.getElementById('logout-btn'),
  owner: document.getElementById('gh-owner'),
  repo: document.getElementById('gh-repo'),
  branch: document.getElementById('gh-branch'),
  token: document.getElementById('gh-token'),
  remember: document.getElementById('remember-config'),
  loadProducts: document.getElementById('load-products'),
  saveAll: document.getElementById('save-all'),
  saveDraft: document.getElementById('save-draft'),
  newProduct: document.getElementById('new-product'),
  form: document.getElementById('product-form'),
  editingUid: document.getElementById('editing-uid'),
  name: document.getElementById('name'),
  price: document.getElementById('price'),
  status: document.getElementById('status'),
  categories: document.getElementById('categories'),
  desc1: document.getElementById('desc1'),
  desc2: document.getElementById('desc2'),
  desc3: document.getElementById('desc3'),
  images: document.getElementById('images'),
  existingPreview: document.getElementById('existing-preview'),
  newPreview: document.getElementById('new-preview'),
  statusBox: document.getElementById('status-box'),
  productsList: document.getElementById('products-admin-list'),
  productCount: document.getElementById('product-count'),
  pendingCount: document.getElementById('pending-count'),
  searchProducts: document.getElementById('search-products'),
  editorTitle: document.getElementById('editor-title')
};

const STORAGE_KEY = 'hacienda-real-admin-config-v3';
const AUTH_STORAGE_KEY = 'hacienda-real-admin-auth-v1';
const ACTIVE_SESSION_KEY = 'hacienda-real-admin-active-session-v1';
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const LEASE_REFRESH_MS = 15000;

const state = {
  user: null,
  deviceId: '',
  keyauthSessionId: '',
  tabId: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  activityTimer: null,
  leaseInterval: null,
  workingProducts: [],
  dirty: false,
  isSaving: false,
  searchTerm: '',
  pendingExistingImages: [],
  pendingNewFiles: [],
  objectUrls: []
};

function showStatus(message, type = 'info') {
  els.statusBox.textContent = message;
  els.statusBox.className = `status-box ${type === 'success' ? 'success' : ''} ${type === 'error' ? 'error' : ''}`.trim();
  els.statusBox.classList.remove('hidden');
}

function hideStatus() {
  els.statusBox.classList.add('hidden');
}

function showLoginStatus(message, type = 'info') {
  els.loginStatus.textContent = message;
  els.loginStatus.className = `status-box ${type === 'success' ? 'success' : ''} ${type === 'error' ? 'error' : ''}`.trim();
  els.loginStatus.classList.remove('hidden');
}

function hideLoginStatus() {
  els.loginStatus.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'producto';
}

function makeUid() {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO() {
  return new Date().toISOString();
}

async function sha256(text) {
  const enc = new TextEncoder().encode(String(text || ''));
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function getDeviceId() {
  const raw = [
    navigator.userAgent || '',
    navigator.language || '',
    screen.width || 0,
    screen.height || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.platform || '',
    navigator.hardwareConcurrency || 0
  ].join('|');
  const hash = await sha256(raw);
  return `WEB-${hash.slice(0, 32).toUpperCase()}`;
}

function formatExpiry(unixValue) {
  if (!unixValue) return 'Sin fecha';
  const num = Number(unixValue);
  if (!Number.isFinite(num) || num <= 0) return 'Sin fecha';
  return new Date(num * 1000).toLocaleString('es-HN');
}

function fixMojibake(value) {
  let current = String(value ?? '');
  for (let i = 0; i < 4; i += 1) {
    if (!/[ÃÂâð]/.test(current)) break;
    try {
      const next = decodeURIComponent(escape(current));
      if (!next || next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function cleanText(value) {
  return fixMojibake(String(value ?? '').trim());
}

function parseCategories(raw) {
  return String(raw || '')
    .split(',')
    .map(v => cleanText(v))
    .filter(Boolean);
}

function normalizeProduct(product = {}) {
  const categoriesRaw = Array.isArray(product.categories)
    ? product.categories
    : (typeof product.categories === 'string'
      ? product.categories.split(',')
      : (typeof product.category === 'string' ? [product.category] : []));

  const descriptionsRaw = Array.isArray(product.description)
    ? product.description
    : [product.description].filter(Boolean);

  const imagesRaw = Array.isArray(product.images)
    ? product.images
    : [product.images].filter(Boolean);

  return {
    uid: product.uid || makeUid(),
    name: cleanText(product.name || ''),
    price: Number(product.price || 0),
    categories: categoriesRaw.map(cleanText).filter(Boolean),
    description: descriptionsRaw.map(cleanText).filter(Boolean).slice(0, 3),
    status: /(agotado|sin\s*stock|no\s*disponible)/i.test(String(product.status || '')) ? 'agotado' : 'disponible',
    images: imagesRaw.map(v => String(v || '').trim()).filter(Boolean),
    _newFiles: []
  };
}

function normalizeProductsArray(list) {
  return Array.isArray(list) ? list.map(normalizeProduct) : [];
}

function setDirty(value) {
  state.dirty = Boolean(value);
  els.pendingCount.textContent = state.dirty ? 'Cambios pendientes' : 'Sin cambios pendientes';
  els.pendingCount.classList.toggle('badge-warning', state.dirty);
}

function getConfig() {
  return {
    owner: els.owner.value.trim(),
    repo: els.repo.value.trim(),
    branch: els.branch.value.trim() || 'main',
    token: els.token.value.trim()
  };
}

function ensureAuthenticated() {
  if (!state.user) {
    throw new Error('Debes iniciar sesión con una licencia válida antes de usar el admin.');
  }
}

function validateConfig(requireToken = true) {
  ensureAuthenticated();
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo || !cfg.branch || (requireToken && !cfg.token)) {
    throw new Error('Completa owner, repositorio, rama y token de GitHub.');
  }
  return cfg;
}

function saveConfigIfNeeded() {
  if (!els.remember.checked) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const cfg = getConfig();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch
  }));
}

function loadSavedConfig() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw);
    els.owner.value = cfg.owner || '';
    els.repo.value = cfg.repo || '';
    els.branch.value = cfg.branch || 'main';
    els.remember.checked = true;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveAuthSession() {
  if (!state.user) return;
  const payload = { ...state.user, lastActivity: Date.now() };
  state.user.lastActivity = payload.lastActivity;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

function loadAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  state.user = null;
  state.keyauthSessionId = '';
}

function readLease() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || 'null');
  } catch {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    return null;
  }
}

function leaseIsFresh(lease) {
  return Boolean(lease && lease.lastSeen && (Date.now() - Number(lease.lastSeen) < SESSION_TIMEOUT_MS));
}

function acquireSessionLease() {
  const current = readLease();
  if (leaseIsFresh(current) && current.tabId !== state.tabId) {
    throw new Error('Ya existe una sesión activa en este navegador/dispositivo. Cierra la otra pestaña o espera a que expire.');
  }
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
    tabId: state.tabId,
    deviceId: state.deviceId,
    userName: state.user?.name || '',
    lastSeen: Date.now()
  }));
}

function refreshSessionLease() {
  if (!state.user) return;
  const current = readLease();
  if (current && current.tabId && current.tabId !== state.tabId && leaseIsFresh(current)) {
    logoutAuth('Se detectó otra sesión activa para este admin. Esta ventana fue cerrada por seguridad.', 'error');
    return;
  }
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
    tabId: state.tabId,
    deviceId: state.deviceId,
    userName: state.user?.name || '',
    lastSeen: Date.now()
  }));
}

function releaseSessionLease() {
  const current = readLease();
  if (current?.tabId === state.tabId) {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

function clearGitHubToken() {
  els.token.value = '';
}

function stopActivityTracking() {
  clearTimeout(state.activityTimer);
  state.activityTimer = null;
  clearInterval(state.leaseInterval);
  state.leaseInterval = null;
}

function startActivityTracking() {
  stopActivityTracking();
  state.activityTimer = setTimeout(() => {
    logoutAuth('La sesión se cerró automáticamente por más de 10 minutos de inactividad.', 'error');
  }, SESSION_TIMEOUT_MS);

  state.leaseInterval = setInterval(() => {
    if (!state.user) return;
    saveAuthSession();
    refreshSessionLease();
  }, LEASE_REFRESH_MS);
}

function touchAuthenticatedActivity() {
  if (!state.user) return;
  saveAuthSession();
  refreshSessionLease();
  startActivityTracking();
}

function renderUserBadges() {
  els.whoBadge.textContent = `Usuario: ${state.user?.name || '-'}`;
  els.deviceBadge.textContent = `Dispositivo: ${state.deviceId.slice(0, 18)}...`;
  const plan = state.user?.subscription || state.user?.subscriptionLevel || 'Licencia activa';
  const expiry = formatExpiry(state.user?.expiresUnix);
  els.planBadge.textContent = `Licencia: ${plan} · ${expiry}`;
}

function showLogin(message = '', type = 'info') {
  els.appShell.classList.add('hidden');
  els.loginScreen.classList.remove('hidden');
  els.loginKey.value = '';
  renderUserBadges();
  if (message) showLoginStatus(message, type);
  else hideLoginStatus();
}

function showApp() {
  renderUserBadges();
  els.loginScreen.classList.add('hidden');
  els.appShell.classList.remove('hidden');
  hideLoginStatus();
  hideStatus();
  touchAuthenticatedActivity();
}

function logoutAuth(message = 'Sesión cerrada.', type = 'info') {
  stopActivityTracking();
  clearGitHubToken();
  clearAuthSession();
  releaseSessionLease();
  showLogin(message, type);
}

function keyAuthIsConfigured() {
  return (
    KEYAUTH_CONFIG.enabled &&
    KEYAUTH_CONFIG.appName &&
    KEYAUTH_CONFIG.ownerId &&
    !KEYAUTH_CONFIG.appName.includes('PON_AQUI') &&
    !KEYAUTH_CONFIG.ownerId.includes('PON_AQUI')
  );
}

async function keyAuthRequest(params) {
  const url = new URL(KEYAUTH_CONFIG.apiUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('KeyAuth respondió algo no válido.');
  }
  if (!res.ok) {
    throw new Error(data.message || `Error HTTP ${res.status}`);
  }
  return data;
}

async function keyAuthInit() {
  if (state.keyauthSessionId) return state.keyauthSessionId;
  const data = await keyAuthRequest({
    type: 'init',
    ver: KEYAUTH_CONFIG.version || '',
    name: KEYAUTH_CONFIG.appName || '',
    ownerid: KEYAUTH_CONFIG.ownerId || '',
    hash: KEYAUTH_CONFIG.hash || '',
    token: KEYAUTH_CONFIG.token || '',
    thash: KEYAUTH_CONFIG.thash || ''
  });

  if (!data.success || !data.sessionid) {
    throw new Error(data.message || 'No se pudo inicializar KeyAuth.');
  }

  state.keyauthSessionId = data.sessionid;
  return state.keyauthSessionId;
}

async function keyAuthLicenseLogin(licenseKey, hwid) {
  await keyAuthInit();
  const data = await keyAuthRequest({
    type: 'license',
    key: licenseKey,
    sessionid: state.keyauthSessionId,
    name: KEYAUTH_CONFIG.appName || '',
    ownerid: KEYAUTH_CONFIG.ownerId || '',
    hwid,
    code: KEYAUTH_CONFIG.code || ''
  });

  if (!data.success) {
    throw new Error(data.message || 'Licencia inválida.');
  }
  return data;
}

async function doLogin() {
  const name = cleanText(els.loginName.value) || 'Administrador';
  const key = els.loginKey.value.trim();

  if (!key) {
    showLoginStatus('Escribe una key válida.', 'error');
    return;
  }
  if (!keyAuthIsConfigured()) {
    showLoginStatus('KeyAuth no está configurado correctamente en este panel.', 'error');
    return;
  }

  els.loginEnter.disabled = true;
  showLoginStatus('Validando licencia con KeyAuth...', 'info');

  try {
    const keyauthData = await keyAuthLicenseLogin(key, state.deviceId);
    const sub = Array.isArray(keyauthData?.info?.subscriptions) ? keyauthData.info.subscriptions[0] : null;

    state.user = {
      id: makeUid(),
      name: keyauthData?.info?.username || name,
      keyMasked: `${key.slice(0, 4)}****`,
      deviceId: state.deviceId,
      authProvider: 'keyauth',
      keyauthUsername: keyauthData?.info?.username || '',
      keyauthHwid: keyauthData?.info?.hwid || state.deviceId,
      subscription: sub?.subscription || '',
      subscriptionLevel: sub?.level || '',
      expiresUnix: sub?.expiry || '',
      lastActivity: Date.now()
    };

    acquireSessionLease();
    saveAuthSession();
    showApp();
    showStatus('Acceso concedido. Ya puedes administrar el catálogo.', 'success');
  } catch (error) {
    console.error(error);
    clearAuthSession();
    releaseSessionLease();
    showLoginStatus(error.message || 'No se pudo validar la licencia.', 'error');
  } finally {
    els.loginEnter.disabled = false;
  }
}

function tryRestoreSession() {
  const saved = loadAuthSession();
  if (!saved) {
    showLogin();
    return;
  }

  if (saved.deviceId !== state.deviceId) {
    clearAuthSession();
    showLogin('Esta licencia estaba ligada a otro navegador/dispositivo. Vuelve a iniciar sesión.', 'error');
    return;
  }

  if (!saved.lastActivity || Date.now() - Number(saved.lastActivity) >= SESSION_TIMEOUT_MS) {
    clearAuthSession();
    releaseSessionLease();
    showLogin('La sesión anterior ya expiró. Vuelve a escribir tu key.', 'error');
    return;
  }

  state.user = saved;
  try {
    acquireSessionLease();
    showApp();
  } catch (error) {
    clearAuthSession();
    showLogin(error.message || 'No se pudo restaurar la sesión.', 'error');
  }
}

function revokePreviewUrls() {
  state.objectUrls.forEach(url => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function renderImageCard(src, caption, index, type) {
  return `
    <div class="preview-card">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}">
      <button class="remove-image" type="button" data-remove-image="${type}" data-index="${index}">×</button>
      <div class="caption">${escapeHtml(caption)}</div>
    </div>
  `;
}

function renderEditorPreviews() {
  revokePreviewUrls();

  if (!state.pendingExistingImages.length) {
    els.existingPreview.innerHTML = '<div class="muted-empty">Sin imágenes actuales.</div>';
  } else {
    els.existingPreview.innerHTML = state.pendingExistingImages
      .map((src, index) => renderImageCard(src, `Imagen actual ${index + 1}`, index, 'existing'))
      .join('');
  }

  if (!state.pendingNewFiles.length) {
    els.newPreview.innerHTML = '<div class="muted-empty">No hay imágenes nuevas pendientes.</div>';
  } else {
    els.newPreview.innerHTML = state.pendingNewFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      state.objectUrls.push(url);
      return renderImageCard(url, file.name, index, 'new');
    }).join('');
  }
}

function clearEditor({ keepStatus = true } = {}) {
  els.editingUid.value = '';
  els.name.value = '';
  els.price.value = '';
  if (!keepStatus) els.status.value = 'disponible';
  els.categories.value = '';
  els.desc1.value = '';
  els.desc2.value = '';
  els.desc3.value = '';
  els.images.value = '';
  state.pendingExistingImages = [];
  state.pendingNewFiles = [];
  els.editorTitle.textContent = 'Nuevo producto';
  renderEditorPreviews();
}

function fillEditor(product) {
  els.editingUid.value = product.uid;
  els.name.value = product.name || '';
  els.price.value = Number(product.price || 0);
  els.status.value = product.status || 'disponible';
  els.categories.value = (product.categories || []).join(', ');
  els.desc1.value = product.description?.[0] || '';
  els.desc2.value = product.description?.[1] || '';
  els.desc3.value = product.description?.[2] || '';
  els.images.value = '';
  state.pendingExistingImages = [...(product.images || [])];
  state.pendingNewFiles = [...(product._newFiles || [])];
  els.editorTitle.textContent = `Editando: ${product.name}`;
  renderEditorPreviews();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentEditorProduct() {
  const product = {
    uid: els.editingUid.value || makeUid(),
    name: cleanText(els.name.value),
    price: Number(els.price.value || 0),
    categories: parseCategories(els.categories.value),
    description: [els.desc1.value, els.desc2.value, els.desc3.value].map(cleanText).filter(Boolean),
    status: els.status.value,
    images: [...state.pendingExistingImages],
    _newFiles: [...state.pendingNewFiles]
  };

  if (!product.name) throw new Error('Escribe el nombre del producto.');
  if (!Number.isFinite(product.price) || product.price < 0) throw new Error('El precio no es válido.');
  if (!product.description.length) throw new Error('Agrega al menos una descripción.');
  if (!product.images.length && !product._newFiles.length) throw new Error('Debes dejar al menos una imagen actual o nueva.');
  return product;
}

function renderProductsList() {
  const list = state.workingProducts.filter(product => {
    if (!state.searchTerm) return true;
    const haystack = `${product.name} ${(product.categories || []).join(' ')}`.toLowerCase();
    return haystack.includes(state.searchTerm);
  });

  els.productCount.textContent = `${state.workingProducts.length} producto${state.workingProducts.length === 1 ? '' : 's'}`;

  if (!list.length) {
    els.productsList.innerHTML = '<div class="muted-empty">No hay productos cargados o el filtro no encontró resultados.</div>';
    return;
  }

  els.productsList.innerHTML = list.map(product => {
    const available = product.status !== 'agotado';
    const categories = (product.categories || []).join(', ') || 'Sin categoría';
    const pendingImages = (product._newFiles || []).length;
    const image = product.images?.[0] || '';

    return `
      <article class="admin-item">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}">
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <p>L ${Number(product.price || 0).toFixed(2)}</p>
          <div class="meta-row">
            <span class="pill ${available ? 'available' : 'soldout'}">${available ? 'Disponible' : 'Agotado'}</span>
            <span class="pill">${escapeHtml(categories)}</span>
            <span class="pill draft">${pendingImages} imágenes nuevas</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn ghost small" type="button" data-action="edit" data-uid="${product.uid}">Editar</button>
          <button class="btn ghost small" type="button" data-action="duplicate" data-uid="${product.uid}">Duplicar</button>
          <button class="btn warn small" type="button" data-action="toggle" data-uid="${product.uid}">${available ? 'Marcar agotado' : 'Marcar disponible'}</button>
          <button class="btn danger small" type="button" data-action="delete" data-uid="${product.uid}">Eliminar</button>
        </div>
      </article>
    `;
  }).join('');
}

function upsertWorkingProduct(product) {
  const normalized = normalizeProduct(product);
  normalized.uid = product.uid || normalized.uid;
  normalized.images = [...(product.images || [])];
  normalized._newFiles = [...(product._newFiles || [])];

  const index = state.workingProducts.findIndex(item => item.uid === normalized.uid);
  if (index >= 0) state.workingProducts[index] = normalized;
  else state.workingProducts.unshift(normalized);

  setDirty(true);
  renderProductsList();
}

async function fetchPublicProducts() {
  const cfg = validateConfig(false);
  showStatus('Cargando productos desde GitHub...');
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${encodeURIComponent(cfg.branch)}/products.json?v=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`No se pudo leer products.json (${res.status}). Revisa owner, repo, rama y que exista el archivo.`);
  }
  const data = await res.json();
  state.workingProducts = normalizeProductsArray(data);
  setDirty(false);
  renderProductsList();
  clearEditor();
  showStatus('Productos cargados correctamente.', 'success');
}

async function githubRequest(path, method = 'GET', body = null, cfg = null) {
  const config = cfg || validateConfig(true);
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const res = await fetch(url + (method === 'GET' ? `?ref=${encodeURIComponent(config.branch)}` : ''), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || `GitHub respondió ${res.status}.`);
  }
  return payload;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function compressImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  const maxSide = 1600;
  let { width, height } = bitmap;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error(`No se pudo comprimir la imagen ${file.name}.`);
  const arrayBuffer = await blob.arrayBuffer();
  return {
    base64: arrayBufferToBase64(arrayBuffer),
    extension: 'jpg'
  };
}

async function uploadImage(file, productSlug, index, cfg) {
  const compressed = await compressImage(file);
  const fileName = `${Date.now()}-${productSlug}-${index + 1}.${compressed.extension}`;
  const repoPath = `images/admin/${fileName}`;

  await githubRequest(repoPath, 'PUT', {
    message: `Agregar imagen ${fileName}`,
    content: compressed.base64,
    branch: cfg.branch
  }, cfg);

  return repoPath;
}

async function getRepoProducts(cfg) {
  const data = await githubRequest('products.json', 'GET', null, cfg);
  const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  return { sha: data.sha, products: normalizeProductsArray(JSON.parse(decoded)) };
}

async function saveRepoProducts(products, sha, message, cfg) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(products, null, 2))));
  await githubRequest('products.json', 'PUT', { message, content, sha, branch: cfg.branch }, cfg);
}

function finalizeProductForSave(product) {
  return {
    name: cleanText(product.name),
    price: Number(product.price || 0),
    categories: (product.categories || []).map(cleanText).filter(Boolean),
    description: (product.description || []).map(cleanText).filter(Boolean),
    status: product.status === 'agotado' ? 'agotado' : 'disponible',
    images: (product.images || []).filter(Boolean)
  };
}

function collectImageSet(products) {
  const set = new Set();
  products.forEach(product => (product.images || []).forEach(path => set.add(path)));
  return set;
}

async function deleteRepoFileIfPossible(path, cfg) {
  try {
    const fileData = await githubRequest(path, 'GET', null, cfg);
    await githubRequest(path, 'DELETE', {
      message: `Eliminar archivo huérfano: ${path}`,
      sha: fileData.sha,
      branch: cfg.branch
    }, cfg);
  } catch (error) {
    console.warn('No se pudo eliminar archivo huérfano:', path, error);
  }
}

async function saveAllChanges() {
  if (state.isSaving) return;
  const cfg = validateConfig(true);
  saveConfigIfNeeded();

  state.isSaving = true;
  els.saveAll.disabled = true;
  els.saveDraft.disabled = true;
  try {
    touchAuthenticatedActivity();
    showStatus('Preparando cambios y sincronizando con GitHub...');
    const repoData = await getRepoProducts(cfg);
    const oldImageSet = collectImageSet(repoData.products);

    const finalProducts = [];
    for (const product of state.workingProducts) {
      const productSlug = slugify(product.name || 'producto');
      const uploadedPaths = [];
      const newFiles = product._newFiles || [];

      for (let i = 0; i < newFiles.length; i += 1) {
        showStatus(`Subiendo imágenes: ${product.name} (${i + 1}/${newFiles.length})...`);
        uploadedPaths.push(await uploadImage(newFiles[i], productSlug, i, cfg));
      }

      const merged = {
        ...product,
        images: [...(product.images || []), ...uploadedPaths],
        _newFiles: []
      };
      finalProducts.push(finalizeProductForSave(merged));
    }

    showStatus('Guardando products.json...');
    await saveRepoProducts(finalProducts, repoData.sha, 'Actualizar catálogo desde admin protegido', cfg);

    const newImageSet = collectImageSet(finalProducts);
    const orphanedAdminImages = [...oldImageSet].filter(path => path.startsWith('images/admin/') && !newImageSet.has(path));
    for (const path of orphanedAdminImages) {
      showStatus(`Limpiando imagen sin uso: ${path}`);
      await deleteRepoFileIfPossible(path, cfg);
    }

    state.workingProducts = normalizeProductsArray(finalProducts);
    setDirty(false);
    renderProductsList();
    clearEditor();
    showStatus('Todos los cambios se guardaron correctamente en GitHub.', 'success');
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'No se pudieron guardar los cambios.', 'error');
  } finally {
    state.isSaving = false;
    els.saveAll.disabled = false;
    els.saveDraft.disabled = false;
  }
}

function saveDraftFromEditor() {
  try {
    ensureAuthenticated();
    const product = currentEditorProduct();
    upsertWorkingProduct(product);
    showStatus(`Borrador guardado: ${product.name}`, 'success');
    clearEditor();
  } catch (error) {
    showStatus(error.message || 'No se pudo guardar el borrador.', 'error');
  }
}

function removeEditorImage(type, index) {
  if (type === 'existing') state.pendingExistingImages.splice(index, 1);
  if (type === 'new') state.pendingNewFiles.splice(index, 1);
  renderEditorPreviews();
}

function onProductsListClick(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const uid = btn.dataset.uid;
  const action = btn.dataset.action;
  const index = state.workingProducts.findIndex(item => item.uid === uid);
  const product = state.workingProducts[index];
  if (!product) return;

  if (action === 'edit') {
    fillEditor(product);
    return;
  }

  if (action === 'duplicate') {
    const copy = { ...product, uid: makeUid(), name: `${product.name} copia`, images: [...(product.images || [])], _newFiles: [] };
    state.workingProducts.unshift(copy);
    setDirty(true);
    renderProductsList();
    showStatus(`Producto duplicado: ${copy.name}`, 'success');
    return;
  }

  if (action === 'toggle') {
    product.status = product.status === 'agotado' ? 'disponible' : 'agotado';
    setDirty(true);
    renderProductsList();
    return;
  }

  if (action === 'delete') {
    const confirmed = confirm(`¿Eliminar el producto "${product.name}" del borrador actual?`);
    if (!confirmed) return;
    state.workingProducts.splice(index, 1);
    if (els.editingUid.value === uid) clearEditor();
    setDirty(true);
    renderProductsList();
  }
}

function handleImageSelection() {
  const files = [...els.images.files].filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  state.pendingNewFiles.push(...files);
  els.images.value = '';
  renderEditorPreviews();
}

function onPreviewClick(event) {
  const btn = event.target.closest('button[data-remove-image]');
  if (!btn) return;
  removeEditorImage(btn.dataset.removeImage, Number(btn.dataset.index));
}

function onSearchInput() {
  state.searchTerm = String(els.searchProducts.value || '').trim().toLowerCase();
  renderProductsList();
}

function bindEvents() {
  els.images.addEventListener('change', handleImageSelection);
  els.saveDraft.addEventListener('click', saveDraftFromEditor);
  els.newProduct.addEventListener('click', () => clearEditor({ keepStatus: false }));
  els.loadProducts.addEventListener('click', () => {
    fetchPublicProducts().catch(err => {
      console.error(err);
      showStatus(err.message || 'No se pudieron cargar los productos.', 'error');
    });
  });
  els.saveAll.addEventListener('click', saveAllChanges);
  els.productsList.addEventListener('click', onProductsListClick);
  els.existingPreview.addEventListener('click', onPreviewClick);
  els.newPreview.addEventListener('click', onPreviewClick);
  els.searchProducts.addEventListener('input', onSearchInput);
  els.form.addEventListener('submit', event => {
    event.preventDefault();
    saveDraftFromEditor();
  });

  els.loginEnter.addEventListener('click', doLogin);
  els.loginKey.addEventListener('keydown', event => {
    if (event.key === 'Enter') doLogin();
  });
  els.loginName.addEventListener('keydown', event => {
    if (event.key === 'Enter') doLogin();
  });
  els.logoutBtn.addEventListener('click', () => logoutAuth('Sesión cerrada correctamente.', 'success'));

  [els.owner, els.repo, els.branch, els.remember].forEach(el => el.addEventListener('change', saveConfigIfNeeded));

  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
      if (state.user) touchAuthenticatedActivity();
    }, { passive: true });
  });

  window.addEventListener('storage', event => {
    if (event.key !== ACTIVE_SESSION_KEY || !state.user) return;
    const lease = readLease();
    if (lease && lease.tabId !== state.tabId && leaseIsFresh(lease)) {
      logoutAuth('Otra ventana tomó el control del admin. Esta sesión fue cerrada por seguridad.', 'error');
    }
  });

  window.addEventListener('beforeunload', () => {
    releaseSessionLease();
    stopActivityTracking();
  });
}

async function init() {
  loadSavedConfig();
  clearEditor({ keepStatus: false });
  renderProductsList();
  bindEvents();

  state.deviceId = await getDeviceId();
  els.loginDevice.textContent = state.deviceId;
  renderUserBadges();

  tryRestoreSession();
}

init();
