const els = {
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
  editorTitle: document.getElementById('editor-title'),
  sessionLock: document.getElementById('session-lock'),
  unlockToken: document.getElementById('unlock-token'),
  unlockSession: document.getElementById('unlock-session')
};

const STORAGE_KEY = 'hacienda-real-admin-config-v2';
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

const state = {
  workingProducts: [],
  dirty: false,
  isSaving: false,
  searchTerm: '',
  pendingExistingImages: [],
  pendingNewFiles: [],
  objectUrls: [],
  inactivityTimer: null,
  locked: false
};

function showStatus(message, type = 'info') {
  els.statusBox.textContent = message;
  els.statusBox.className = `status-box ${type === 'success' ? 'success' : ''} ${type === 'error' ? 'error' : ''}`.trim();
  els.statusBox.classList.remove('hidden');
}

function hideStatus() {
  els.statusBox.classList.add('hidden');
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
  const pending = state.dirty ? 'Cambios pendientes' : 'Sin cambios pendientes';
  els.pendingCount.textContent = pending;
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

function validateConfig(requireToken = true) {
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
  const safeConfig = {
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConfig));
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

function resetInactivityTimer() {
  if (state.locked) return;
  clearTimeout(state.inactivityTimer);
  state.inactivityTimer = setTimeout(lockSession, SESSION_TIMEOUT_MS);
}

function lockSession() {
  state.locked = true;
  els.token.value = '';
  els.unlockToken.value = '';
  els.sessionLock.classList.remove('hidden');
  els.sessionLock.setAttribute('aria-hidden', 'false');
}

function unlockSession() {
  const token = els.unlockToken.value.trim();
  if (!token) {
    showStatus('Escribe de nuevo el token para desbloquear.', 'error');
    return;
  }
  els.token.value = token;
  els.unlockToken.value = '';
  state.locked = false;
  els.sessionLock.classList.add('hidden');
  els.sessionLock.setAttribute('aria-hidden', 'true');
  showStatus('Sesión restaurada.', 'success');
  resetInactivityTimer();
}

function ensureUnlocked() {
  if (state.locked) {
    throw new Error('La sesión está bloqueada por inactividad. Vuelve a escribir el token.');
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
  const name = cleanText(els.name.value);
  const descriptions = [els.desc1.value, els.desc2.value, els.desc3.value]
    .map(cleanText)
    .filter(Boolean);

  const product = {
    uid: els.editingUid.value || makeUid(),
    name,
    price: Number(els.price.value || 0),
    categories: parseCategories(els.categories.value),
    description: descriptions,
    status: els.status.value,
    images: [...state.pendingExistingImages],
    _newFiles: [...state.pendingNewFiles]
  };

  if (!product.name) {
    throw new Error('Escribe el nombre del producto.');
  }
  if (!Number.isFinite(product.price) || product.price < 0) {
    throw new Error('El precio no es válido.');
  }
  if (!product.description.length) {
    throw new Error('Agrega al menos una descripción.');
  }
  if (!product.images.length && !product._newFiles.length) {
    throw new Error('Debes dejar al menos una imagen actual o nueva.');
  }

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

  els.productsList.innerHTML = list.map((product) => {
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
  if (index >= 0) {
    state.workingProducts[index] = normalized;
  } else {
    state.workingProducts.unshift(normalized);
  }
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
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${config.token}`,
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
  const bitmap = await createImageBitmap(file);
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
  return {
    sha: data.sha,
    products: normalizeProductsArray(JSON.parse(decoded))
  };
}

async function saveRepoProducts(products, sha, message, cfg) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(products, null, 2))));
  await githubRequest('products.json', 'PUT', {
    message,
    content,
    sha,
    branch: cfg.branch
  }, cfg);
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
  products.forEach(product => {
    (product.images || []).forEach(path => set.add(path));
  });
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
  ensureUnlocked();
  if (state.isSaving) return;
  const cfg = validateConfig(true);
  saveConfigIfNeeded();

  state.isSaving = true;
  els.saveAll.disabled = true;
  els.saveDraft.disabled = true;
  try {
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
    await saveRepoProducts(finalProducts, repoData.sha, 'Actualizar catálogo desde admin', cfg);

    const newImageSet = collectImageSet(finalProducts);
    const orphanedAdminImages = [...oldImageSet].filter(path => {
      return path.startsWith('images/admin/') && !newImageSet.has(path);
    });

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
    const product = currentEditorProduct();
    upsertWorkingProduct(product);
    showStatus(`Borrador guardado: ${product.name}`, 'success');
    clearEditor();
  } catch (error) {
    showStatus(error.message || 'No se pudo guardar el borrador.', 'error');
  }
}

function removeEditorImage(type, index) {
  if (type === 'existing') {
    state.pendingExistingImages.splice(index, 1);
  }
  if (type === 'new') {
    state.pendingNewFiles.splice(index, 1);
  }
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
    const copy = {
      ...product,
      uid: makeUid(),
      name: `${product.name} copia`,
      images: [...(product.images || [])],
      _newFiles: []
    };
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
els.unlockSession.addEventListener('click', unlockSession);
els.unlockToken.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') unlockSession();
});
els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  saveDraftFromEditor();
});
[els.owner, els.repo, els.branch, els.remember].forEach(el => el.addEventListener('change', saveConfigIfNeeded));
['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

loadSavedConfig();
clearEditor({ keepStatus: false });
renderProductsList();
resetInactivityTimer();
