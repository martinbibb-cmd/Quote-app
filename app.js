const state = {
  pricebook: null,
  currencyFormatter: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
  selected: new Map(),
  itemElements: new Map(),
  boilers: [],
  boilerKeys: new Set(),
  totalItems: 0,
};

const categoryContainer = document.getElementById('categories');
const metaContainer = document.getElementById('pricebook-meta');
const searchInput = document.getElementById('search');
const filterCount = document.getElementById('filter-count');
const template = document.getElementById('item-template');
const selectionList = document.getElementById('selection-list');
const selectionEmpty = document.getElementById('selection-empty');
const selectionCount = document.getElementById('selection-count');
const selectionTotal = document.getElementById('selection-total');
const selectionVat = document.getElementById('selection-vat');
const clearButton = document.getElementById('clear-selection');
const boilerResults = document.getElementById('boiler-results');
const boilerEmpty = document.getElementById('boiler-empty');
const fuelFilter = document.getElementById('filter-fuel');
const typeFilter = document.getElementById('filter-type');
const brandFilter = document.getElementById('filter-brand');

init();

async function init() {
  try {
    const res = await fetch('pricebook.json');
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    state.pricebook = await res.json();
  } catch (err) {
    console.error(err);
    renderError('Unable to load pricebook.json. Please check the file and reload.');
    return;
  }

  const { metadata } = state.pricebook;
  if (metadata?.currency) {
    state.currencyFormatter = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: metadata.currency,
    });
  }

  renderMeta(metadata);
  state.itemElements.clear();
  setupBoilerSelector(state.pricebook.categories || {});
  renderCategories(state.pricebook.categories || {});
  updateSelectionSummary();

  searchInput?.addEventListener('input', handleSearch);
  clearButton?.addEventListener('click', clearSelection);
}

function renderMeta(metadata = {}) {
  if (!metaContainer) return;
  metaContainer.innerHTML = '';

  const entries = [
    { label: 'Pricebook', value: metadata.name || 'Manual' },
    { label: 'Last refreshed', value: formatDate(metadata.last_refreshed) },
    { label: 'Currency', value: metadata.currency || 'GBP' },
    { label: 'VAT', value: metadata.vat_included ? 'Included' : 'Excluded' },
  ];

  for (const { label, value } of entries) {
    if (value == null || value === '') continue;
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    metaContainer.append(row);
  }

  selectionVat.textContent = metadata.vat_included ? 'Included' : 'Excluded';
}

function renderCategories(categories) {
  if (!categoryContainer) return;
  state.totalItems = 0;
  categoryContainer.innerHTML = '';

  const keys = Object.keys(categories).sort((a, b) => a.localeCompare(b));

  for (const key of keys) {
    if (key.startsWith('boilers')) continue;
    const items = categories[key] || [];
    if (!items.length) continue;
    state.totalItems += items.length;

    const section = document.createElement('section');
    section.className = 'category-section';
    section.dataset.categoryKey = key;

    const heading = document.createElement('h2');
    heading.className = 'category-heading';
    heading.textContent = formatCategoryName(key);
    const badge = document.createElement('span');
    badge.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    heading.appendChild(badge);
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'item-grid';

    for (const item of items) {
      const card = createItemCard(key, item);
      grid.appendChild(card);
      state.itemElements.set(card.dataset.itemKey, card);
    }

    section.appendChild(grid);
    categoryContainer.appendChild(section);
  }

  categoryContainer.setAttribute('aria-busy', 'false');
  updateFilterCount(state.totalItems, state.totalItems);
}

function createItemCard(categoryKey, item) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.item-card');
  const key = `${categoryKey}|${item.code}`;

  card.dataset.itemKey = key;
  card.dataset.category = categoryKey;
  card.dataset.code = item.code.toLowerCase();
  card.dataset.description = (item.description || '').toLowerCase();

  const nameEl = card.querySelector('.item-name');
  const codeEl = card.querySelector('.item-code');
  const descEl = card.querySelector('.item-description');
  const priceEl = card.querySelector('.item-price');
  const leadEl = card.querySelector('.item-lead');
  const actionButton = card.querySelector('.item-action');

  nameEl.textContent = item.description || item.code;
  codeEl.textContent = item.code;
  descEl.textContent = item.description || '';
  priceEl.textContent = state.currencyFormatter.format(item.price ?? 0);
  leadEl.textContent = formatLeadTime(item.lead_time_days);

  actionButton.addEventListener('click', () => toggleSelection(key, item, categoryKey));

  updateCardSelectionState(card);
  return card;
}

function toggleSelection(key, item, categoryKey) {
  if (state.selected.has(key)) {
    state.selected.delete(key);
  } else {
    if (categoryKey.startsWith('boilers')) {
      const otherBoilers = Array.from(state.selected.keys()).filter((selectedKey) => selectedKey.startsWith('boilers'));
      for (const existing of otherBoilers) {
        state.selected.delete(existing);
        const otherCard = state.itemElements.get(existing);
        if (otherCard) updateCardSelectionState(otherCard);
      }
    }
    state.selected.set(key, {
      key,
      categoryKey,
      code: item.code,
      description: item.description,
      price: item.price ?? 0,
      leadTime: item.lead_time_days ?? null,
    });
  }

  const card = state.itemElements.get(key);
  if (card) updateCardSelectionState(card);
  updateSelectionSummary();
}

function updateCardSelectionState(card) {
  if (!card) return;
  const button = card.querySelector('.item-action');
  const selected = state.selected.has(card.dataset.itemKey);
  card.classList.toggle('selected', selected);
  button.textContent = selected ? 'Remove from selection' : 'Add to selection';
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
}

function updateSelectionSummary() {
  if (!selectionList) return;
  selectionList.innerHTML = '';

  const entries = Array.from(state.selected.values()).sort((a, b) => {
    if (a.categoryKey === b.categoryKey) return a.code.localeCompare(b.code);
    return formatCategoryName(a.categoryKey).localeCompare(formatCategoryName(b.categoryKey));
  });

  const total = entries.reduce((sum, item) => sum + (item.price || 0), 0);

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'selection-row';

    const header = document.createElement('header');
    const title = document.createElement('span');
    title.textContent = entry.description || entry.code;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = state.currencyFormatter.format(entry.price || 0);
    header.append(title, price);

    const meta = document.createElement('div');
    meta.className = 'muted';
    const categoryName = formatCategoryName(entry.categoryKey);
    meta.textContent = `${entry.code} · ${categoryName}${entry.leadTime != null ? ` · ${formatLeadTime(entry.leadTime)}` : ''}`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ghost';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      state.selected.delete(entry.key);
      const card = state.itemElements.get(entry.key);
      if (card) updateCardSelectionState(card);
      updateSelectionSummary();
    });

    li.append(header, meta, removeBtn);
    selectionList.appendChild(li);
  });

  const count = entries.length;
  selectionEmpty.hidden = count > 0;
  selectionCount.textContent = String(count);
  selectionTotal.textContent = state.currencyFormatter.format(total);
  clearButton.disabled = count === 0;
}

function clearSelection() {
  if (!state.selected.size) return;
  const keys = Array.from(state.selected.keys());
  state.selected.clear();
  for (const key of keys) {
    const card = state.itemElements.get(key);
    if (card) updateCardSelectionState(card);
  }
  updateSelectionSummary();
}

function handleSearch() {
  const term = (searchInput.value || '').trim().toLowerCase();
  let visible = 0;

  for (const card of state.itemElements.values()) {
    if (card.closest('#boiler-results')) continue;
    const matches = !term ||
      card.dataset.code.includes(term) ||
      card.dataset.description.includes(term);
    card.hidden = !matches;
    if (matches) visible += 1;
  }

  for (const section of categoryContainer.querySelectorAll('.category-section')) {
    const grid = section.querySelector('.item-grid');
    const hasVisible = Array.from(grid.children).some((child) => !child.hidden);
    section.hidden = !hasVisible;
  }

  updateFilterCount(state.totalItems, visible);
}

function updateFilterCount(total, visible) {
  if (!filterCount) return;
  if (total === visible || total === 0) {
    filterCount.textContent = '';
  } else {
    filterCount.textContent = `${visible} of ${total} items shown`;
  }
}

function renderError(message) {
  if (!categoryContainer) return;
  categoryContainer.setAttribute('aria-busy', 'false');
  categoryContainer.innerHTML = '';
  const error = document.createElement('p');
  error.className = 'muted';
  error.textContent = message;
  categoryContainer.appendChild(error);
}

function formatCategoryName(value) {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function formatLeadTime(days) {
  if (days == null) return '—';
  if (Number(days) === 0) return 'Same day';
  if (Number(days) === 1) return '1 day';
  return `${days} days`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}

function setupBoilerSelector(categories) {
  if (!boilerResults) return;

  state.boilers = extractBoilers(categories);
  populateFilterOptions();
  renderBoilerResults();

  fuelFilter?.addEventListener('change', renderBoilerResults);
  typeFilter?.addEventListener('change', renderBoilerResults);
  brandFilter?.addEventListener('change', renderBoilerResults);
}

function extractBoilers(categories) {
  const boilers = [];
  for (const [categoryKey, items] of Object.entries(categories)) {
    if (!categoryKey.startsWith('boilers') || !Array.isArray(items)) continue;
    for (const item of items) {
      const description = item.description || item.code;
      boilers.push({
        ...item,
        key: `${categoryKey}|${item.code}`,
        categoryKey,
        fuel: detectFuel(categoryKey, description),
        type: detectType(categoryKey, description),
        brand: detectBrand(description),
      });
    }
  }
  return boilers;
}

function detectFuel(categoryKey, description = '') {
  const lowerCategory = categoryKey.toLowerCase();
  const lowerDesc = description.toLowerCase();
  if (lowerCategory.includes('lpg') && !lowerCategory.includes('ng')) return 'lpg';
  if (lowerCategory.includes('ng') && !lowerCategory.includes('lpg')) return 'ng';
  if (lowerDesc.includes('lpg')) return 'lpg';
  return 'ng';
}

function detectType(categoryKey, description = '') {
  const lowerCategory = categoryKey.toLowerCase();
  const lowerDesc = description.toLowerCase();
  if (lowerCategory.includes('combi') || lowerDesc.includes('combi')) return 'combi';
  if (lowerCategory.includes('system') || lowerDesc.includes('system')) return 'system';
  if (lowerCategory.includes('regular') || lowerDesc.includes('regular') || lowerDesc.includes('heat')) return 'regular';
  return 'other';
}

function detectBrand(description = '') {
  if (!description) return 'Unknown';
  const [brand] = description.split(/\s+/);
  return brand?.replace(/[^\w+-]/g, '') || 'Unknown';
}

function populateFilterOptions() {
  if (!fuelFilter || !typeFilter || !brandFilter) return;

  const fuels = new Set();
  const types = new Set();
  const brands = new Set();

  for (const boiler of state.boilers) {
    if (boiler.fuel) fuels.add(boiler.fuel);
    if (boiler.type && boiler.type !== 'other') types.add(boiler.type);
    if (boiler.brand && boiler.brand !== 'Unknown') brands.add(boiler.brand);
  }

  fillSelect(fuelFilter, fuels);
  fillSelect(typeFilter, types);
  fillSelect(brandFilter, brands, { sortCaseInsensitive: true, preserveCase: true });
}

function fillSelect(selectEl, values, options = {}) {
  if (!selectEl) return;
  const { sortCaseInsensitive = false, preserveCase = false } = options;
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="all">All</option>';
  const entries = Array.from(values).filter(Boolean);
  if (sortCaseInsensitive) {
    entries.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } else {
    entries.sort();
  }
  for (const value of entries) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = preserveCase ? value : capitalise(value);
    selectEl.appendChild(option);
  }
  if (current && Array.from(selectEl.options).some((opt) => opt.value === current)) {
    selectEl.value = current;
  }
}

function renderBoilerResults() {
  if (!boilerResults) return;

  for (const key of state.boilerKeys) {
    state.itemElements.delete(key);
  }
  state.boilerKeys.clear();

  const fuel = fuelFilter?.value || 'all';
  const type = typeFilter?.value || 'all';
  const brand = brandFilter?.value || 'all';

  const matches = state.boilers.filter((boiler) => {
    if (fuel !== 'all' && boiler.fuel !== fuel) return false;
    if (type !== 'all' && boiler.type !== type) return false;
    if (brand !== 'all' && boiler.brand !== brand) return false;
    return true;
  });

  boilerResults.innerHTML = '';

  for (const boiler of matches) {
    const card = createItemCard(boiler.categoryKey, boiler);
    boilerResults.appendChild(card);
    state.itemElements.set(card.dataset.itemKey, card);
    state.boilerKeys.add(card.dataset.itemKey);
  }

  if (boilerEmpty) boilerEmpty.hidden = matches.length > 0;
}

function capitalise(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return trimmed.replace(/(^|\s)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}
