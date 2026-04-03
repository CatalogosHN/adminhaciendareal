const els = {
  owner: document.getElementById('gh-owner'),
  repo: document.getElementById('gh-repo'),
  branch: document.getElementById('gh-branch'),
  token: document.getElementById('gh-token'),
  remember: document.getElementById('remember-config'),
  form: document.getElementById('product-form'),
  name: document.getElementById('name'),
  price: document.getElementById('price'),
  status: document.getElementById('status'),
  categories: document.getElementById('categories'),
  desc1: document.getElementById('desc1'),
  desc2: document.getElementById('desc2'),
  desc3: document.getElementById('desc3'),
  images: document.getElementById('images'),
  preview: document.getElementById('image-preview'),
  statusBox: document.getElementById('status-box'),
  fillExample: document.getElementById('fill-example'),
  refreshProducts: document.getElementById('refresh-products'),
  productsList: document.getElementById('products-admin-list'),
  productCount: document.getElementById('product-count')
};

const STORAGE_KEY = 'hacienda-real-admin-config-v1';
let publicProducts = [];

function showStatus(message, type = 'info') {
  els.statusBox.textContent = message;
  els.statusBox.className = `status-box ${type === 'success' ? 'success' : ''} ${type === 'error' ? 'error' : ''}`.trim();
  els.statusBox.classList.remove('hidden');
}

function hideStatus() {
  els.statusBox.classList.add('hidden');
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'producto';
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function loadSavedConfig() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw);
    els.owner.value = cfg.owner || '';
    els.repo.value = cfg.repo || '';
    els.branch.value = cfg.branch || 'main';
    els.token.value = cfg.token || '';
    els.remember.checked = true;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function parseCategories(raw) {
  return String(raw || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function renderImagePreview(files) {
  els.preview.innerHTML = '';
  [...files].forEach(file => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    els.preview.appendChild(img);
  });
}

async function fetchPublicProducts() {
  const cfg = getConfig();

  if (!cfg.owner || !cfg.repo || !cfg.branch) {
    publicProducts = [];
    renderAdminProducts(publicProducts);
    showStatus('Completa owner, repositorio y rama, luego pulsa "Cargar productos".', 'error');
    return;
  }

  const url = `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${encodeURIComponent(cfg.branch)}/products.json?v=${Date.now()}`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`No se pudo leer products.json del repo público (${res.status}). Revisa owner, repo, rama y que exista el archivo.`);
  }

  const data = await res.json();
  publicProducts = Array.isArray(data) ? data : [];
  renderAdminProducts(publicProducts);
}

function renderAdminProducts(products) {
  els.productCount.textContent = `${products.length} producto${products.length === 1 ? '' : 's'}`;
  els.productsList.innerHTML = '';

  if (!products.length) {
    els.productsList.innerHTML = '<p class="muted">No hay productos cargados todavía.</p>';
    return;
  }

  products.forEach((product, index) => {
    const item = document.createElement('article');
    item.className = 'admin-item';
    const status = String(product.status || '').toLowerCase();
    const available = !/(agotado|sin\s*stock|no\s*disponible)/i.test(status);
    const categories = Array.isArray(product.categories)
      ? product.categories.join(', ')
      : (product.category || product.categories || 'Sin categoría');

    item.innerHTML = `
      <img src="${(product.images && product.images[0]) || ''}" alt="${product.name}">
      <div>
        <h3>${product.name}</h3>
        <p>L ${Number(product.price || 0).toFixed(2)}</p>
        <div class="meta-row">
          <span class="pill ${available ? 'available' : 'soldout'}">${available ? 'Disponible' : 'Agotado'}</span>
          <span class="pill">${categories}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn warn" type="button" data-action="toggle" data-index="${index}">${available ? 'Marcar agotado' : 'Marcar disponible'}</button>
        <button class="btn danger" type="button" data-action="delete" data-index="${index}">Eliminar</button>
      </div>
    `;

    els.productsList.appendChild(item);
  });
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
  const decoded = atob(data.content.replace(/\n/g, ''));
  return {
    sha: data.sha,
    products: JSON.parse(decoded)
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

function buildProductFromForm(imagePaths) {
  return {
    name: els.name.value.trim(),
    price: Number(els.price.value),
    categories: parseCategories(els.categories.value),
    description: [els.desc1.value.trim(), els.desc2.value.trim(), els.desc3.value.trim()].filter(Boolean),
    status: els.status.value,
    images: imagePaths
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  hideStatus();

  const files = [...els.images.files];
  if (!files.length) {
    showStatus('Selecciona al menos una foto.', 'error');
    return;
  }

  const cfg = validateConfig(true);
  saveConfigIfNeeded();

  showStatus('Subiendo imágenes y actualizando products.json...');

  try {
    const productSlug = slugify(els.name.value);
    const imagePaths = [];
    for (let i = 0; i < files.length; i += 1) {
      showStatus(`Subiendo imagen ${i + 1} de ${files.length}...`);
      imagePaths.push(await uploadImage(files[i], productSlug, i, cfg));
    }

    showStatus('Actualizando lista de productos...');
    const repoData = await getRepoProducts(cfg);
    const newProduct = buildProductFromForm(imagePaths);
    repoData.products.unshift(newProduct);
    await saveRepoProducts(repoData.products, repoData.sha, `Agregar producto: ${newProduct.name}`, cfg);

    els.form.reset();
    els.preview.innerHTML = '';
    showStatus(`Producto guardado correctamente: ${newProduct.name}`, 'success');
    await fetchPublicProducts();
  } catch (err) {
    console.error(err);
    showStatus(err.message || 'No se pudo guardar el producto.', 'error');
  }
}

async function persistModifiedProducts(nextProducts, message) {
  const cfg = validateConfig(true);
  saveConfigIfNeeded();
  showStatus('Guardando cambios en GitHub...');
  const repoData = await getRepoProducts(cfg);
  await saveRepoProducts(nextProducts, repoData.sha, message, cfg);
  showStatus('Cambios guardados correctamente.', 'success');
  await fetchPublicProducts();
}

async function onProductsListClick(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;

  const index = Number(btn.dataset.index);
  const action = btn.dataset.action;
  const product = publicProducts[index];
  if (!product) return;

  try {
    if (action === 'toggle') {
      const next = publicProducts.map((item, idx) => idx === index
        ? { ...item, status: /(agotado|sin\s*stock|no\s*disponible)/i.test(String(item.status || '')) ? 'disponible' : 'agotado' }
        : item);
      await persistModifiedProducts(next, `Cambiar estado: ${product.name}`);
    }

    if (action === 'delete') {
      const confirmed = confirm(`¿Eliminar el producto "${product.name}"?`);
      if (!confirmed) return;
      const next = publicProducts.filter((_, idx) => idx !== index);
      await persistModifiedProducts(next, `Eliminar producto: ${product.name}`);
    }
  } catch (err) {
    console.error(err);
    showStatus(err.message || 'No se pudo guardar el cambio.', 'error');
  }
}

function fillExample() {
  els.name.value = 'Power Bank 20,000 mAh Carga Rápida';
  els.price.value = '650';
  els.status.value = 'disponible';
  els.categories.value = 'Tecnologia y Juegos, Accesorios Varios';
  els.desc1.value = '⚡ Batería portátil de alta capacidad para cargar tu celular varias veces durante el día.';
  els.desc2.value = '🔋 Incluye puertos de carga rápida y diseño compacto para llevarla en mochila, bolso o carro.';
  els.desc3.value = '📱 Ideal para viajes, trabajo o emergencias cuando no tienes un enchufe cerca.';
}

els.images.addEventListener('change', () => renderImagePreview(els.images.files));
els.form.addEventListener('submit', handleSubmit);
els.fillExample.addEventListener('click', fillExample);
els.refreshProducts.addEventListener('click', fetchPublicProducts);
els.productsList.addEventListener('click', onProductsListClick);
[els.owner, els.repo, els.branch, els.token, els.remember].forEach(el => el.addEventListener('change', saveConfigIfNeeded));

loadSavedConfig();

if (els.owner.value && els.repo.value && els.branch.value) {
  fetchPublicProducts().catch(err => {
    console.error(err);
    showStatus(err.message || 'No se pudieron cargar los productos actuales.', 'error');
  });
}
