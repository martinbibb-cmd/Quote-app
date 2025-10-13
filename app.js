const state = {
  customerId: null,
  existingTypeId: null,
  basePackId: null,
  newSystemId: null,
  conversionPackId: null,
  measurements: { height: null, width: null, depth: null, notes: "" },
  location: { current: null, proposed: null, notes: "" },
  photoItems: [],
  observationItems: [],
  boilerId: null,
  flueSelection: null, // { flueId, variantId }
  gasOptionIds: new Set(),
  condensateOptionIds: new Set(),
  components: {}, // id -> qty
  labourRate: 0
};

let priceBook = null;
let flueTypeFilter = null;
let checklistId = 0;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const fmtGBP = (v) => `£${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const res = await fetch('Data/price-book.json');
    if (!res.ok) throw new Error('Failed to load price book');
    priceBook = await res.json();
  } catch (err) {
    console.error(err);
    alert('Unable to load price book JSON. Check Data/price-book.json.');
    return;
  }

  state.labourRate = priceBook.labourRate || 0;
  $('#labour-rate').textContent = state.labourRate;

  initStepNavigation();
  populateCustomers();
  renderBoilerTypes();
  renderSystemOptions();
  renderHouseRooms();
  renderGasOptions();
  renderCondensateOptions();
  renderComponentMap();

  $('#measure-height').addEventListener('input', (e) => { state.measurements.height = toNumber(e.target.value); });
  $('#measure-width').addEventListener('input', (e) => { state.measurements.width = toNumber(e.target.value); });
  $('#measure-depth').addEventListener('input', (e) => { state.measurements.depth = toNumber(e.target.value); });
  $('#measure-notes').addEventListener('input', (e) => { state.measurements.notes = e.target.value; updateSummary(); });

  $('#location-notes').addEventListener('input', (e) => { state.location.notes = e.target.value; updateSummary(); });

  $('#add-photo').addEventListener('click', () => {
    const name = prompt('Describe the additional photo requirement');
    if (name) {
      state.photoItems.push(createChecklistItem(name));
      renderChecklist('photo');
      updateSummary();
    }
  });

  $('#add-observation').addEventListener('click', () => {
    const name = prompt('Describe the additional observation to record');
    if (name) {
      state.observationItems.push(createChecklistItem(name));
      renderChecklist('observation');
      updateSummary();
    }
  });

  $('#check-clearances').addEventListener('click', validateClearances);
  $('#copy-presentation').addEventListener('click', () => copyText($('#customer-presentation').value));
  $('#copy-notes').addEventListener('click', () => copyText($('#installation-notes').value));
  $('#submit-quote').addEventListener('click', submitQuote);

  updateSummary();
}

function initStepNavigation() {
  $$('.step-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = btn.dataset.step;
      $$('.step-link').forEach((b) => b.classList.toggle('active', b === btn));
      $$('.step-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `step-${step}`));
      if (btn.scrollIntoView) btn.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    });
  });
}

function populateCustomers() {
  const select = $('#customer-select');
  select.innerHTML = '<option value="">Select customer…</option>';
  for (const customer of priceBook.customers || []) {
    const opt = document.createElement('option');
    opt.value = customer.id;
    opt.textContent = customer.name;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    state.customerId = select.value || null;
    updateCustomerDetails();
    updateSummary();
  });
}

function updateCustomerDetails() {
  const container = $('#customer-details');
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
  for (const [label, value] of entries) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    container.append(dt, dd);
  }
}

function renderBoilerTypes() {
  const grid = $('#boiler-type-grid');
  grid.innerHTML = '';
  for (const type of priceBook.boilerTypes || []) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'type-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <span class="icon" style="background:${type.imageTint || '#1e293b'}">🔥</span>
      <h4>${type.name}</h4>
      <p>${type.description}</p>
    `;
    card.addEventListener('click', () => {
      if (state.existingTypeId === type.id) return;
      state.existingTypeId = type.id;
      state.basePackId = type.basePack || null;
      loadChecklists(type);
      renderBoilerTypeActive();
      updateWorkingMemory();
      updateSummary();
    });
    grid.append(card);
  }
  renderBoilerTypeActive();
}

function renderBoilerTypeActive() {
  const cards = $$('#boiler-type-grid .type-card');
  cards.forEach((card, idx) => {
    const type = priceBook.boilerTypes[idx];
    card.classList.toggle('active', type && type.id === state.existingTypeId);
  });
}

function loadChecklists(type) {
  state.photoItems = (type.photos || []).map((label) => createChecklistItem(label));
  state.observationItems = (type.observations || []).map((label) => createChecklistItem(label));
  renderChecklist('photo');
  renderChecklist('observation');
}

function createChecklistItem(label) {
  checklistId += 1;
  return { id: `item-${Date.now()}-${checklistId}`, label, done: false, notes: '' };
}

function renderChecklist(kind) {
  const list = kind === 'photo' ? $('#photo-list') : $('#observation-list');
  const items = kind === 'photo' ? state.photoItems : state.observationItems;
  list.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    const header = document.createElement('div');
    header.className = 'checklist-header';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.done;
    checkbox.addEventListener('change', () => {
      item.done = checkbox.checked;
      updateSummary();
    });
    const label = document.createElement('label');
    label.textContent = item.label;
    header.append(checkbox, label);
    const notes = document.createElement('textarea');
    notes.placeholder = 'Notes / file name';
    notes.value = item.notes;
    notes.addEventListener('input', () => {
      item.notes = notes.value;
      updateSummary();
    });
    li.append(header, notes);
    list.append(li);
  });
}

function renderSystemOptions() {
  const container = $('#system-options');
  container.innerHTML = '';
  for (const sys of priceBook.systemOptions || []) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'system-card';
    card.innerHTML = `<h4>${sys.name}</h4><p class="muted">${sys.description || ''}</p>`;
    card.addEventListener('click', () => {
      if (state.newSystemId === sys.id) return;
      state.newSystemId = sys.id;
      state.conversionPackId = sys.pack || null;
      renderSystemActive();
      renderBoilerOptions();
      renderFlueOptions();
      updateWorkingMemory();
      updateSummary();
    });
    container.append(card);
  }
  renderSystemActive();
}

function renderSystemActive() {
  const cards = $$('#system-options .system-card');
  cards.forEach((card, idx) => {
    const sys = priceBook.systemOptions[idx];
    card.classList.toggle('active', sys && sys.id === state.newSystemId);
  });
}

function renderHouseRooms() {
  const render = (containerId, target) => {
    const container = $(containerId);
    container.innerHTML = '';
    for (const room of priceBook.houseRooms || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'room-btn';
      btn.textContent = room;
      btn.addEventListener('click', () => {
        state.location[target] = room;
        renderHouseRooms();
        updateWorkingMemory();
        updateSummary();
      });
      const active = state.location[target] === room;
      if (active) btn.classList.add('active');
      container.append(btn);
    }
  };
  render('#current-rooms', 'current');
  render('#new-rooms', 'proposed');
}

function renderBoilerOptions() {
  const container = $('#boiler-options');
  container.innerHTML = '';
  const targetType = getNewSystemBoilerType();
  if (!targetType) {
    container.innerHTML = '<p class="muted">Select a new system to load compatible boilers.</p>';
    state.boilerId = null;
    updateWorkingMemory();
    updateSummary();
    return;
  }
  const options = (priceBook.boilers || []).filter((b) => b.type === targetType);
  if (!options.length) {
    container.innerHTML = '<p class="muted">No boilers available for the selected system type.</p>';
    state.boilerId = null;
    updateWorkingMemory();
    updateSummary();
    return;
  }
  options.forEach((boiler) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'option-card';
    const active = state.boilerId === boiler.id;
    if (active) card.classList.add('active');
    card.innerHTML = `
      <header>
        <div>
          <strong>${boiler.name}</strong>
          <div class="muted">${boiler.output}</div>
        </div>
        <div>
          <div>${fmtGBP(boiler.cost)}</div>
          <small class="muted">${boiler.hours} hrs</small>
        </div>
      </header>
      <div class="muted">Case ${boiler.case.height} × ${boiler.case.width} × ${boiler.case.depth}mm</div>
      <footer>${boiler.notes || ''}</footer>
    `;
    card.addEventListener('click', () => {
      state.boilerId = boiler.id;
      renderBoilerOptions();
      renderFlueOptions();
      updateWorkingMemory();
      updateSummary();
    });
    container.append(card);
  });
}

function renderFlueOptions() {
  const tabs = $('#flue-tabs');
  const variantsContainer = $('#flue-variants');
  const heatmap = $('#flue-heatmap');
  tabs.innerHTML = '';
  variantsContainer.innerHTML = '';
  heatmap.innerHTML = '';
  const boiler = getBoiler();
  if (!boiler) {
    variantsContainer.innerHTML = '<p class="muted">Select a boiler to show compatible flues.</p>';
    state.flueSelection = null;
    updateWorkingMemory();
    updateSummary();
    return;
  }
  const available = (priceBook.flues || []).filter((flue) => (flue.compatible || []).includes(boiler.id));
  if (!available.length) {
    variantsContainer.innerHTML = '<p class="muted">No flues listed for the chosen boiler.</p>';
    state.flueSelection = null;
    updateWorkingMemory();
    updateSummary();
    return;
  }
  const types = [...new Set(available.map((f) => f.type))];
  if (!flueTypeFilter || !types.includes(flueTypeFilter)) {
    flueTypeFilter = types[0];
  }
  types.forEach((type) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    btn.className = type === flueTypeFilter ? 'active' : '';
    btn.addEventListener('click', () => {
      flueTypeFilter = type;
      renderFlueOptions();
    });
    tabs.append(btn);
  });
  const filtered = available.filter((flue) => flue.type === flueTypeFilter);
  filtered.forEach((flue) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'option-card';
    const isActive = state.flueSelection && state.flueSelection.flueId === flue.id;
    if (isActive) card.classList.add('active');
    card.innerHTML = `
      <header>
        <div>
          <strong>${flue.name}</strong>
          <div class="muted">${flue.type} · zones: ${(flue.heatZones || []).length}</div>
        </div>
        <div>
          <div>${fmtGBP(flue.cost)}</div>
          <small class="muted">${flue.hours} hrs</small>
        </div>
      </header>
      <footer>${(flue.images && flue.images[flue.type]) || ''}</footer>
    `;
    card.addEventListener('click', () => {
      state.flueSelection = { flueId: flue.id, variantId: flue.variants?.[0]?.id || null };
      renderFlueOptions();
      updateWorkingMemory();
      updateSummary();
    });
    variantsContainer.append(card);
    if (state.flueSelection && state.flueSelection.flueId === flue.id) {
      renderFlueVariantSelector(flue);
      renderHeatmap(flue);
    }
  });
}

function renderFlueVariantSelector(flue) {
  const container = document.createElement('div');
  container.className = 'option-stack';
  (flue.variants || []).forEach((variant) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost small';
    btn.textContent = variant.label;
    if (state.flueSelection?.variantId === variant.id) {
      btn.classList.add('primary');
    }
    btn.addEventListener('click', () => {
      state.flueSelection = { flueId: flue.id, variantId: variant.id };
      renderFlueOptions();
      updateWorkingMemory();
      updateSummary();
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
    div.textContent = zone.replace(/-/g, ' ');
    if (state.flueSelection?.flueId === flue.id) {
      div.classList.add('active');
    }
    heatmap.append(div);
  });
}

function renderGasOptions() {
  const container = $('#gas-options');
  container.innerHTML = '';
  for (const option of priceBook.gasOptions || []) {
    const card = document.createElement('div');
    card.className = 'option-card';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.gasOptionIds.has(option.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.gasOptionIds.add(option.id);
      else state.gasOptionIds.delete(option.id);
      updateWorkingMemory();
      updateSummary();
    });
    card.append(checkbox);
    const title = document.createElement('div');
    title.innerHTML = `<strong>${option.name}</strong> <span class="muted">${fmtGBP(option.cost)} · ${option.hours} hrs</span>`;
    const desc = document.createElement('div');
    desc.className = 'muted';
    desc.textContent = option.description || '';
    card.append(title, desc);
    container.append(card);
  }
}

function renderCondensateOptions() {
  const container = $('#condensate-options');
  container.innerHTML = '';
  for (const option of priceBook.condensateOptions || []) {
    const card = document.createElement('div');
    card.className = 'option-card';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.condensateOptionIds.has(option.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.condensateOptionIds.add(option.id);
      else state.condensateOptionIds.delete(option.id);
      updateWorkingMemory();
      updateSummary();
    });
    card.append(checkbox);
    const title = document.createElement('div');
    title.innerHTML = `<strong>${option.name}</strong> <span class="muted">${fmtGBP(option.cost)} · ${option.hours} hrs</span>`;
    const desc = document.createElement('div');
    desc.className = 'muted';
    desc.textContent = option.description || '';
    card.append(title, desc);
    container.append(card);
  }
}

const COMPONENT_CATEGORY_INFO = {
  cylinders: { label: 'Cylinders', icon: '🛢️' },
  controls: { label: 'Controls', icon: '🎛️' },
  'user-controls': { label: 'User controls', icon: '🧭' },
  rads: { label: 'Radiators', icon: '♨️' },
  valves: { label: 'Valves', icon: '🔧' },
  tanks: { label: 'Tanks', icon: '🛁' },
  'add-ons': { label: 'Add-ons', icon: '➕' },
  services: { label: 'Services', icon: '🛠️' }
};

function renderComponentMap() {
  const map = $('#component-map');
  map.innerHTML = '';
  const categories = groupComponentsByCategory();
  Object.keys(categories).forEach((category) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'component-tile';
    const info = COMPONENT_CATEGORY_INFO[category] || { label: category, icon: '⚙️' };
    tile.innerHTML = `<div style="font-size:1.5rem">${info.icon}</div><strong>${info.label}</strong><div class="muted">${categories[category].length} options</div>`;
    tile.addEventListener('click', () => {
      showComponentCategory(category);
      $$('#component-map .component-tile').forEach((el) => el.classList.remove('active'));
      tile.classList.add('active');
    });
    map.append(tile);
  });
  const firstCategory = Object.keys(categories)[0];
  if (firstCategory) {
    showComponentCategory(firstCategory);
    map.querySelector('button')?.classList.add('active');
  }
}

function groupComponentsByCategory() {
  return (priceBook.components || []).reduce((acc, comp) => {
    if (!acc[comp.category]) acc[comp.category] = [];
    acc[comp.category].push(comp);
    return acc;
  }, {});
}

function showComponentCategory(category) {
  const detail = $('#component-detail');
  detail.innerHTML = '';
  $('#component-detail-title').textContent = (COMPONENT_CATEGORY_INFO[category]?.label || category);
  const components = groupComponentsByCategory()[category] || [];
  if (!components.length) {
    detail.innerHTML = '<p class="muted">No items defined in price book for this category.</p>';
    return;
  }
  const template = $('#component-template');
  components.forEach((comp) => {
    const frag = template.content.cloneNode(true);
    const root = frag.querySelector('.component-item');
    frag.querySelector('h4').textContent = comp.name;
    frag.querySelector('p').textContent = `${fmtGBP(comp.cost)} · ${comp.hours} hrs`;
    const input = frag.querySelector('input');
    const currentQty = state.components[comp.id] || 0;
    input.value = currentQty;
    input.addEventListener('input', () => {
      const qty = Math.max(0, Math.round(Number(input.value) || 0));
      input.value = qty;
      if (qty > 0) state.components[comp.id] = qty;
      else delete state.components[comp.id];
      updateWorkingMemory();
      updateSummary();
    });
    detail.append(frag);
  });
}

function validateClearances() {
  const report = $('#clearance-report');
  const image = $('#clearance-image');
  const boiler = getBoiler();
  if (!boiler) {
    report.className = 'report error';
    report.textContent = 'Select a boiler before validating clearances.';
    image.textContent = '';
    return;
  }
  const { height, width, depth } = state.measurements;
  if (!height || !width || !depth) {
    report.className = 'report warning';
    report.textContent = 'Enter height, width and depth measurements to validate.';
    image.textContent = renderClearanceText(boiler);
    return;
  }
  const min = boiler.minSpace || {};
  const passHeight = !min.height || height >= min.height;
  const passWidth = !min.width || width >= min.width;
  const passDepth = !min.depth || depth >= min.depth;
  const passes = passHeight && passWidth && passDepth;
  report.className = `report ${passes ? 'success' : 'error'}`;
  report.innerHTML = passes
    ? `Measurements OK. Provided space ${height}×${width}×${depth}mm meets minimum ${min.height || '?'}×${min.width || '?'}×${min.depth || '?'}mm.`
    : `Space shortfall detected. Required minimum ${min.height || '?'}×${min.width || '?'}×${min.depth || '?'}mm.`;
  image.textContent = renderClearanceText(boiler);
  updateWorkingMemory();
  updateSummary();
}

function renderClearanceText(boiler) {
  const c = boiler.requiredClearance || {};
  return `${boiler.name}\nClearances: Top ${c.top || '?'}mm, Bottom ${c.bottom || '?'}mm, Left ${c.left || '?'}mm, Right ${c.right || '?'}mm, Front ${c.front || '?'}mm.`;
}

function updateWorkingMemory() {
  const list = $('#working-memory');
  list.innerHTML = '';
  const items = [];
  const existing = getExistingType();
  if (existing) {
    items.push({ label: 'Existing system', detail: `${existing.name} · ${getPack(state.basePackId)?.name || 'Pack not set'}` });
  }
  const currentLocation = state.location.current || 'Not set';
  const proposedLocation = state.location.proposed || 'Not set';
  items.push({ label: 'Location', detail: `Current: ${currentLocation} → Proposed: ${proposedLocation}` });
  const boiler = getBoiler();
  if (boiler) {
    items.push({ label: 'Boiler', detail: `${boiler.name} (${boiler.output})` });
  }
  const flue = getFlueSelection();
  if (flue) {
    items.push({ label: 'Flue', detail: `${flue.flue.name} – ${flue.variant?.label || 'Standard'}` });
  }
  if (state.gasOptionIds.size) {
    items.push({ label: 'Gas options', detail: [...state.gasOptionIds].map((id) => getGasOption(id)?.name).filter(Boolean).join(', ') });
  }
  if (state.condensateOptionIds.size) {
    items.push({ label: 'Condensate', detail: [...state.condensateOptionIds].map((id) => getCondensateOption(id)?.name).filter(Boolean).join(', ') });
  }
  const components = Object.entries(state.components);
  if (components.length) {
    items.push({ label: 'Components', detail: components.map(([id, qty]) => `${qty}× ${getComponent(id)?.name || id}`).join('; ') });
  }
  if (state.measurements.notes) {
    items.push({ label: 'Measurement note', detail: state.measurements.notes });
  }
  if (state.location.notes) {
    items.push({ label: 'Location note', detail: state.location.notes });
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.label}</span><span class="muted">${item.detail}</span>`;
    list.append(li);
  });
}

function collectQuoteLines() {
  const lines = [];
  const basePack = getPack(state.basePackId);
  if (basePack) {
    const totals = packTotals(basePack);
    lines.push({ id: basePack.id, label: basePack.name, cost: totals.cost, hours: totals.hours });
  }
  const conversionPack = getPack(state.conversionPackId);
  if (conversionPack) {
    const totals = packTotals(conversionPack);
    lines.push({ id: conversionPack.id, label: conversionPack.name, cost: totals.cost, hours: totals.hours });
  }
  const boiler = getBoiler();
  if (boiler) {
    lines.push({ id: boiler.id, label: boiler.name, cost: boiler.cost, hours: boiler.hours });
  }
  const flueSel = getFlueSelection();
  if (flueSel) {
    const baseCost = flueSel.flue.cost + (flueSel.variant?.cost || 0);
    const baseHours = flueSel.flue.hours + (flueSel.variant?.hours || 0);
    lines.push({ id: `${flueSel.flue.id}-${flueSel.variant?.id || 'std'}`, label: `${flueSel.flue.name} – ${flueSel.variant?.label || 'Standard'}`, cost: baseCost, hours: baseHours });
  }
  state.gasOptionIds.forEach((id) => {
    const opt = getGasOption(id);
    if (opt) lines.push({ id: opt.id, label: opt.name, cost: opt.cost, hours: opt.hours });
  });
  state.condensateOptionIds.forEach((id) => {
    const opt = getCondensateOption(id);
    if (opt) lines.push({ id: opt.id, label: opt.name, cost: opt.cost, hours: opt.hours });
  });
  Object.entries(state.components).forEach(([id, qty]) => {
    const comp = getComponent(id);
    if (comp && qty > 0) {
      lines.push({ id: `${comp.id}`, label: `${qty}× ${comp.name}`, cost: comp.cost * qty, hours: comp.hours * qty });
    }
  });
  return lines;
}

function updateSummary() {
  const lines = collectQuoteLines();
  renderQuoteLines(lines);
  renderHoursBreakdown(lines);
  renderCostBreakdown(lines);
  $('#customer-presentation').value = buildCustomerPresentation(lines);
  $('#installation-notes').value = buildInstallationNotes(lines);
  $('#quote-json').value = buildQuoteJSON(lines);
}

function renderQuoteLines(lines) {
  const list = $('#quote-lines');
  list.innerHTML = '';
  lines.forEach((line) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${line.label}</span><span>${fmtGBP(line.cost)} · ${line.hours.toFixed(2)} hrs</span>`;
    list.append(li);
  });
}

function renderHoursBreakdown(lines) {
  const container = $('#hours-breakdown');
  container.innerHTML = '';
  let total = 0;
  lines.forEach((line) => {
    const dt = document.createElement('dt');
    dt.textContent = line.label;
    const dd = document.createElement('dd');
    dd.textContent = `${line.hours.toFixed(2)} hrs`;
    container.append(dt, dd);
    total += line.hours;
  });
  $('#total-hours').textContent = total.toFixed(2);
}

function renderCostBreakdown(lines) {
  const container = $('#cost-breakdown');
  container.innerHTML = '';
  let totalParts = 0;
  lines.forEach((line) => {
    const dt = document.createElement('dt');
    dt.textContent = line.label;
    const dd = document.createElement('dd');
    dd.textContent = fmtGBP(line.cost);
    container.append(dt, dd);
    totalParts += line.cost;
  });
  const labour = (state.labourRate || 0) * Number($('#total-hours').textContent || 0);
  $('#total-parts').textContent = fmtGBP(totalParts);
  $('#total-labour').textContent = fmtGBP(labour);
  $('#grand-total').textContent = fmtGBP(totalParts + labour);
}

function buildCustomerPresentation(lines) {
  const customer = getCustomer();
  const existing = getExistingType();
  const newSys = getNewSystem();
  const boiler = getBoiler();
  const flue = getFlueSelection();
  const locationLine = `Current location: ${state.location.current || 'not set'}, proposed: ${state.location.proposed || 'not set'}.`;
  const packs = lines.filter((l) => l.id.startsWith('pack'))
    .map((l) => `${l.label} (${fmtGBP(l.cost)})`).join('\n');
  const components = Object.entries(state.components).map(([id, qty]) => `${qty}× ${getComponent(id)?.name || id}`).join(', ');
  const observations = state.observationItems.filter((o) => o.done || o.notes).map((o) => `• ${o.label}${o.notes ? ` – ${o.notes}` : ''}`).join('\n');
  return [
    customer ? `${customer.name} – ${customer.address}` : 'Customer TBD',
    existing ? `Existing system: ${existing.name}. Base pack ${getPack(state.basePackId)?.name || 'not set'}.` : 'Existing system not selected.',
    newSys ? `Proposed system: ${newSys.name}. ${locationLine}` : locationLine,
    boiler ? `Selected boiler: ${boiler.name} (${boiler.output}).` : 'Boiler pending selection.',
    flue ? `Flue configuration: ${flue.flue.name} – ${flue.variant?.label || 'Standard'} with zones ${flue.flue.heatZones.join(', ')}.` : 'Flue to be confirmed.',
    packs ? `Packs included:\n${packs}` : 'Packs pending.',
    components ? `Key components: ${components}` : 'Additional components: none noted.',
    observations ? `Observations:\n${observations}` : 'Observations recorded: none yet.'
  ].join('\n\n');
}

function buildInstallationNotes(lines) {
  const measurement = state.measurements;
  const basePack = getPack(state.basePackId);
  const conversionPack = getPack(state.conversionPackId);
  const notes = [];
  if (basePack) notes.push(`Base pack: ${basePack.summary}`);
  if (conversionPack) notes.push(`Conversion pack: ${conversionPack.summary}`);
  if (measurement.height && measurement.width && measurement.depth) {
    notes.push(`Measured space ${measurement.height}×${measurement.width}×${measurement.depth}mm. Notes: ${measurement.notes || 'none'}.`);
  }
  const boiler = getBoiler();
  if (boiler) notes.push(`Install ${boiler.name}. Clearances top ${boiler.requiredClearance?.top}mm / front ${boiler.requiredClearance?.front}mm.`);
  const flue = getFlueSelection();
  if (flue) notes.push(`Flue: ${flue.flue.name} (${flue.flue.type}), variant ${flue.variant?.label || 'standard'}. Zones: ${flue.flue.heatZones.join(', ')}.`);
  if (state.location.current || state.location.proposed) {
    notes.push(`Locations: current ${state.location.current || 'tbc'}, new ${state.location.proposed || 'tbc'}. ${state.location.notes || ''}`);
  }
  if (state.gasOptionIds.size) {
    notes.push(`Gas works: ${[...state.gasOptionIds].map((id) => getGasOption(id)?.name).filter(Boolean).join(', ')}.`);
  }
  if (state.condensateOptionIds.size) {
    notes.push(`Condensate: ${[...state.condensateOptionIds].map((id) => getCondensateOption(id)?.name).filter(Boolean).join(', ')}.`);
  }
  Object.entries(state.components).forEach(([id, qty]) => {
    const comp = getComponent(id);
    if (comp && qty) notes.push(`${qty}× ${comp.name}`);
  });
  const photos = state.photoItems.map((p) => `${p.done ? '✅' : '⬜️'} ${p.label}${p.notes ? ` (${p.notes})` : ''}`).join('\n');
  if (photos) notes.push(`Photos:\n${photos}`);
  const observations = state.observationItems.map((o) => `${o.done ? '⚠️' : '•'} ${o.label}${o.notes ? ` – ${o.notes}` : ''}`).join('\n');
  if (observations) notes.push(`Observations:\n${observations}`);
  return notes.join('\n\n');
}

function buildQuoteJSON(lines) {
  const data = {
    customer: getCustomer() || null,
    existingSystem: {
      type: getExistingType() || null,
      basePack: getPack(state.basePackId) || null
    },
    newSystem: {
      option: getNewSystem() || null,
      conversionPack: getPack(state.conversionPackId) || null
    },
    locations: state.location,
    measurements: state.measurements,
    boiler: getBoiler() || null,
    flue: getFlueSelection() || null,
    gasOptions: [...state.gasOptionIds].map(getGasOption).filter(Boolean),
    condensateOptions: [...state.condensateOptionIds].map(getCondensateOption).filter(Boolean),
    components: Object.entries(state.components).map(([id, qty]) => ({ ...getComponent(id), qty })).filter((c) => c),
    photos: state.photoItems,
    observations: state.observationItems,
    pricing: {
      lines,
      totals: {
        parts: lines.reduce((sum, line) => sum + line.cost, 0),
        hours: lines.reduce((sum, line) => sum + line.hours, 0),
        labourRate: state.labourRate
      }
    },
    generatedAt: new Date().toISOString()
  };
  return JSON.stringify(data, null, 2);
}

function submitQuote() {
  const status = $('#submit-status');
  const required = [state.customerId, state.existingTypeId, state.newSystemId, state.boilerId, state.flueSelection];
  if (required.includes(null)) {
    status.textContent = 'Complete all required selections before submitting.';
    status.style.color = 'var(--danger)';
    return;
  }
  status.textContent = 'Quote captured in working memory. Export JSON for CRM import if required.';
  status.style.color = 'var(--muted)';
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
  return (priceBook.customers || []).find((c) => c.id === state.customerId) || null;
}

function getExistingType() {
  return (priceBook.boilerTypes || []).find((t) => t.id === state.existingTypeId) || null;
}

function getPack(id) {
  return (priceBook.packs || []).find((p) => p.id === id) || null;
}

function getNewSystem() {
  return (priceBook.systemOptions || []).find((s) => s.id === state.newSystemId) || null;
}

function getNewSystemBoilerType() {
  return getNewSystem()?.boilerType || null;
}

function getBoiler() {
  return (priceBook.boilers || []).find((b) => b.id === state.boilerId) || null;
}

function getFlueSelection() {
  if (!state.flueSelection) return null;
  const flue = (priceBook.flues || []).find((f) => f.id === state.flueSelection.flueId);
  if (!flue) return null;
  const variant = (flue.variants || []).find((v) => v.id === state.flueSelection.variantId) || null;
  return { flue, variant };
}

function getGasOption(id) {
  return (priceBook.gasOptions || []).find((g) => g.id === id) || null;
}

function getCondensateOption(id) {
  return (priceBook.condensateOptions || []).find((c) => c.id === id) || null;
}

function getComponent(id) {
  return (priceBook.components || []).find((c) => c.id === id) || null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn('Clipboard write failed', err);
  }
}
