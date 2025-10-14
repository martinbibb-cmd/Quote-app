const STORAGE_KEY = 'bg-quote-tool-draft-v1';
const THEME_KEY = 'bg-quote-tool-theme';
const steps = ['meta', 'current', 'proposed', 'addons', 'photos', 'basket', 'validate', 'export'];

let priceBook = null;
let pond = null;
let saveTimer = null;
let checklistCounter = 0;

const state = createInitialState();

window.addEventListener('DOMContentLoaded', init);

function createInitialState() {
  return {
    meta: {
      customerId: '',
      jobName: '',
      reference: '',
      adviser: '',
      visitDate: '',
      labourRate: 0,
      siteAddress: '',
      notes: ''
    },
    current: {
      typeId: null,
      basePackId: null,
      location: null,
      notes: '',
      flowAt1Bar: '',
      measurements: { height: '', width: '', depth: '', notes: '' }
    },
    proposed: {
      systemId: null,
      conversionPackId: null,
      location: null,
      notes: '',
      boilerId: null,
      flueSelection: null,
      headroom: { available: '', reductions: {} },
      gasOptionIds: [],
      condensateOptionIds: [],
      condensateNotes: ''
    },
    checklists: {
      photos: [],
      observations: []
    },
    components: {},
    photos: [],
    validation: {
      clearanceStatus: null,
      headroomStatus: null
    },
    cachedLines: []
  };
}

async function init() {
  applyStoredTheme();
  $('#toggle-theme').addEventListener('click', toggleTheme);

  try {
    const res = await fetch('pricebook.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    priceBook = await res.json();
  } catch (err) {
    console.error(err);
    alert('Failed to load pricebook.json.');
    return;
  }

  $('#pricebook-version').textContent = formatPricebookVersion(priceBook);

  loadDraft();

  if (!state.meta.visitDate) {
    state.meta.visitDate = dayjs().format('YYYY-MM-DD');
  }
  if (!state.meta.labourRate) {
    state.meta.labourRate = priceBook.labourRate || 0;
  }

  initStepNavigation();
  initMetaSection();
  renderCustomers();
  renderCustomerDetails();
  renderExistingTypes();
  renderHouseButtons('current-location', 'current');
  renderHouseButtons('proposed-location', 'proposed');
  renderSystemOptions();
  renderBoilerOptions();
  renderFlueOptions();
  renderGasOptions();
  renderCondensateOptions();
  renderComponentMap();
  renderChecklists();
  restoreChecklistTextareas();
  setupPhotoPond();
  renderPhotoGallery();
  attachActions();

  updateDerivedOutputs();
}

function $(selector, ctx = document) {
  return ctx.querySelector(selector);
}

function $$(selector, ctx = document) {
  return Array.from(ctx.querySelectorAll(selector));
}

function formatDate(value) {
  if (!value) return '';
  const date = dayjs(value);
  return date.isValid() ? date.format('D MMM YYYY') : value;
}

function formatPricebookVersion(book) {
  if (!book) return '';
  const parts = [];
  if (book.version) parts.push(`v${book.version}`);
  const generated = formatDate(book.generatedAt);
  if (generated) parts.push(generated);
  return parts.length ? `Price book ${parts.join(' · ')}` : '';
}

function applyStoredTheme() {
  const theme = localStorage.getItem(THEME_KEY);
  if (theme === 'light') {
    document.body.classList.add('light');
  }
}

function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem(THEME_KEY, document.body.classList.contains('light') ? 'light' : 'dark');
}
function loadDraft() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    mergeState(state, data);
  } catch (err) {
    console.warn('Unable to parse stored draft', err);
  }
}

function mergeState(target, source) {
  if (!source || typeof source !== 'object') return;
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (Array.isArray(value)) {
      target[key] = value.map((item) => (item && typeof item === 'object' ? { ...item } : item));
    } else if (value && typeof value === 'object') {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      mergeState(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function initStepNavigation() {
  $$('.step-link').forEach((link) => {
    link.addEventListener('click', () => {
      showStep(link.dataset.step);
    });
  });
}

function showStep(step) {
  $$('.step-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.step === step);
  });
  $$('.step-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `step-${step}`);
  });
}

function initMetaSection() {
  $('#meta-job-name').value = state.meta.jobName || '';
  $('#meta-reference').value = state.meta.reference || '';
  $('#meta-adviser').value = state.meta.adviser || '';
  $('#meta-date').value = state.meta.visitDate || '';
  $('#meta-labour').value = state.meta.labourRate || 0;
  $('#meta-site-address').value = state.meta.siteAddress || '';
  $('#meta-notes').value = state.meta.notes || '';

  $('#meta-job-name').addEventListener('input', (e) => updateState(() => { state.meta.jobName = e.target.value; }));
  $('#meta-reference').addEventListener('input', (e) => updateState(() => { state.meta.reference = e.target.value; }));
  $('#meta-adviser').addEventListener('input', (e) => updateState(() => { state.meta.adviser = e.target.value; }));
  $('#meta-date').addEventListener('input', (e) => updateState(() => { state.meta.visitDate = e.target.value; }));
  $('#meta-site-address').addEventListener('input', (e) => updateState(() => { state.meta.siteAddress = e.target.value; }));
  $('#meta-notes').addEventListener('input', (e) => updateState(() => { state.meta.notes = e.target.value; }));
  $('#meta-labour').addEventListener('input', (e) => updateState(() => {
    const val = Number(e.target.value);
    state.meta.labourRate = Number.isFinite(val) ? val : 0;
  }));

  $('#meta-use-address').addEventListener('click', () => {
    const customer = getCustomer();
    if (!customer) return;
    $('#meta-site-address').value = customer.address || '';
    updateState(() => { state.meta.siteAddress = customer.address || ''; });
  });
}

function renderCustomers() {
  const select = $('#meta-customer');
  select.innerHTML = '<option value="">Select customer…</option>';
  (priceBook.customers || []).forEach((customer) => {
    const opt = document.createElement('option');
    opt.value = customer.id;
    opt.textContent = customer.name;
    select.append(opt);
  });
  select.value = state.meta.customerId || '';
  select.addEventListener('change', () => {
    updateState(() => { state.meta.customerId = select.value || ''; });
    renderCustomerDetails();
  });
}

function renderCustomerDetails() {
  const container = $('#meta-customer-details');
  container.innerHTML = '';
  const customer = getCustomer();
  if (!customer) return;
  const entries = [
    ['Account', customer.accountRef],
    ['Address', customer.address],
    ['Contact', customer.contact],
    ['Email', customer.email],
    ['Phone', customer.phone]
  ];
  entries.forEach(([label, value]) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    container.append(dt, dd);
  });
}
function renderExistingTypes() {
  const grid = $('#current-type-grid');
  grid.innerHTML = '';
  (priceBook.boilerTypes || []).forEach((type) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'type-card';
    btn.innerHTML = `
      <span class="icon" style="background:${type.imageTint || '#1e293b'}">🔥</span>
      <strong>${type.name}</strong>
      <span class="muted">${type.description || ''}</span>
    `;
    if (state.current.typeId === type.id) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (state.current.typeId === type.id) return;
      updateState(() => {
        state.current.typeId = type.id;
        state.current.basePackId = type.basePack || null;
        loadDefaultChecklists(type);
      });
      renderExistingTypes();
      renderBasePackSummary();
      renderChecklists();
    });
    grid.append(btn);
  });
  renderBasePackSummary();
}

function loadDefaultChecklists(type) {
  state.checklists.photos = (type.photos || []).map((label) => createChecklistItem(label));
  state.checklists.observations = (type.observations || []).map((label) => createChecklistItem(label));
}

function renderBasePackSummary() {
  const container = $('#base-pack-lines');
  container.innerHTML = '';
  const pack = getPack(state.current.basePackId);
  const intro = $('#base-pack-summary .muted');
  if (!pack) {
    if (intro) intro.style.display = 'block';
    return;
  }
  if (intro) intro.style.display = 'none';
  const totals = packTotals(pack);
  const main = document.createElement('li');
  main.innerHTML = `<span>${pack.name}</span><span>${fmtGBP(totals.cost)} · ${totals.hours.toFixed(2)} hrs</span>`;
  container.append(main);
  (pack.parts || []).forEach((part) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${part.name}</span><span>${fmtGBP(part.cost)} · ${(Number(part.hours) || 0).toFixed(2)} hrs</span>`;
    container.append(li);
  });
}

function renderHouseButtons(containerId, key) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  (priceBook.houseRooms || []).forEach((room) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'room-btn';
    btn.textContent = room;
    if (state[key].location === room) btn.classList.add('active');
    btn.addEventListener('click', () => {
      updateState(() => { state[key].location = room; });
      renderHouseButtons(containerId, key);
    });
    container.append(btn);
  });
}

function renderSystemOptions() {
  const container = $('#system-options');
  container.innerHTML = '';
  (priceBook.systemOptions || []).forEach((sys) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'option-card system-card';
    card.innerHTML = `<header><div><strong>${sys.name}</strong></div><div class="muted">${sys.description || ''}</div></header>`;
    if (state.proposed.systemId === sys.id) card.classList.add('active');
    card.addEventListener('click', () => {
      if (state.proposed.systemId === sys.id) return;
      updateState(() => {
        state.proposed.systemId = sys.id;
        state.proposed.conversionPackId = sys.pack || null;
        const boiler = getBoiler(state.proposed.boilerId);
        if (boiler && !isBoilerCompatibleWithSystem(boiler, sys)) {
          state.proposed.boilerId = null;
          state.proposed.flueSelection = null;
        }
      });
      renderSystemOptions();
      renderBoilerOptions();
      renderFlueOptions();
    });
    container.append(card);
  });
  const pack = getPack(state.proposed.conversionPackId);
  $('#conversion-pack-notes').textContent = pack ? `${pack.name}: ${pack.summary}` : '';
}
function renderBoilerOptions() {
  const container = $('#boiler-options');
  container.innerHTML = '';
  const system = getSystemOption();
  if (!system) {
    container.innerHTML = '<p class="muted">Select a system to view compatible boilers.</p>';
    return;
  }
  const options = getBoilersForSystem(system);
  if (!options.length) {
    container.innerHTML = '<p class="muted">No boilers listed in the price book for this system option.</p>';
    return;
  }
  options.forEach((boiler) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'option-card';
    if (state.proposed.boilerId === boiler.id) card.classList.add('active');
    const hoursText = typeof boiler.hours === 'number' ? `${boiler.hours} hrs` : 'Hours tbc';
    const detailBits = [];
    if (boiler.case?.height && boiler.case?.width && boiler.case?.depth) {
      detailBits.push(`Case ${boiler.case.height}×${boiler.case.width}×${boiler.case.depth}mm`);
    }
    if (boiler.heatLossRange) detailBits.push(boiler.heatLossRange);
    const detailText = detailBits.join(' · ') || 'Specification to be confirmed';
    card.innerHTML = `
      <header>
        <div>
          <strong>${boiler.name}</strong>
          <div class="muted">${boiler.output}</div>
        </div>
        <div>
          <div>${fmtGBP(boiler.cost)}</div>
          <small class="muted">${hoursText}</small>
        </div>
      </header>
      <div class="muted">${detailText}</div>
      <footer>${boiler.notes || ''}</footer>
    `;
    card.addEventListener('click', () => {
      updateState(() => {
        state.proposed.boilerId = boiler.id;
        if (!boiler.flues?.includes(state.proposed.flueSelection?.flueId)) {
          state.proposed.flueSelection = null;
        }
      });
      renderBoilerOptions();
      renderFlueOptions();
    });
    container.append(card);
  });
  updateClearanceReport();
}

function renderFlueOptions() {
  const tabs = $('#flue-tabs');
  const variantsContainer = $('#flue-variants');
  const heatmap = $('#flue-heatmap');
  tabs.innerHTML = '';
  variantsContainer.innerHTML = '';
  heatmap.innerHTML = '';

  const boiler = getBoiler(state.proposed.boilerId);
  if (!boiler) {
    variantsContainer.innerHTML = '<p class="muted">Select a boiler to load flue options.</p>';
    renderHeadroomUI(null);
    return;
  }

  const available = (priceBook.flues || []).filter((flue) => boiler.flues?.includes(flue.id));
  if (!available.length) {
    variantsContainer.innerHTML = '<p class="muted">No flues listed for this boiler.</p>';
    renderHeadroomUI(null);
    return;
  }

  const types = [...new Set(available.map((f) => f.type))];
  let activeType = state.proposed.flueSelection ? available.find((f) => f.id === state.proposed.flueSelection.flueId)?.type : null;
  if (!activeType || !types.includes(activeType)) activeType = types[0];

  types.forEach((type) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = type[0].toUpperCase() + type.slice(1);
    if (type === activeType) btn.classList.add('active');
    btn.addEventListener('click', () => renderFlueOptionsType(available, type));
    tabs.append(btn);
  });

  renderFlueOptionsType(available, activeType);
}

function renderFlueOptionsType(available, type) {
  const variantsContainer = $('#flue-variants');
  const heatmap = $('#flue-heatmap');
  variantsContainer.innerHTML = '';
  heatmap.innerHTML = '';

  const filtered = available.filter((flue) => flue.type === type);
  filtered.forEach((flue) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'option-card';
    const isActive = state.proposed.flueSelection?.flueId === flue.id;
    if (isActive) card.classList.add('active');
    card.innerHTML = `
      <header>
        <div>
          <strong>${flue.name}</strong>
          <div class="muted">${flue.type} · zones ${(flue.heatZones || []).length}</div>
        </div>
        <div>
          <div>${fmtGBP(flue.cost)}</div>
          <small class="muted">${flue.hours} hrs</small>
        </div>
      </header>
      <footer>${(flue.images && flue.images[type]) || ''}</footer>
    `;
    card.addEventListener('click', () => {
      updateState(() => {
        state.proposed.flueSelection = { flueId: flue.id, variantId: flue.variants?.[0]?.id || null };
        state.proposed.headroom.reductions = {};
      });
      renderFlueOptions();
    });
    variantsContainer.append(card);

    if (isActive) {
      renderFlueVariants(flue);
      renderHeatmap(flue);
      renderHeadroomUI(flue);
    }
  });

  if (!state.proposed.flueSelection) {
    renderHeadroomUI(null);
  }
}

function renderFlueVariants(flue) {
  const container = document.createElement('div');
  container.className = 'option-stack';
  (flue.variants || []).forEach((variant) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost small';
    btn.textContent = variant.label;
    if (state.proposed.flueSelection?.variantId === variant.id) btn.classList.add('primary');
    btn.addEventListener('click', () => {
      updateState(() => { state.proposed.flueSelection = { flueId: flue.id, variantId: variant.id }; });
      renderFlueOptions();
    });
    container.append(btn);
  });
  $('#flue-variants').append(container);
}

function renderHeatmap(flue) {
  const heatmap = $('#flue-heatmap');
  heatmap.innerHTML = '';
  (flue.heatZones || []).forEach((zone) => {
    const div = document.createElement('div');
    div.className = 'heatmap-zone';
    div.innerHTML = `<span>${zone.replace(/-/g, ' ')}</span>`;
    heatmap.append(div);
  });
}
function renderHeadroomUI(flue) {
  const container = $('#headroom-reductions');
  container.innerHTML = '';
  const result = $('#headroom-result');
  if (!flue) {
    result.className = 'report';
    result.textContent = 'Select a flue to calculate headroom.';
    updateState(() => { state.validation.headroomStatus = null; }, { silent: true });
    return;
  }
  const template = $('#headroom-reduction-template');
  (flue.headroom?.reductions || []).forEach((reduction) => {
    const frag = template.content.cloneNode(true);
    const input = frag.querySelector('input');
    const label = frag.querySelector('.label');
    const value = frag.querySelector('.value');
    label.textContent = reduction.label;
    value.textContent = `-${reduction.value}mm`;
    input.checked = Boolean(state.proposed.headroom.reductions[reduction.id]);
    input.addEventListener('change', () => {
      updateState(() => {
        state.proposed.headroom.reductions[reduction.id] = input.checked;
      }, { silent: true });
      updateHeadroomReport();
      scheduleSave();
    });
    container.append(frag);
  });
  $('#headroom-available').value = state.proposed.headroom.available || '';
  updateHeadroomReport();
}

$('#headroom-available').addEventListener('input', () => {
  updateHeadroomReport();
  scheduleSave();
});

function updateHeadroomReport() {
  const flue = getFlue(state.proposed.flueSelection?.flueId);
  const result = $('#headroom-result');
  if (!flue) {
    result.className = 'report';
    result.textContent = 'Select a flue to calculate headroom.';
    return;
  }
  const base = Number(flue.headroom?.base || 0);
  const selected = flue.headroom?.reductions?.filter((r) => state.proposed.headroom.reductions[r.id]) || [];
  const reductionTotal = selected.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const required = Math.max(base - reductionTotal, 0);
  const availableInput = Number($('#headroom-available').value || state.proposed.headroom.available || 0);
  const hasValue = Number.isFinite(availableInput) && availableInput > 0;
  let status = 'warning';
  let message = `Base headroom ${base}mm. Reductions ${reductionTotal}mm.`;
  if (hasValue) {
    if (availableInput >= required) {
      status = 'success';
      message = `Headroom OK: ${availableInput}mm available vs ${required}mm required.`;
    } else {
      status = 'error';
      message = `Headroom shortfall. Need ${required}mm, have ${availableInput}mm.`;
    }
  } else {
    message += ' Enter available headroom to validate.';
  }
  result.className = `report ${status !== 'warning' ? status : ''}`.trim();
  result.textContent = message;
  updateState(() => {
    state.proposed.headroom.available = hasValue ? availableInput : '';
    state.validation.headroomStatus = { status, required, available: hasValue ? availableInput : null };
  }, { silent: true });
}

function updateClearanceReport() {
  const report = $('#clearance-report');
  const boiler = getBoiler(state.proposed.boilerId);
  if (!boiler) {
    report.className = 'report';
    report.textContent = 'Select a boiler to validate clearances.';
    updateState(() => { state.validation.clearanceStatus = null; }, { silent: true });
    return;
  }
  const { height, width, depth } = state.current.measurements;
  if (!height || !width || !depth) {
    report.className = 'report warning';
    report.textContent = 'Enter height, width and depth measurements to validate.';
    updateState(() => { state.validation.clearanceStatus = { status: 'warn', message: report.textContent }; }, { silent: true });
    return;
  }
  const min = boiler.minSpace || {};
  const passHeight = !min.height || Number(height) >= min.height;
  const passWidth = !min.width || Number(width) >= min.width;
  const passDepth = !min.depth || Number(depth) >= min.depth;
  const passes = passHeight && passWidth && passDepth;
  report.className = `report ${passes ? 'success' : 'error'}`;
  report.textContent = passes
    ? `Measurements OK. Space ${height}×${width}×${depth}mm meets minimum ${min.height || '?'}×${min.width || '?'}×${min.depth || '?'}mm.`
    : `Shortfall. Need ${min.height || '?'}×${min.width || '?'}×${min.depth || '?'}mm.`;
  updateState(() => {
    state.validation.clearanceStatus = { status: passes ? 'success' : 'error', message: report.textContent };
  }, { silent: true });
}

$('#validate-clearance').addEventListener('click', () => {
  updateClearanceReport();
  scheduleSave();
});

function renderGasOptions() {
  const container = $('#gas-options');
  container.innerHTML = '';
  (priceBook.gasOptions || []).forEach((option) => {
    const row = document.createElement('label');
    row.className = 'check-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.proposed.gasOptionIds.includes(option.id);
    checkbox.addEventListener('change', () => {
      updateState(() => {
        if (checkbox.checked) {
          if (!state.proposed.gasOptionIds.includes(option.id)) state.proposed.gasOptionIds.push(option.id);
        } else {
          state.proposed.gasOptionIds = state.proposed.gasOptionIds.filter((id) => id !== option.id);
        }
      });
    });
    const label = document.createElement('span');
    label.className = 'label';
    label.innerHTML = `<strong>${option.name}</strong><br><span class="muted">${fmtGBP(option.cost)} · ${option.hours} hrs</span>`;
    const desc = document.createElement('span');
    desc.className = 'muted value';
    desc.textContent = option.description || '';
    row.append(checkbox, label, desc);
    container.append(row);
  });
}

function renderCondensateOptions() {
  const container = $('#condensate-options');
  container.innerHTML = '';
  (priceBook.condensateOptions || []).forEach((option) => {
    const row = document.createElement('label');
    row.className = 'check-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.proposed.condensateOptionIds.includes(option.id);
    checkbox.addEventListener('change', () => {
      updateState(() => {
        if (checkbox.checked) {
          if (!state.proposed.condensateOptionIds.includes(option.id)) state.proposed.condensateOptionIds.push(option.id);
        } else {
          state.proposed.condensateOptionIds = state.proposed.condensateOptionIds.filter((id) => id !== option.id);
        }
      });
    });
    const label = document.createElement('span');
    label.className = 'label';
    label.innerHTML = `<strong>${option.name}</strong><br><span class="muted">${fmtGBP(option.cost)} · ${option.hours} hrs</span>`;
    const desc = document.createElement('span');
    desc.className = 'muted value';
    desc.textContent = option.description || '';
    row.append(checkbox, label, desc);
    container.append(row);
  });
  $('#condensate-notes').value = state.proposed.condensateNotes || '';
  $('#condensate-notes').addEventListener('input', (e) => updateState(() => { state.proposed.condensateNotes = e.target.value; }));
}
function renderComponentMap() {
  const map = $('#component-map');
  map.innerHTML = '';
  const categories = groupComponentsByCategory();
  const keys = Object.keys(categories);
  if (!keys.length) {
    map.innerHTML = '<p class="muted">No components defined in price book.</p>';
    return;
  }
  keys.forEach((category, idx) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'component-tile';
    const info = getCategoryInfo(category);
    tile.innerHTML = `<div style="font-size:1.5rem">${info.icon}</div><strong>${info.label}</strong><span class="muted">${categories[category].length} items</span>`;
    if (idx === 0) tile.classList.add('active');
    tile.addEventListener('click', () => {
      $$('#component-map .component-tile').forEach((btn) => btn.classList.remove('active'));
      tile.classList.add('active');
      showComponentCategory(category);
    });
    map.append(tile);
  });
  showComponentCategory(keys[0]);
}

function groupComponentsByCategory() {
  return (priceBook.components || []).reduce((acc, comp) => {
    if (!acc[comp.category]) acc[comp.category] = [];
    acc[comp.category].push(comp);
    return acc;
  }, {});
}

function getCategoryInfo(category) {
  const info = {
    cylinders: { label: 'Cylinders', icon: '🛢️' },
    controls: { label: 'Controls', icon: '🎛️' },
    'user-controls': { label: 'User controls', icon: '🧭' },
    rads: { label: 'Radiators', icon: '♨️' },
    valves: { label: 'Valves', icon: '🔧' },
    tanks: { label: 'Tanks', icon: '🛁' },
    'add-ons': { label: 'Add-ons', icon: '➕' },
    services: { label: 'Services', icon: '🛠️' },
    'water-treatment': { label: 'Water treatment', icon: '💧' },
    'plant-room': { label: 'Plant room', icon: '🏭' },
    electrical: { label: 'Electrical', icon: '⚡' },
    civils: { label: 'Civils', icon: '🚧' }
  };
  return info[category] || { label: category, icon: '⚙️' };
}

function showComponentCategory(category) {
  const detail = $('#component-detail');
  detail.innerHTML = '';
  $('#component-detail-title').textContent = getCategoryInfo(category).label;
  const components = groupComponentsByCategory()[category] || [];
  if (!components.length) {
    detail.innerHTML = '<p class="muted">No items in this category.</p>';
    return;
  }
  const template = $('#component-template');
  components.forEach((comp) => {
    const frag = template.content.cloneNode(true);
    frag.querySelector('h4').textContent = comp.name;
    frag.querySelector('p').textContent = `${fmtGBP(comp.cost)} · ${comp.hours} hrs`;
    const input = frag.querySelector('input');
    input.value = state.components[comp.id] || 0;
    input.addEventListener('input', () => {
      const qty = Math.max(0, Math.round(Number(input.value) || 0));
      input.value = qty;
      updateState(() => {
        if (qty > 0) state.components[comp.id] = qty;
        else delete state.components[comp.id];
      });
    });
    detail.append(frag);
  });
}

function renderChecklists() {
  renderChecklist('photos', '#photo-checklist');
  renderChecklist('observations', '#observation-checklist');
}

function renderChecklist(kind, selector) {
  const list = $(selector);
  list.innerHTML = '';
  (state.checklists[kind] || []).forEach((item) => {
    const li = document.createElement('li');
    const header = document.createElement('div');
    header.className = 'checklist-header';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(item.done);
    checkbox.addEventListener('change', () => {
      item.done = checkbox.checked;
      scheduleSave();
      updateStepStatuses();
    });
    const label = document.createElement('label');
    label.textContent = item.label;
    header.append(checkbox, label);
    li.append(header);
    const notes = document.createElement('textarea');
    notes.placeholder = 'Notes / file name';
    notes.value = item.notes || '';
    notes.dataset.checklistId = item.id;
    notes.dataset.checklistKind = kind;
    notes.addEventListener('input', () => {
      item.notes = notes.value;
      scheduleSave();
    });
    li.append(notes);
    list.append(li);
  });
}

function restoreChecklistTextareas() {
  $$('#photo-checklist textarea, #observation-checklist textarea').forEach((textarea) => {
    const kind = textarea.dataset.checklistKind;
    const item = (state.checklists[kind] || []).find((entry) => entry.id === textarea.dataset.checklistId);
    if (item) textarea.value = item.notes || '';
  });
}

$('#add-photo-prompt').addEventListener('click', () => {
  const value = prompt('Enter additional photo requirement');
  if (value) {
    updateState(() => { state.checklists.photos.push(createChecklistItem(value)); });
    renderChecklist('photos', '#photo-checklist');
  }
});

$('#add-observation').addEventListener('click', () => {
  const value = prompt('Enter observation to capture');
  if (value) {
    updateState(() => { state.checklists.observations.push(createChecklistItem(value)); });
    renderChecklist('observations', '#observation-checklist');
  }
});

function createChecklistItem(label) {
  checklistCounter += 1;
  return { id: `chk-${Date.now()}-${checklistCounter}`, label, done: false, notes: '' };
}
function setupPhotoPond() {
  const input = $('#photo-uploader');
  if (!input) return;
  pond = FilePond.create(input, {
    allowMultiple: true,
    allowProcess: false,
    credits: false
  });

  pond.on('addfile', async (error, fileItem) => {
    if (error) {
      console.error(error);
      return;
    }
    try {
      const asset = await processPhoto(fileItem);
      updateState(() => { state.photos.push(asset); });
      renderPhotoGallery();
    } catch (err) {
      console.error('Failed to process photo', err);
      pond.removeFile(fileItem.id);
    }
  });

  pond.on('removefile', (fileItem) => {
    updateState(() => {
      state.photos = state.photos.filter((photo) => photo.id !== fileItem.id);
    });
    renderPhotoGallery();
  });
}

async function processPhoto(fileItem) {
  const file = fileItem.file;
  const { blob, dataUrl, width, height } = await compressImage(file);
  return {
    id: fileItem.id,
    name: file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, ''),
    blob,
    dataUrl,
    width,
    height,
    size: blob.size
  };
}

async function compressImage(file) {
  const maxEdge = 1600;
  const quality = 0.82;
  const base64 = await readFileAsDataURL(file);
  const img = await loadImage(base64);
  const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const targetWidth = Math.round(img.width * ratio);
  const targetHeight = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  const resized = canvas.toDataURL('image/jpeg', quality);
  return { blob, dataUrl: resized, width: targetWidth, height: targetHeight };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function renderPhotoGallery() {
  const gallery = $('#photo-gallery');
  gallery.innerHTML = '';
  if (!state.photos.length) {
    gallery.innerHTML = '<p class="muted">No photos captured yet.</p>';
    return;
  }
  state.photos.forEach((photo, idx) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    const img = document.createElement('img');
    img.src = photo.dataUrl;
    img.alt = photo.name || `Photo ${idx + 1}`;
    const meta = document.createElement('div');
    meta.innerHTML = `<strong>${photo.name || `photo-${idx + 1}.jpg`}</strong><span class="muted">${Math.round(photo.size / 1024)} kB · ${photo.width}×${photo.height}</span>`;
    const footer = document.createElement('footer');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost small';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (pond) pond.removeFile(photo.id);
      updateState(() => { state.photos = state.photos.filter((p) => p.id !== photo.id); });
      renderPhotoGallery();
    });
    footer.append(remove);
    card.append(img, meta, footer);
    gallery.append(card);
  });
}
function attachActions() {
  $('#current-notes').value = state.current.notes || '';
  $('#current-notes').addEventListener('input', (e) => updateState(() => { state.current.notes = e.target.value; }));
  $('#measure-height').value = state.current.measurements.height || '';
  $('#measure-width').value = state.current.measurements.width || '';
  $('#measure-depth').value = state.current.measurements.depth || '';
  $('#measure-notes').value = state.current.measurements.notes || '';
  $('#current-flow').value = state.current.flowAt1Bar || '';

  $('#measure-height').addEventListener('input', (e) => updateState(() => { state.current.measurements.height = e.target.value; }));
  $('#measure-width').addEventListener('input', (e) => updateState(() => { state.current.measurements.width = e.target.value; }));
  $('#measure-depth').addEventListener('input', (e) => updateState(() => { state.current.measurements.depth = e.target.value; }));
  $('#measure-notes').addEventListener('input', (e) => updateState(() => { state.current.measurements.notes = e.target.value; }));
  $('#current-flow').addEventListener('input', (e) => updateState(() => { state.current.flowAt1Bar = e.target.value; }));

  $('#proposed-notes').value = state.proposed.notes || '';
  $('#proposed-notes').addEventListener('input', (e) => updateState(() => { state.proposed.notes = e.target.value; }));

  $('#copy-customer-summary').addEventListener('click', () => copyText($('#customer-summary').value));
  $('#copy-installation').addEventListener('click', () => copyText($('#installation-summary').value));

  $('#export-save-draft').addEventListener('click', downloadDraft);
  $('#export-import-draft').addEventListener('click', () => $('#import-draft-input').click());
  $('#import-draft-input').addEventListener('change', handleDraftImport);
  $('#export-clear-draft').addEventListener('click', clearDraft);
  $('#export-generate').addEventListener('click', generateZip);
}

function updateState(mutator, options = {}) {
  mutator();
  if (!options.silent) {
    updateDerivedOutputs();
    scheduleSave();
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
    } catch (err) {
      console.warn('Failed to store draft', err);
    }
  }, 500);
}

function serializeState() {
  const clone = JSON.parse(JSON.stringify({ ...state, photos: [] }));
  clone.photos = state.photos.map((photo, idx) => ({
    id: photo.id,
    name: photo.name || `photo-${idx + 1}.jpg`,
    width: photo.width,
    height: photo.height,
    size: photo.size,
    dataUrl: photo.dataUrl
  }));
  return clone;
}
function updateDerivedOutputs() {
  const lines = collectLines();
  state.cachedLines = lines;
  renderBasket(lines);
  renderSummaries(lines);
  renderJobJson(lines);
  renderValidations();
  updateStepStatuses();
}

function collectLines() {
  const lines = [];
  const basePack = getPack(state.current.basePackId);
  if (basePack) {
    const totals = packTotals(basePack);
    lines.push({ id: basePack.id, label: basePack.name, cost: totals.cost, hours: totals.hours });
  }
  const conversionPack = getPack(state.proposed.conversionPackId);
  if (conversionPack) {
    const totals = packTotals(conversionPack);
    lines.push({ id: conversionPack.id, label: conversionPack.name, cost: totals.cost, hours: totals.hours });
  }
  const boiler = getBoiler(state.proposed.boilerId);
  if (boiler) {
    lines.push({ id: boiler.id, label: boiler.name, cost: boiler.cost, hours: boiler.hours });
  }
  const flueSel = getFlueSelection();
  if (flueSel) {
    const cost = flueSel.flue.cost + (flueSel.variant?.cost || 0);
    const hours = flueSel.flue.hours + (flueSel.variant?.hours || 0);
    lines.push({ id: `${flueSel.flue.id}-${flueSel.variant?.id || 'std'}`, label: `${flueSel.flue.name} – ${flueSel.variant?.label || 'Standard'}`, cost, hours });
  }
  state.proposed.gasOptionIds.forEach((id) => {
    const opt = getGasOption(id);
    if (opt) lines.push({ id: opt.id, label: opt.name, cost: opt.cost, hours: opt.hours });
  });
  state.proposed.condensateOptionIds.forEach((id) => {
    const opt = getCondensateOption(id);
    if (opt) lines.push({ id: opt.id, label: opt.name, cost: opt.cost, hours: opt.hours });
  });
  Object.entries(state.components).forEach(([id, qty]) => {
    const comp = getComponent(id);
    if (comp && qty > 0) {
      lines.push({ id: comp.id, label: `${qty}× ${comp.name}`, cost: comp.cost * qty, hours: comp.hours * qty });
    }
  });
  return lines;
}

function renderBasket(lines) {
  const list = $('#basket-lines');
  list.innerHTML = '';
  lines.forEach((line) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${line.label}</span><span>${fmtGBP(line.cost)} · ${line.hours.toFixed(2)} hrs</span>`;
    list.append(li);
  });
  const hoursContainer = $('#basket-hours');
  hoursContainer.innerHTML = '';
  let totalHours = 0;
  lines.forEach((line) => {
    const dt = document.createElement('dt');
    dt.textContent = line.label;
    const dd = document.createElement('dd');
    dd.textContent = `${line.hours.toFixed(2)} hrs`;
    hoursContainer.append(dt, dd);
    totalHours += line.hours;
  });
  $('#basket-total-hours').textContent = totalHours.toFixed(2);

  const costsContainer = $('#basket-costs');
  costsContainer.innerHTML = '';
  let totalParts = 0;
  lines.forEach((line) => {
    const dt = document.createElement('dt');
    dt.textContent = line.label;
    const dd = document.createElement('dd');
    dd.textContent = fmtGBP(line.cost);
    costsContainer.append(dt, dd);
    totalParts += line.cost;
  });
  const labour = totalHours * (state.meta.labourRate || 0);
  $('#basket-total-parts').textContent = fmtGBP(totalParts);
  $('#basket-total-labour').textContent = fmtGBP(labour);
  $('#basket-labour-rate').textContent = Number(state.meta.labourRate || 0).toFixed(0);
  $('#basket-grand-total').textContent = fmtGBP(totalParts + labour);
}

function renderSummaries(lines) {
  $('#customer-summary').value = buildCustomerSummary(lines);
  $('#installation-summary').value = buildInstallationSummary(lines);
}

function buildCustomerSummary(lines) {
  const customer = getCustomer();
  const existing = getExistingType();
  const system = getSystemOption();
  const boiler = getBoiler(state.proposed.boilerId);
  const flueSel = getFlueSelection();
  const packs = lines.filter((line) => line.id.startsWith('pack')).map((line) => `${line.label} (${fmtGBP(line.cost)})`).join('\n');
  const components = Object.entries(state.components).map(([id, qty]) => `${qty}× ${getComponent(id)?.name || id}`).join(', ');
  const photos = state.checklists.photos.filter((p) => p.done || p.notes).map((p) => `• ${p.label}${p.notes ? ` – ${p.notes}` : ''}`).join('\n');
  return [
    customer ? `${customer.name} – ${customer.address}` : 'Customer pending selection',
    existing ? `Existing system: ${existing.name}. Base pack ${getPack(state.current.basePackId)?.name || 'n/a'}.` : 'Existing system not captured.',
    system ? `Proposed system: ${system.name}. Location ${state.current.location || 'n/a'} → ${state.proposed.location || 'n/a'}.` : 'System to be confirmed.',
    boiler ? `Boiler: ${boiler.name} (${boiler.output}).` : 'Boiler pending selection.',
    flueSel ? `Flue: ${flueSel.flue.name} – ${flueSel.variant?.label || 'Standard'}. Headroom requirement ${state.validation.headroomStatus?.required || '?'}mm.` : 'Flue to be confirmed.',
    packs ? `Included packs:\n${packs}` : 'No packs selected.',
    components ? `Additional components: ${components}` : 'No additional components recorded.',
    photos ? `Photo notes:\n${photos}` : 'Photo prompts pending.'
  ].join('\n\n');
}

function buildInstallationSummary(lines) {
  const measurement = state.current.measurements;
  const boiler = getBoiler(state.proposed.boilerId);
  const flueSel = getFlueSelection();
  const notes = [];
  const basePack = getPack(state.current.basePackId);
  if (basePack) notes.push(`Base pack: ${basePack.summary}`);
  const conversionPack = getPack(state.proposed.conversionPackId);
  if (conversionPack) notes.push(`Conversion pack: ${conversionPack.summary}`);
  if (measurement.height && measurement.width && measurement.depth) {
    notes.push(`Measured space ${measurement.height}×${measurement.width}×${measurement.depth}mm. Notes: ${measurement.notes || 'n/a'}.`);
  }
  if (boiler) {
    const clearance = boiler.requiredClearance || {};
    notes.push(`Install ${boiler.name}. Clearances top ${clearance.top || '?'}mm, bottom ${clearance.bottom || '?'}mm, sides ${clearance.left || '?'} / ${clearance.right || '?'}mm, front ${clearance.front || '?'}mm.`);
  }
  if (flueSel) {
    notes.push(`Flue ${flueSel.flue.name} (${flueSel.flue.type}), variant ${flueSel.variant?.label || 'standard'}. Headroom required ${state.validation.headroomStatus?.required || '?'}mm.`);
  }
  if (state.proposed.gasOptionIds.length) {
    notes.push(`Gas works: ${state.proposed.gasOptionIds.map((id) => getGasOption(id)?.name).filter(Boolean).join(', ')}.`);
  }
  if (state.proposed.condensateOptionIds.length || state.proposed.condensateNotes) {
    const names = state.proposed.condensateOptionIds.map((id) => getCondensateOption(id)?.name).filter(Boolean).join(', ');
    notes.push(`Condensate: ${names || 'standard run'}. ${state.proposed.condensateNotes || ''}`.trim());
  }
  Object.entries(state.components).forEach(([id, qty]) => {
    const comp = getComponent(id);
    if (comp && qty) notes.push(`${qty}× ${comp.name}`);
  });
  if (state.checklists.observations.length) {
    const obs = state.checklists.observations.map((o) => `${o.done ? '⚠️' : '•'} ${o.label}${o.notes ? ` – ${o.notes}` : ''}`).join('\n');
    notes.push(`Observations:\n${obs}`);
  }
  return notes.join('\n\n');
}

function renderJobJson(lines) {
  const payload = buildJobPayload(lines);
  $('#job-json').value = JSON.stringify(payload, null, 2);
}

function buildJobPayload(lines) {
  return {
    generatedAt: new Date().toISOString(),
    priceBookVersion: priceBook.version,
    meta: state.meta,
    current: {
      type: getExistingType() || null,
      basePack: getPack(state.current.basePackId) || null,
      location: state.current.location,
      notes: state.current.notes,
      flowAt1Bar: state.current.flowAt1Bar,
      measurements: state.current.measurements
    },
    proposed: {
      system: getSystemOption() || null,
      conversionPack: getPack(state.proposed.conversionPackId) || null,
      location: state.proposed.location,
      notes: state.proposed.notes,
      boiler: getBoiler(state.proposed.boilerId) || null,
      flue: getFlueSelection() || null,
      headroom: state.validation.headroomStatus,
      gasOptions: state.proposed.gasOptionIds.map(getGasOption).filter(Boolean),
      condensateOptions: state.proposed.condensateOptionIds.map(getCondensateOption).filter(Boolean),
      condensateNotes: state.proposed.condensateNotes
    },
    components: Object.entries(state.components).map(([id, qty]) => ({ ...getComponent(id), qty })).filter(Boolean),
    checklists: state.checklists,
    photos: state.photos.map((photo, idx) => ({
      fileName: photo.name || `photo-${idx + 1}.jpg`,
      width: photo.width,
      height: photo.height,
      size: photo.size
    })),
    pricing: buildPricingSummary(lines)
  };
}

function buildPricingSummary(lines) {
  const totals = lines.reduce((acc, line) => {
    acc.parts += line.cost;
    acc.hours += line.hours;
    return acc;
  }, { parts: 0, hours: 0 });
  const labour = totals.hours * (state.meta.labourRate || 0);
  return {
    lines,
    totals: {
      parts: totals.parts,
      hours: totals.hours,
      labourRate: state.meta.labourRate,
      labour,
      grandTotal: totals.parts + labour
    }
  };
}
function renderValidations() {
  const list = $('#validation-list');
  list.innerHTML = '';
  buildValidationItems().forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.title}</strong><span class="muted">${item.message}</span>`;
    if (item.status === 'ok') {
      li.style.borderColor = 'rgba(74, 222, 128, 0.4)';
    } else if (item.status === 'warn') {
      li.style.borderColor = 'rgba(250, 204, 21, 0.4)';
    } else {
      li.style.borderColor = 'rgba(248, 113, 113, 0.6)';
    }
    list.append(li);
  });
}

function buildValidationItems() {
  const items = [];
  const metaComplete = state.meta.customerId && state.meta.jobName && state.meta.adviser;
  items.push({
    status: metaComplete ? 'ok' : 'error',
    title: 'Job meta complete',
    message: metaComplete ? 'Customer, job name and adviser captured.' : 'Set customer, job name and adviser.'
  });
  items.push({
    status: state.current.typeId ? 'ok' : 'error',
    title: 'Existing system selected',
    message: state.current.typeId ? `Base pack ${getPack(state.current.basePackId)?.name || 'not set'}` : 'Select existing boiler type.'
  });
  const proposedReady = state.proposed.systemId && state.proposed.boilerId && state.proposed.flueSelection;
  items.push({
    status: proposedReady ? 'ok' : 'error',
    title: 'Proposed system configured',
    message: proposedReady ? 'System, boiler and flue selections captured.' : 'Select system, boiler and flue.'
  });
  const flowValue = Number(state.current.flowAt1Bar);
  const system = getSystemOption();
  const combiWarning = system?.boilerType === 'combi' && Number.isFinite(flowValue) && flowValue > 0 && flowValue < 10;
  items.push({
    status: combiWarning ? 'warn' : 'ok',
    title: 'Combi flow check',
    message: combiWarning ? `Measured flow ${flowValue} lpm below recommended 10 lpm.` : 'Flow rate acceptable.'
  });
  const clearanceStatus = state.validation.clearanceStatus?.status || 'warn';
  items.push({
    status: clearanceStatus === 'success' ? 'ok' : clearanceStatus,
    title: 'Cabinet clearance',
    message: state.validation.clearanceStatus?.message || 'Run clearance validation.'
  });
  const headroomStatus = state.validation.headroomStatus?.status || 'warn';
  items.push({
    status: headroomStatus === 'success' ? 'ok' : headroomStatus,
    title: 'Flue headroom',
    message: headroomStatus === 'error' ? 'Headroom shortfall detected.' : headroomStatus === 'success' ? 'Headroom confirmed.' : 'Enter headroom to validate.'
  });
  items.push({
    status: state.photos.length ? 'ok' : 'warn',
    title: 'Photos captured',
    message: state.photos.length ? `${state.photos.length} photos ready.` : 'Capture photos before export.'
  });
  return items;
}

function updateStepStatuses() {
  const stepStates = {
    meta: state.meta.customerId && state.meta.jobName && state.meta.adviser,
    current: Boolean(state.current.typeId),
    proposed: Boolean(state.proposed.systemId && state.proposed.boilerId && state.proposed.flueSelection),
    addons: true,
    photos: state.photos.length > 0 || state.checklists.photos.some((p) => p.done),
    basket: state.cachedLines.length > 0,
    validate: buildValidationItems().every((item) => item.status !== 'error'),
    export: false
  };
  $$('.step-link').forEach((link) => {
    const step = link.dataset.step;
    link.classList.remove('completed', 'pending', 'error');
    if (stepStates[step]) {
      link.classList.add('completed');
    } else {
      const hasWarning = step === 'photos' ? !stepStates[step] : false;
      if (step === 'validate' && stepStates.validate === false) {
        link.classList.add('pending');
      } else if (step === 'meta' || step === 'current' || step === 'proposed') {
        link.classList.add('error');
      } else if (hasWarning) {
        link.classList.add('pending');
      }
    }
  });
}
async function downloadDraft() {
  const data = JSON.stringify(serializeState(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `quote-draft-${dayjs().format('YYYYMMDD-HHmmss')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  $('#export-status').textContent = 'Draft downloaded.';
}

function handleDraftImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      mergeState(state, data);
      updateDerivedOutputs();
      renderCustomers();
      renderCustomerDetails();
      renderExistingTypes();
      renderHouseButtons('current-location', 'current');
      renderHouseButtons('proposed-location', 'proposed');
      renderSystemOptions();
      renderBoilerOptions();
      renderFlueOptions();
      renderGasOptions();
      renderCondensateOptions();
      renderComponentMap();
      renderChecklists();
      restoreChecklistTextareas();
      renderPhotoGallery();
      attachActions();
      $('#export-status').textContent = 'Draft imported successfully.';
    } catch (err) {
      console.error('Import failed', err);
      $('#export-status').textContent = 'Failed to import draft. Invalid JSON.';
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
  $('#export-status').textContent = 'Local draft cleared.';
}

async function generateZip() {
  const status = $('#export-status');
  status.textContent = 'Generating documents…';
  try {
    const zip = new JSZip();
    const lines = state.cachedLines;
    const jobPayload = buildJobPayload(lines);
    const [quotePdf, customerPdf, installPdf] = await Promise.all([
      createQuotePdf(lines),
      createNarrativePdf('Customer Summary', $('#customer-summary').value),
      createNarrativePdf('Installation Notes', $('#installation-summary').value)
    ]);
    const docs = zip.folder('documents');
    docs.file('Quote.pdf', quotePdf, { binary: true });
    docs.file('Customer-Summary.pdf', customerPdf, { binary: true });
    docs.file('Installation-Notes.pdf', installPdf, { binary: true });

    const photos = zip.folder('photos');
    await Promise.all(state.photos.map(async (photo, idx) => {
      const blob = photo.blob || dataUrlToBlob(photo.dataUrl);
      if (blob) {
        photos.file(photo.name || `photo-${idx + 1}.jpg`, blob, { binary: true });
      }
    }));

    const dataFolder = zip.folder('data');
    dataFolder.file('Job.json', JSON.stringify(jobPayload, null, 2));
    dataFolder.file('pricebook_version.json', JSON.stringify({ version: priceBook.version, generatedAt: priceBook.generatedAt }, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quote-pack-${dayjs().format('YYYYMMDD-HHmmss')}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    status.textContent = 'ZIP generated successfully.';
  } catch (err) {
    console.error(err);
    status.textContent = 'Failed to generate ZIP. See console for details.';
  }
}

async function createQuotePdf(lines) {
  const pdfDoc = await PDFLib.PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([595.28, 841.89]);
  let y = page.getHeight() - 72;
  const margin = 56;
  ({ page, y } = drawTitle(pdfDoc, page, boldFont, 'Hydronic Installation Quote', y));
  ({ page, y } = drawParagraph(pdfDoc, page, regularFont, `Customer: ${getCustomer()?.name || 'TBC'}`, y, margin));
  ({ page, y } = drawParagraph(pdfDoc, page, regularFont, `Generated: ${formatDate(new Date())}`, y, margin));
  y -= 12;
  ({ page, y } = drawParagraph(pdfDoc, page, boldFont, 'Line Items:', y, margin, 12));
  lines.forEach((line) => {
    ({ page, y } = drawParagraph(pdfDoc, page, regularFont, `${line.label} — ${fmtGBP(line.cost)} · ${line.hours.toFixed(2)} hrs`, y, margin, 11));
  });
  const pricing = buildPricingSummary(lines).totals;
  y -= 8;
  ({ page, y } = drawParagraph(pdfDoc, page, boldFont, `Parts total: ${fmtGBP(pricing.parts)}`, y, margin, 12));
  ({ page, y } = drawParagraph(pdfDoc, page, boldFont, `Hours: ${pricing.hours.toFixed(2)} · Labour @ £${pricing.labourRate}/hr = ${fmtGBP(pricing.labour)}`, y, margin, 12));
  ({ page, y } = drawParagraph(pdfDoc, page, boldFont, `Grand total: ${fmtGBP(pricing.grandTotal)}`, y, margin, 12));
  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

async function createNarrativePdf(title, body) {
  const pdfDoc = await PDFLib.PDFDocument.create();
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  let page = pdfDoc.addPage([595.28, 841.89]);
  let y = page.getHeight() - 72;
  const margin = 56;
  ({ page, y } = drawTitle(pdfDoc, page, font, title, y));
  y -= 12;
  const lines = body.split('\n');
  lines.forEach((line) => {
    ({ page, y } = drawParagraph(pdfDoc, page, font, line || ' ', y, margin, 11));
  });
  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

function drawTitle(pdfDoc, page, font, text, y) {
  if (y < 56) {
    page = pdfDoc.addPage([595.28, 841.89]);
    y = page.getHeight() - 56;
  }
  page.drawText(text, { x: 56, y, size: 18, font, color: PDFLib.rgb(0.1, 0.2, 0.4) });
  return { page, y: y - 28 };
}

function drawParagraph(pdfDoc, page, font, text, y, margin, size = 11) {
  const maxWidth = page.getWidth() - margin * 2;
  const lines = wrapText(text, font, size, maxWidth);
  lines.forEach((line) => {
    if (y < margin) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = page.getHeight() - margin;
    }
    page.drawText(line, { x: margin, y, size, font, color: PDFLib.rgb(0, 0, 0) });
    y -= size + 4;
  });
  return { page, y };
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
function packTotals(pack) {
  if (!pack) return { cost: 0, hours: 0 };
  return (pack.parts || []).reduce((acc, part) => {
    acc.cost += Number(part.cost) || 0;
    acc.hours += Number(part.hours) || 0;
    return acc;
  }, { cost: 0, hours: Number(pack.hours) || 0 });
}

function getCustomer() {
  return (priceBook.customers || []).find((c) => c.id === state.meta.customerId) || null;
}

function getExistingType() {
  return (priceBook.boilerTypes || []).find((type) => type.id === state.current.typeId) || null;
}

function getPack(id) {
  return (priceBook.packs || []).find((pack) => pack.id === id) || null;
}

function getSystemOption() {
  return (priceBook.systemOptions || []).find((sys) => sys.id === state.proposed.systemId) || null;
}

function getBoiler(id) {
  if (!id) return null;
  return (priceBook.boilers || []).find((boiler) => boiler.id === id) || null;
}

function getBoilersForSystem(system) {
  if (!system) return [];
  const all = priceBook.boilers || [];
  const filtered = system.boilerType ? all.filter((boiler) => boiler.type === system.boilerType) : all;
  return filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function isBoilerCompatibleWithSystem(boiler, system) {
  if (!boiler || !system) return false;
  if (system.boilerType) {
    return boiler.type === system.boilerType;
  }
  return true;
}

function getFlue(id) {
  if (!id) return null;
  return (priceBook.flues || []).find((flue) => flue.id === id) || null;
}

function getFlueSelection() {
  const sel = state.proposed.flueSelection;
  if (!sel) return null;
  const flue = getFlue(sel.flueId);
  if (!flue) return null;
  const variant = (flue.variants || []).find((v) => v.id === sel.variantId) || null;
  return { flue, variant };
}

function getGasOption(id) {
  return (priceBook.gasOptions || []).find((opt) => opt.id === id) || null;
}

function getCondensateOption(id) {
  return (priceBook.condensateOptions || []).find((opt) => opt.id === id) || null;
}

function getComponent(id) {
  return (priceBook.components || []).find((comp) => comp.id === id) || null;
}

function fmtGBP(value) {
  return `£${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn('Clipboard write failed', err);
  }
}

function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;
  const meta = parts[0];
  const base64 = parts[1];
  const mimeMatch = /data:(.*?);base64/.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
