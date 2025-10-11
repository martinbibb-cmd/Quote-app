
// Helpers
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
const fmtGBP = n => `£${(Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:2})}`;
const parseHWD = s => {
  // expects "HxWxD" mm
  const m = String(s||'').match(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/i);
  if(!m) return {H:null,W:null,D:null};
  return {H:Number(m[1]), W:Number(m[2]), D:Number(m[3])};
};
const store = {
  load(){ try{return JSON.parse(localStorage.getItem('quote-mvp')||'{}')}catch(e){return {}} },
  save(x){ localStorage.setItem('quote-mvp', JSON.stringify(x)); }
};

// State
let STATE = store.load();
let RULES = {models:[]};
let OPTIONS = {
  // default quick snippets; user can import/extend via Tools -> Import Options
  boiler:[
    "Replace boiler like-for-like in same location",
    "Raise boiler slightly to gain clearance below",
    "Seal system with expansion vessel (if appropriate)",
    "Magnetic filter on return near boiler",
  ],
  flue:[
    "Existing flue decommissioned and made good",
    "New rear flue with plume kit to clear openings",
    "Horizontal terminal to meet boundary/window clearances",
  ],
  pipe:[
    "Primary pipework to manufacturer minimum sizes",
    "Gas run sized to maintain ≤1 mbar drop",
    "Condensate to external soil, correctly trapped and insulated where external",
  ],
  cylinder:[
    "Remove F&E tank; convert to sealed system",
    "New unvented cylinder sized to demand",
    "Discharge pipework to G3 requirements",
  ],
  controls:[
    "Hive single channel (Boiler Plus compliant)",
    "Hive dual channel for stored hot water",
    "Existing controls retained and recommissioned",
  ],
  additional:[
    "Powerflush recommended due to sludge risk",
    "Fernox TF1 Omega filter supplied and fitted",
  ],
  notesQuick:[
    "No safety observations",
    "All areas accessible from ground – no ladders required",
    "Customer to clear working areas prior to install",
    "Loft works require fixed ladder, lighting, boarded access",
    "One pipe system – performance limitations explained",
    "Sealing old system – leak risk discussed and noted",
    "Combi not instantaneous – draw-off/flow explained",
  ],
  partsDefault:[
    {"name":"Boiler (placeholder model)","cost":1200},
    {"name":"Standard flue kit","cost":140},
    {"name":"Magnetic filter","cost":110},
    {"name":"Condensate materials","cost":35},
    {"name":"Misc fittings","cost":60}
  ],
  skillDefault:[
    {"task":"Boiler swap","hrs":6},
    {"task":"Commission + handover","hrs":1.5}
  ]
};

// Init UI
function initNav(){
  $$('.navbtn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      $$('.panel').forEach(p=>p.classList.remove('active'));
      const target = btn.getAttribute('data-target');
      $(target).classList.add('active');
    });
  });
}

function initQuoteHub(){
  $('#lead').value = STATE.lead || '';
  $('#system_type').value = STATE.system_type || '';
  $('#space_hwD').value = STATE.space || '';
  $('#needs').value = STATE.needs || '';
  $('#customer_summary').value = STATE.customer_summary || '';

  $('#btn-summary').addEventListener('click', ()=>{
    const lead = $('#lead').value.trim();
    const sys = $('#system_type').value;
    const space = $('#space_hwD').value;
    const needs = $('#needs').value;
    const partsCost = calcPartsTotal();
    const hours = sumSkillHours();
    const labourRate = Number($('#labour-rate').value||0);
    const labourCost = hours * labourRate;

    const summary = [
      `Lead ${lead || '—'}: Proposed ${sys || 'system'} replacement.`,
      space?`Available space measured: ${space}.`:"",
      needs?`Customer priorities: ${needs}.`:"",
      `Estimated parts £${partsCost.toFixed(2)}, labour ${hours} hrs @ £${labourRate}/hr ≈ ${fmtGBP(labourCost)} (excl. VAT adjustments, if any).`,
      `Detailed depot notes and spec are included below.`
    ].filter(Boolean).join('\n');

    $('#customer_summary').value = summary;
    persist();
  });

  $('#btn-export').addEventListener('click', exportAll);
  $('#btn-export-2').addEventListener('click', exportAll);
  $('#import-json').addEventListener('change', importAll);
  $('#btn-clear').addEventListener('click', ()=>{
    if(confirm('Reset all fields and clear local data?')){
      localStorage.removeItem('quote-mvp'); location.reload();
    }
  });
  $('#btn-copy-quote').addEventListener('click', ()=>copyText($('#quote_json').value));
}

function initParts(){
  const container = $('#parts-list');
  container.innerHTML = '';
  const parts = STATE.parts || OPTIONS.partsDefault;
  parts.forEach((p, idx)=> addPartItem(p.name, p.cost, idx));
  $('#parts-output').value = (STATE.partsOutput || []).join('\n');

  $('#add-part').addEventListener('click',()=>{
    const name = $('#part-name').value.trim();
    const cost = Number($('#part-cost').value||0);
    if(!name) return;
    addPartItem(name, cost);
    $('#part-name').value=''; $('#part-cost').value='';
    persist();
    recalcPrice();
  });
}

function addPartItem(name, cost, idx=null){
  const container = $('#parts-list');
  const row = document.createElement('div');
  row.className = 'item';
  row.innerHTML = `<div><div class="name">${name}</div><div class="muted">${fmtGBP(cost)}</div></div>
  <div class="row">
    <button class="small add">Add to notes</button>
    <button class="small del">Remove</button>
  </div>`;
  row.querySelector('.add').addEventListener('click', ()=>{
    appendLine('#parts-output', `${name} – ${fmtGBP(cost)}`);
    persist();
  });
  row.querySelector('.del').addEventListener('click', ()=>{
    row.remove();
    // update STATE.parts
    const current = getPartsFromDOM();
    STATE.parts = current;
    persist();
    recalcPrice();
  });
  container.appendChild(row);
  // persist parts
  const current = getPartsFromDOM();
  current.push({name, cost});
  STATE.parts = current;
  persist();
  recalcPrice();
}
function getPartsFromDOM(){
  const items = [];
  $$('#parts-list .item').forEach(it=>{
    const name = it.querySelector('.name').textContent;
    const cost = Number(it.querySelector('.muted').textContent.replace(/[^\d.]/g,''));
    items.push({name, cost});
  });
  return items;
}
function calcPartsTotal(){
  const items = STATE.parts || [];
  return items.reduce((a,b)=>a + (Number(b.cost)||0), 0);
}

// Price
function initPrice(){
  $('#labour-rate').value = STATE.labourRate ?? 65;
  $('#skill-hours').value = STATE.skillHours ?? sumSkillHours();
  $('#misc').value = STATE.misc ?? 0;
  recalcPrice();
  $('#recalc').addEventListener('click', recalcPrice);
}

function recalcPrice(){
  const parts = calcPartsTotal();
  const rate = Number($('#labour-rate').value||0);
  const hrs = Number($('#skill-hours').value||0);
  const misc = Number($('#misc').value||0);
  $('#price-parts').textContent = fmtGBP(parts);
  $('#price-labour').textContent = fmtGBP(rate*hrs);
  $('#price-misc').textContent = fmtGBP(misc);
  $('#price-total').textContent = fmtGBP(parts + rate*hrs + misc);
  $('#price-breakdown').textContent = `(${hrs} hrs @ £${rate}/hr)`;
  STATE.labourRate = rate; STATE.skillHours = hrs; STATE.misc = misc;
  persist();
}

// Skill hours
function initSkill(){
  const list = $('#skill-items'); list.innerHTML='';
  const items = STATE.skill || OPTIONS.skillDefault;
  items.forEach(it=> addSkillItem(it.task, it.hrs));
  $('#add-skill').addEventListener('click',()=>{
    const name = $('#skill-name').value.trim();
    const hrs = Number($('#skill-hrs').value||0);
    if(!name||!hrs) return;
    addSkillItem(name, hrs);
    $('#skill-name').value=''; $('#skill-hrs').value='';
    $('#skill-hours').value = sumSkillHours();
    recalcPrice();
    persist();
  });
  $('#skill-total').textContent = sumSkillHours();
}
function addSkillItem(task, hrs){
  const list = $('#skill-items');
  const row = document.createElement('div');
  row.className = 'item';
  row.innerHTML = `<div><div class="name">${task}</div><div class="muted">${hrs} hrs</div></div>
  <div class="row"><button class="small del">Remove</button></div>`;
  row.querySelector('.del').addEventListener('click', ()=>{
    row.remove();
    $('#skill-total').textContent = sumSkillHours();
    $('#skill-hours').value = sumSkillHours();
    recalcPrice();
    STATE.skill = getSkillFromDOM();
    persist();
  });
  list.appendChild(row);
  // persist
  const cur = getSkillFromDOM();
  cur.push({task, hrs});
  STATE.skill = cur;
  $('#skill-total').textContent = sumSkillHours();
  $('#skill-hours').value = sumSkillHours();
  persist();
}
function getSkillFromDOM(){
  const arr=[];
  $$('#skill-items .item').forEach(it=>{
    const t = it.querySelector('.name').textContent;
    const h = Number(it.querySelector('.muted').textContent)||0;
    const hrs = Number(String(h).replace(/[^\d.]/g,''));
    arr.push({task:t, hrs});
  });
  return arr;
}
function sumSkillHours(){
  const items = STATE.skill || OPTIONS.skillDefault;
  return items.reduce((a,b)=>a + (Number(b.hrs)||0), 0);
}

// Installation Notes
function initNotes(){
  const quick = $('#notes-quick'); quick.innerHTML='';
  (STATE.notesQuick || OPTIONS.notesQuick).forEach(s=>{
    const chip = document.createElement('chip');
    chip.innerHTML = `${s} <button title="add">＋</button>`;
    chip.querySelector('button').addEventListener('click', ()=>{
      appendLine('#notes-output', s);
      persist();
    });
    quick.appendChild(chip);
  });
  $('#notes-free').value = STATE.notesFree || '';
  $('#notes-free').addEventListener('input', ()=>{
    buildNotesOutput();
  });
  $('#include-headers').checked = !!STATE.includeHeaders;
  $('#include-headers').addEventListener('change', buildNotesOutput);
  buildNotesOutput();
}

function buildNotesOutput(){
  let lines = [];
  const header = $('#include-headers').checked ? (h => [`[${h}]`]) : (()=>[]);
  // collect by categories
  const catSections = [
    ['Boiler', $('#boiler-out').value],
    ['Flue', $('#flue-out').value],
    ['Pipework', $('#pipe-out').value],
    ['Cylinder', $('#cyl-out').value],
    ['Controls', $('#ctrl-out').value],
    ['Additional Products', $('#add-out').value]
  ];
  catSections.forEach(([name, val])=>{
    const trimmed = (val||'').trim();
    if(trimmed){
      lines = lines.concat(header(name));
      lines = lines.concat(trimmed.split('\n').filter(Boolean));
    }
  });
  const free = $('#notes-free').value.trim();
  if(free){
    lines = lines.concat(header('Free Notes'));
    lines.push(free);
  }
  $('#notes-output').value = lines.join('\n');
  STATE.includeHeaders = $('#include-headers').checked;
  persist();
}

// Spec (models + clearances)
async function loadRules(){
  try{
    const res = await fetch('data/rules/boiler_clearances.models.json');
    RULES = await res.json();
    $('#rules-view').textContent = JSON.stringify(RULES, null, 2);
    const sel = $('#boiler-model');
    sel.innerHTML = `<option value="">Select…</option>` + RULES.models.map((m,i)=>`
      <option value="${i}">${m.brand} ${m.range} ${m.model} – ${m.type}</option>
    `).join('');
  }catch(e){
    console.error(e);
  }
}

function initSpec(){
  $('#validate-clearances').addEventListener('click', ()=>{
    const idx = Number($('#boiler-model').value);
    const m = RULES.models[idx];
    const H = Number($('#m-height').value||0);
    const W = Number($('#m-width').value||0);
    const D = Number($('#m-depth').value||0);
    if(!m){ $('#clearance-result').textContent='Select a model first.'; return; }
    if(!(H&&W&&D)){ $('#clearance-result').textContent='Enter measured H/W/D (mm).'; return; }
    const pass = (H >= m.clearances.min_install_height) &&
                 (D >= m.clearances.min_install_depth) &&
                 (W >= (m.case.width + m.clearances.left + m.clearances.right));
    const msg = pass ? `PASS: Space meets minimum install H/W/D. Case ${m.case.height}x${m.case.width}x${m.case.depth}mm; required H≥${m.clearances.min_install_height}, W≥case+${m.clearances.left}+${m.clearances.right}, D≥${m.clearances.min_install_depth}.`
                     : `FAIL: Check clearances. Case ${m.case.height}x${m.case.width}x${m.case.depth}mm; required H≥${m.clearances.min_install_height}, W≥case+${m.clearances.left}+${m.clearances.right}, D≥${m.clearances.min_install_depth}.`;
    $('#clearance-result').innerHTML = pass? `<span class="ok">${msg}</span>` : `<span class="bad">${msg}</span>`;

    // Spec output
    const out = [
      `Model: ${m.brand} ${m.range} ${m.model} (${m.type})`,
      `Case: H${m.case.height} W${m.case.width} D${m.case.depth} mm`,
      `Clearances (mm): above ${m.clearances.above}, below ${m.clearances.below}, left ${m.clearances.left}, right ${m.clearances.right}, front-fixed ${m.clearances.front_fixed}, front-removable ${m.clearances.front_removable}`,
      `Measured space: H${H} W${W} D${D} mm – ${pass?'PASS':'FAIL'}`,
      m.notes ? `Notes: ${m.notes}` : ''
    ].filter(Boolean).join('\n');
    $('#spec-output').value = out;
    persist();
  });
}

// Categories -> chips from OPTIONS or imported options
function initCategories(){
  const map = [
    ['boiler-snips','boiler','#boiler-out'],
    ['flue-snips','flue','#flue-out'],
    ['pipe-snips','pipe','#pipe-out'],
    ['cyl-snips','cylinder','#cyl-out'],
    ['ctrl-snips','controls','#ctrl-out'],
    ['add-snips','additional','#add-out']
  ];
  map.forEach(([containerKey, optKey, outSel])=>{
    const container = document.getElementById(containerKey);
    container.innerHTML='';
    const list = (STATE.options?.[optKey]) || OPTIONS[optKey];
    list.forEach(line=>{
      const chip = document.createElement('chip');
      chip.innerHTML = `${line} <button title="add">＋</button>`;
      chip.querySelector('button').addEventListener('click',()=>{
        appendLine(outSel, line);
        buildNotesOutput();
        persist();
      });
      container.appendChild(chip);
    });
    // restore outputs
    const out = STATE.outputs?.[outSel] || '';
    document.querySelector(outSel).value = out;
  });

  $$('.copybox').forEach(el=> el.addEventListener('input', ()=>{
    // save outputs generically
    STATE.outputs = STATE.outputs || {};
    STATE.outputs['#'+el.id] = el.value;
    persist();
    if(el.id.endsWith('-out')) buildNotesOutput();
  }));
}

// Format toggles and copy
function initCopyFormat(){
  $$('.fmt').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const sel = cb.getAttribute('data-for');
      const mode = cb.getAttribute('data-mode');
      applyFormat(sel, mode, cb.checked);
    });
  });
  $$('[data-copy]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const sel = btn.getAttribute('data-copy');
      copyText($(sel).value);
    });
  });
}
function applyFormat(sel, mode, on){
  const ta = $(sel);
  let lines = ta.value.split('\n');
  if(mode==='arrows'){
    lines = lines.map(s=>{
      const stripped = s.replace(/^↘️\s*/,'').trimEnd();
      return on ? `↘️ ${stripped}` : stripped;
    });
  } else if(mode==='semicolons'){
    lines = lines.map(s=>{
      const stripped = s.replace(/;$/,'').trimEnd();
      return on ? `${stripped};` : stripped;
    });
  }
  ta.value = lines.join('\n');
}
function appendLine(sel, line){
  const ta = $(sel);
  ta.value = (ta.value ? ta.value + '\n' : '') + line;
}
async function copyText(s){
  try{
    await navigator.clipboard.writeText(s||'');
  }catch(e){
    // fallback
    const t = document.createElement('textarea');
    t.value = s||''; document.body.appendChild(t);
    t.select(); document.execCommand('copy'); t.remove();
  }
}

// Options import/export
function exportAll(){
  const out = {
    lead: $('#lead').value,
    system_type: $('#system_type').value,
    space: $('#space_hwD').value,
    needs: $('#needs').value,
    customer_summary: $('#customer_summary').value,
    parts: getPartsFromDOM(),
    skill: getSkillFromDOM(),
    labourRate: Number($('#labour-rate').value||0),
    skillHours: Number($('#skill-hours').value||0),
    misc: Number($('#misc').value||0),
    outputs: STATE.outputs || {},
    includeHeaders: $('#include-headers').checked
  };
  $('#quote_json').value = JSON.stringify(out, null, 2);
  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `quote-${out.lead||'draft'}.json`;
  a.click();
}
function importAll(e){
  const f = e.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      STATE = {...STATE, ...data};
      store.save(STATE); location.reload();
    }catch(err){ alert('Invalid JSON'); }
  };
  reader.readAsText(f);
}

$('#import-options')?.addEventListener?.('change', e=>{
  const f = e.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      STATE.options = data;
      store.save(STATE);
      initCategories();
      alert('Options imported.');
    }catch(err){ alert('Invalid options JSON'); }
  };
  reader.readAsText(f);
});

function persist(){
  // harvest major fields
  STATE.lead = $('#lead').value;
  STATE.system_type = $('#system_type').value;
  STATE.space = $('#space_hwD').value;
  STATE.needs = $('#needs').value;
  STATE.customer_summary = $('#customer_summary').value;
  STATE.partsOutput = $('#parts-output').value.split('\n').filter(Boolean);
  STATE.notesFree = $('#notes-free').value;
  store.save(STATE);
}

// Boot
window.addEventListener('DOMContentLoaded', async ()=>{
  initNav();
  initQuoteHub();
  initParts();
  initPrice();
  initSkill();
  initCopyFormat();
  initCategories();
  initNotes();
  await loadRules();
  initSpec();
});
