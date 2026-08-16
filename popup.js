
const $ = (id) => document.getElementById(id);
const STORE_KEY = 'apigarden_extension_store_v1';
const DEFAULT_BACKEND_URL = 'https://api-garden.onrender.com';
const ISHITA = 'ishita.chowdhury@northsouth.edu';
const VOICE_RESULT_KEY = 'apigarden_voice_run_v1';

const defaultApis = [
  {name:'Currency Converter', description:'Convert currencies and explain the result clearly.', runs:0},
  {name:'Weather Lookup', description:'Summarize weather information if the user provides weather data or city context.', runs:0},
  {name:'Motivational Quote', description:'Generate one short motivational quote for the requested topic.', runs:0},
  {name:'Grammar Correction', description:'Correct grammar, spelling, punctuation, and return a clean final version only.', runs:0},
  {name:'PDF Question Answer', description:'Answer questions from supplied document text clearly and briefly.', runs:0}
];

let state = {
  screen:'landing',
  role:null,
  email:'',
  tab:'info',
  store:null,
  recording:null,
  voice:{listening:false,manualStop:false,transcript:'',draft:null,lastError:''}
};

function clean(text){
  return String(text || '')
    .replace(/\*\*/g,'')
    .replace(/__([^_]+)__/g,'$1')
    .replace(/\*([^*\n]+)\*/g,'$1')
    .trim();
}
function esc(s){
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function safeFileName(value){
  return String(value || 'api-result').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'api-result';
}
function downloadJsonFile(data, filename){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function downloadApiJson(index){
  const api = currentUser().apis?.[index];
  if(!api) return;
  const data = api.lastOutcome || {
    apiName: api.name,
    description: api.description,
    type: api.type || 'custom',
    finalUrl: api.finalUrl || '',
    recording: api.recording || null,
    status: 'created',
    generatedAt: new Date().toISOString()
  };
  downloadJsonFile(data, `${safeFileName(api.name)}-outcome.json`);
}

function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}
function storageGet(){
  return new Promise(resolve=>{
    chrome.storage.local.get([STORE_KEY], res=>{
      resolve(res[STORE_KEY] || {
        backendUrl: DEFAULT_BACKEND_URL,
        session:null,
        users:{},
        voiceDrafts:{},
        admin:{pending:[], approved:[]}
      });
    });
  });
}
function storageSet(store){
  return new Promise(resolve=>{
    chrome.storage.local.set({[STORE_KEY]: store}, resolve);
  });
}

function backendBase(){
  return String(state.store?.backendUrl || '').trim().replace(/\/$/, '');
}

async function pullMessagesFromBackend(role, email){
  const base = backendBase();
  if(!base) return false;
  try{
    const res = await fetch(`${base}/api/demo-state/messages?role=${encodeURIComponent(role)}&email=${encodeURIComponent(email)}`);
    if(!res.ok) return false;
    const data = await res.json();
    if(Array.isArray(data.messages)){
      const k = key(role, email);
      const u = state.store.users[k] || freshUser(role, email);
      const existing = Array.isArray(u.messages) ? u.messages : [];
      const merged = [...data.messages, ...existing];
      const seen = new Set();
      u.messages = merged.filter(m=>{
        const id = `${m.from || ''}|${m.body || ''}|${m.password || ''}`;
        if(seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      state.store.users[k] = u;
      if(state.role === role && state.email === email){
        state.store.users[k] = u;
      }
      await save();
      return true;
    }
    return false;
  }catch(e){ return false; }
}
async function pushUserMessageToBackend(role, email, message){
  const base = backendBase();
  if(!base) return false;
  try{
    await fetch(`${base}/api/demo-state/messages`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({role, email, message})
    });
    return true;
  }catch(e){ return false; }
}

async function pushPendingToBackend(txn){
  const base = backendBase();
  if(!base) return false;
  try{
    await fetch(`${base}/api/demo-state/pending`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(txn)
    });
    return true;
  }catch(e){ return false; }
}
async function pullAdminFromBackend(){
  const base = backendBase();
  if(!base) return false;
  try{
    const res = await fetch(`${base}/api/demo-state`);
    if(!res.ok) return false;
    const data = await res.json();
    if(Array.isArray(data.pending)) state.store.admin.pending = data.pending;
    if(Array.isArray(data.approved)) state.store.admin.approved = data.approved;
    await save();
    return true;
  }catch(e){ return false; }
}
async function syncAdminToBackend(){
  const base = backendBase();
  if(!base) return false;
  try{
    await fetch(`${base}/api/demo-state/sync-admin`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(state.store.admin)
    });
    return true;
  }catch(e){ return false; }
}

function key(role,email){ return `${role}:${String(email || '').toLowerCase()}`; }
function freshUser(role,email){
  const seeded = role === 'free' && String(email).toLowerCase() === ISHITA;
  return {
    role,email,
    credits:{used:0,max:6},
    savedInfo:{name:'', email, phone:'', gender:'', country:'', city:'', location:'', dob:'', address:'', customFields:[], disabledFields:[]},
    messages:[],
    apis: seeded ? JSON.parse(JSON.stringify(defaultApis)) : [],
    password:''
  };
}
async function refreshVoiceBackgroundResult(){
  try{
    const data=await chrome.storage.local.get([VOICE_RESULT_KEY]);
    const run=data[VOICE_RESULT_KEY];
    if(!run?.finishedAt) return;
    state.store.voiceDrafts=state.store.voiceDrafts || {};
    if(run.kind==='draft'){
      const draft=state.store.voiceDrafts[key(state.role,state.email)];
      if(draft && draft.id===run.id){
        draft.lastOutcome=run.lastOutcome;
        draft.finalUrl=run.lastOutcome?.sourceUrl || draft.targetUrl;
        state.store.voiceDrafts[key(state.role,state.email)]=draft;
        state.voice.draft=draft;
      }
    }else if(run.kind==='saved'){
      const u=currentUser();
      const api=(u?.apis||[]).find(a=>a.id===run.id);
      if(api){
        api.lastOutcome=run.lastOutcome;
        api.finalUrl=run.lastOutcome?.sourceUrl || api.finalUrl;
        api.runs=(api.runs||0)+1;
      }
    }
    await save();
    await chrome.storage.local.remove([VOICE_RESULT_KEY]);
  }catch(e){}
}
async function load(){
  state.store = await storageGet();
  state.store.voiceDrafts = state.store.voiceDrafts || {};
  if(!state.store.backendUrl) state.store.backendUrl = DEFAULT_BACKEND_URL;
  if(state.store.session && state.store.session.role && state.store.session.email){
    state.role = state.store.session.role;
    state.email = state.store.session.email;
    state.tab = state.store.session.tab || (state.role === 'admin' ? 'admin' : 'info');
    state.screen = 'app';
    if(state.role === 'admin') await pullAdminFromBackend();
    else await syncExtensionProfileFromCloud();
  }
  await refreshRecordingStatus(false);
  if(state.role && state.email && state.role!=='admin') state.voice.draft = state.store.voiceDrafts?.[key(state.role,state.email)] || null;
  if(state.role && state.email && state.role!=='admin') await refreshVoiceBackgroundResult();
  render();
}
async function save(){
  await storageSet(state.store);
}
async function saveSession(){
  if(!state.store) return;
  state.store.session = state.role && state.email ? {role:state.role, email:state.email, tab:state.tab, screen:state.screen} : null;
  await save();
}
function currentUser(){
  if(!state.role || !state.email) return null;
  const k = key(state.role,state.email);
  if(!state.store.users[k]) state.store.users[k] = freshUser(state.role,state.email);
  return state.store.users[k];
}
function setScreen(screen){
  state.screen = screen;
  render();
}
function login(role){
  const emailEl = $(`${role}-email`);
  const passEl = $(`${role}-pass`);
  const email = (emailEl?.value || `${role}@example.com`).trim().toLowerCase();
  if(role === 'admin'){
    const pass = passEl?.value || '';
    if(email !== 'admin@northsouth.edu' || pass !== '123'){
      toast('Wrong admin login');
      return;
    }
  }
  state.role = role;
  state.email = email;
  state.tab = role === 'admin' ? 'admin' : 'info';
  const u = currentUser();
  u.email = email;
  if(role === 'pro' && passEl) u.password = passEl.value;
  state.store.session = {role, email, tab:state.tab, screen:'app'};
  save().then(async()=>{ if(role !== 'admin') await syncExtensionProfileFromCloud(); setScreen('app'); });
}
async function logout(){
  state.screen='landing'; state.role=null; state.email=''; state.tab='info';
  if(state.store){ state.store.session = null; await save(); }
  render();
}

function shell(inner){
  $('app').innerHTML = `<div class="logo"><span class="logo-dot"></span>APIGarden</div>${inner}`;
}
function landing(){
  shell(`
    <div class="card">
      <h1>APIGarden Extension</h1>
      <p>Autofill forms, analyze the current page, and manage your API demo from a compact popup.</p>
    </div>
    <div class="role-grid">
      <button class="role-card" data-action="gotoLogin" data-role="free"><div><b>🌱 Free User</b><span>Autofill, analyzer, messages</span></div><b>→</b></button>
      <button class="role-card" data-action="gotoLogin" data-role="pro"><div><b>🌿 Pro Planner</b><span>Seller tools and unlimited demo</span></div><b>→</b></button>
      <button class="role-card" data-action="gotoLogin" data-role="admin"><div><b>🌳 Admin</b><span>Approve or reject requests</span></div><b>→</b></button>
    </div>
  `);
}
function loginScreen(role){
  const title = role === 'free' ? 'Continue as Free User' : role === 'pro' ? 'Pro Planner sign in' : 'Admin sign in';
  const hint = role === 'free' ? `Use ${ISHITA} to see 5 preloaded APIs.` : role === 'admin' ? 'Demo: admin@northsouth.edu / 123' : 'Use the password sent by admin, or any password for demo.';
  shell(`
    <div class="card">
      <button class="btn soft" data-action="landing">← Back</button>
      <h2 style="margin-top:12px">${title}</h2>
      <p>${hint}</p>
      <label>Email</label>
      <input id="${role}-email" type="email" placeholder="${role === 'admin' ? 'admin@northsouth.edu' : 'you@example.com'}">
      ${role !== 'free' ? `<label>Password</label><input id="${role}-pass" type="password" placeholder="${role === 'admin' ? '123' : 'Password'}">` : ''}
      <div class="actions"><button class="btn primary" data-action="login" data-role="${role}">Continue</button></div>
    </div>
  `);
}
function appShell(content){
  const u = currentUser();
  shell(`
    <div class="topbar">
      <button class="btn soft" data-action="logout">←</button>
      <div><b>${state.role === 'admin' ? 'Admin' : state.role === 'pro' ? 'Pro Planner' : 'Free User'}</b><div class="email">${esc(state.email)}</div></div>
      <div class="spacer"></div>
      ${state.role !== 'admin' ? `<span class="badge">${u.credits.max-u.credits.used}/${u.credits.max} runs</span>` : ''}
    </div>
    ${content}
  `);
}
function tabs(){
  if(state.role === 'admin') return '';
  const items = [
    ['info','Info / Autofill'],
    ['analyzer','Analyzer'],
    ['messages','Messages'],
    ['recording','Recorder'],
    ['voice','Voice API'],
    ['apis','My APIs']
  ];
  if(state.role === 'free') items.push(['upgrade','Upgrade']);
  return `<div class="tabs">${items.map(([id,label])=>`<button class="btn ${state.tab===id?'primary':'soft'}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
}
function renderApp(){
  if(state.role === 'admin') return renderAdmin();
  const content = tabs() + (
    state.tab === 'info' ? infoView() :
    state.tab === 'analyzer' ? analyzerView() :
    state.tab === 'messages' ? messagesView() :
    state.tab === 'recording' ? recordingView() :
    state.tab === 'voice' ? voiceView() :
    state.tab === 'apis' ? apisView() :
    upgradeView()
  );
  appShell(content);
  if(state.tab === 'analyzer') loadCurrentUrl();

}
function fieldRow(id, label, value, removable=true){
  return `<div class="profile-field" data-field-id="${esc(id)}">
    <div class="field-head"><label>${esc(label)}</label>${removable ? `<button type="button" class="field-remove" data-action="removeProfileField" data-field="${esc(id)}" title="Remove field">Remove</button>` : ''}</div>
    <input id="info-${esc(id)}" value="${esc(value || '')}">
  </div>`;
}
function infoView(){
  const u = currentUser();
  const i = u.savedInfo || {};
  const disabled = new Set(i.disabledFields || []);
  const standard = [
    ['name','Name'],['email','Email'],['phone','Phone'],['gender','Gender'],
    ['country','Country'],['city','City'],['location','Location / Address'],['dob','Date of birth']
  ];
  const standardHtml = standard.filter(([id])=>!disabled.has(id)).map(([id,label])=>fieldRow(id,label,i[id] || (id==='email' ? u.email : ''))).join('');
  const customHtml = (i.customFields || []).map((field,idx)=>`<div class="profile-field custom-profile-field" data-custom-index="${idx}">
    <div class="field-head"><input class="custom-label" data-custom-label="${idx}" value="${esc(field.label || '')}" placeholder="Field name, e.g. Passport number"><button type="button" class="field-remove" data-action="removeCustomField" data-index="${idx}">Remove</button></div>
    <input class="custom-value" data-custom-value="${idx}" value="${esc(field.value || '')}" placeholder="Enter information">
  </div>`).join('');
  return `<div class="card">
    <h2>Saved Info</h2>
    <p>Information is linked to your login email and synchronised with the website.</p>
    <label>Backend URL / Render link</label>
    <input id="backendUrl" value="${esc(state.store.backendUrl || '')}" placeholder="https://api-garden.onrender.com">
    <div class="grid2">${standardHtml}</div>
    <div id="custom-fields">${customHtml}</div>
    <div class="actions"><button class="btn soft" data-action="addCustomField">Add information</button>${disabled.size ? `<button class="btn soft" data-action="restoreProfileFields">Restore removed fields</button>` : ''}</div>
    <div class="actions">
      <button class="btn soft" data-action="saveInfo">Save info</button>
      <button class="btn primary" data-action="fillForm">Fill current page form</button>
    </div>
    <p class="small">You can add custom information or remove fields you do not need. Matching custom labels are also used during autofill.</p>
  </div>`;
}
async function syncExtensionProfileToCloud(){
  try{
    const u=currentUser();
    const email=u?.email || state.email;
    if(!email) return;
    const base=backendBase();
    if(!base) return;
    await fetch(`${base}/api/profile/${encodeURIComponent(email)}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({savedInfo:u.savedInfo, updatedAt:new Date().toISOString()})
    });
  }catch(e){}
}
async function syncExtensionProfileFromCloud(){
  try{
    const u=currentUser();
    const email=u?.email || state.email;
    const base=backendBase();
    if(!email || !base) return;
    const r=await fetch(`${base}/api/profile/${encodeURIComponent(email)}`);
    const d=await r.json();
    if(d && d.savedInfo){
      u.savedInfo={...(u.savedInfo||{}),...d.savedInfo};
      state.store.users[key(state.role,state.email)]=u;
      await save();
    }
  }catch(e){}
}

function collectExtensionSavedInfo(){
  const u = currentUser();
  const previous = u.savedInfo || {};
  const disabledFields = Array.isArray(previous.disabledFields) ? [...previous.disabledFields] : [];
  const read = id => $(`info-${id}`)?.value.trim() || '';
  const customFields = Array.from(document.querySelectorAll('.custom-profile-field')).map(row=>({
    label: row.querySelector('.custom-label')?.value.trim() || '',
    value: row.querySelector('.custom-value')?.value.trim() || ''
  })).filter(field=>field.label || field.value);
  return {
    name:read('name'), email:read('email') || state.email, phone:read('phone'), gender:read('gender'),
    country:read('country'), city:read('city'), location:read('location'), address:read('location'), dob:read('dob'),
    customFields, disabledFields
  };
}
function saveInfo(){
  const u = currentUser();
  state.store.backendUrl = $('backendUrl')?.value.trim() || state.store.backendUrl || '';
  u.savedInfo = collectExtensionSavedInfo();
  state.store.users[key(state.role,state.email)] = u;
  save().then(()=>{ syncExtensionProfileToCloud(); toast('Saved and synchronised'); });
}
function addCustomField(){
  const u=currentUser();
  u.savedInfo={...(u.savedInfo||{}), customFields:[...(u.savedInfo?.customFields||[]),{label:'',value:''}]};
  state.store.users[key(state.role,state.email)]=u; render();
}
function removeCustomField(index){
  const u=currentUser();
  const fields=[...(u.savedInfo?.customFields||[])]; fields.splice(index,1);
  u.savedInfo={...(u.savedInfo||{}),customFields:fields}; state.store.users[key(state.role,state.email)]=u; save(); render();
}
function removeProfileField(field){
  const u=currentUser();
  const info=collectExtensionSavedInfo();
  info.disabledFields=Array.from(new Set([...(info.disabledFields||[]),field]));
  u.savedInfo=info; state.store.users[key(state.role,state.email)]=u; save(); render();
}
function restoreProfileFields(){
  const u=currentUser(); u.savedInfo={...(u.savedInfo||{}),disabledFields:[]}; state.store.users[key(state.role,state.email)]=u; save(); render();
}
function analyzerView(){
  return `<div class="card">
    <h2>Current Page Analyzer</h2>
    <p>Ask about the page that was open when you clicked the extension.</p>
    <label>Current page URL</label>
    <input id="currentUrl" readonly placeholder="Detecting current tab...">
    <label>Backend URL / Render link</label>
    <input id="an-backend" value="${esc(state.store.backendUrl || '')}" placeholder="https://api-garden.onrender.com">
    <label>Your question</label>
    <textarea id="an-question" rows="4" placeholder="Example: Which hotel option is better for me?"></textarea>
    <div class="actions">
      <button class="btn primary" data-action="analyze">Analyze this page</button>
      <button class="btn soft" data-action="reloadUrl">Reload URL</button>
    </div>
    <div id="an-result"></div>
  </div>`;
}
function messagesView(){
  const u = currentUser();
  return `<div class="card">
    <div class="actions" style="margin-top:0"><button class="btn soft" data-action="reloadMessages">↻ Reload admin messages</button></div>
    <h2>Admin Messages</h2>
    ${(u.messages || []).length ? u.messages.map(m=>`<div class="card msg"><div class="from">From ${esc(m.from || 'Admin')}</div><div>${esc(clean(m.body))}</div>${m.password?`<span class="pw">${esc(m.password)}</span>`:''}</div>`).join('') : `<p>No messages yet.</p>`}
  </div>`;
}


let voiceRecognition = null;
let voiceFinalTranscript = '';

const VOICE_SITES = {
  bata: {label:'Bata Bangladesh', base:'https://www.batabd.com', search:'https://www.batabd.com/search?q={query}&type=product'},
  walton: {label:'Walton', base:'https://waltonbd.com', search:'https://waltonbd.com/index.php?route=product/search&search={query}&description=true'},
  daraz: {label:'Daraz Bangladesh', base:'https://www.daraz.com.bd', search:'https://www.daraz.com.bd/catalog/?q={query}'},
  pickaboo: {label:'Pickaboo', base:'https://www.pickaboo.com', search:'https://www.pickaboo.com/search?q={query}'},
  rokomari: {label:'Rokomari', base:'https://www.rokomari.com', search:'https://www.rokomari.com/search?term={query}'},
  trip: {label:'Trip.com', base:'https://www.trip.com/flights/', search:'https://www.trip.com/flights/'},
  biman: {label:'Biman Bangladesh Airlines', base:'https://www.biman-airlines.com/', search:'https://www.biman-airlines.com/'},
  usbangla: {label:'US-Bangla Airlines', base:'https://usbair.com/', search:'https://usbair.com/'},
  novoair: {label:'NOVOAIR', base:'https://www.flynovoair.com/', search:'https://www.flynovoair.com/'}
};
function chooseBestVoiceSite(text){
  const t=String(text||'').toLowerCase();
  const rules=[
    {rx:/\b(shoe|shoes|sneaker|sneakers|sandal|sandals|loafer|loafers|boot|boots|footwear)\b/, key:'bata'},
    {rx:/\b(book|books|novel|textbook|stationery|author)\b/, key:'rokomari'},
    {rx:/\b(phone|mobile|smartphone|laptop|tablet|headphone|earphone|camera|smartwatch|gadget)\b/, key:'pickaboo'},
    {rx:/\b(fridge|refrigerator|freezer|television|tv|ac|air conditioner|washing machine|water heater|home appliance)\b/, key:'walton'},
    {rx:/\b(flight|flights|airfare|airline|airport|travel)\b/, key:'trip'}
  ];
  const found=rules.find(r=>r.rx.test(t));
  return {...VOICE_SITES[found?.key || 'daraz'], key:found?.key || 'daraz', autoSelected:true};
}

function voiceView(){
  const v = state.voice || {listening:false,transcript:'',draft:null,lastError:''};
  const d = v.draft;
  return `<div class="card voice-card">
    <div class="voice-head"><div><h2>Create API by Voice</h2><p>Speak naturally. Your words appear below while you talk, and recording continues until you press Stop Recording.</p></div><span class="voice-status ${v.listening?'live':''}">${v.listening?'Listening':'Ready'}</span></div>
    <button class="voice-mic ${v.listening?'active':''}" data-action="${v.listening?'stopVoice':'startVoice'}" aria-label="${v.listening?'Stop recording':'Start voice recording'}"><span class="voice-mic-icon">🎙</span></button>
    <div class="voice-wave ${v.listening?'active':''}"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="actions voice-actions">
      ${v.listening?`<button class="btn danger" data-action="stopVoice">■ Stop Recording</button>`:`<button class="btn primary" data-action="startVoice">🎙 Start Recording</button>`}
      ${v.transcript?`<button class="btn soft" data-action="clearVoice">Clear</button>`:''}
    </div>
    <label>Live transcript — you can edit it before creating the API</label>
    <textarea id="voice-transcript" rows="5" placeholder="Example: Go to Bata website and create an API for shoes from 0 to 3000 taka.">${esc(v.transcript || '')}</textarea>
    ${v.lastError?`<div class="voice-error">${esc(v.lastError)}</div>`:''}
    <div class="actions"><button class="btn primary" data-action="analyzeVoice" ${v.listening?'disabled':''}>Analyze & Create API</button></div>
  </div>
  ${d ? voiceDraftView(d) : ''}`;
}

function voiceDraftView(d){
  const ran = !!d.lastOutcome;
  return `<div class="card voice-draft">
    <div class="voice-draft-top"><div><span class="badge">VOICE DRAFT</span><h2>${esc(d.name)}</h2></div><span class="status-chip">${ran?'Tested':'Ready to test'}</span></div>
    <p>${esc(d.description)}</p>
    <div class="intent-grid">
      <div><span>Website</span><b>${esc(d.siteLabel || d.domain || 'Detected website')}</b></div>
      <div><span>${d.agentType==='travel'?'Route':'Search'}</span><b>${esc(d.query || (d.agentType==='travel'?'Flight search':'All products'))}</b></div>
      <div><span>${d.agentType==='travel'?'Mode':'Price range'}</span><b>${d.agentType==='travel'?'Autonomous page analysis':(d.minPrice!=null || d.maxPrice!=null ? `৳ ${Number(d.minPrice||0).toLocaleString()} – ${d.maxPrice!=null?`৳ ${Number(d.maxPrice).toLocaleString()}`:'No max'}` : 'Not specified')}</b></div>
    </div>
    <div class="record-url">${esc(d.targetUrl)}</div>
    <div class="actions">
      <button class="btn primary" data-action="runVoiceDraft">▶ Run API</button>
      ${ran?`<button class="btn soft" data-action="saveVoiceDraft">Save API</button><button class="btn soft" data-action="downloadVoiceDraft">Download JSON</button>`:''}
    </div>
    ${ran?`<div class="voice-run-summary"><b>${Number(d.lastOutcome.resultCount||0)}</b> live result${Number(d.lastOutcome.resultCount||0)===1?'':'s'} captured from the opened page.</div>`:`<p class="small">Run it first. APIGarden will open the detected website and ${d.agentType==='travel'?'analyze the page, fill the route, search, verify the result page, and capture visible live results':'search the product, apply the spoken price range on the page, and capture the visible product data'}. Save only after you confirm it works.</p>`}
  </div>`;
}

function normalizeVoiceText(value){
  return String(value || '').replace(/\s+/g,' ').trim();
}
function priceNumber(value){
  const n = Number(String(value||'').replace(/,/g,''));
  return Number.isFinite(n) ? n : null;
}
function detectVoicePrices(text){
  const t = text.toLowerCase().replace(/,/g,'');
  let minPrice=null, maxPrice=null;
  let m=t.match(/(?:range|price(?:\s+range)?|from)?\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|to|and)\s*(\d+(?:\.\d+)?)\s*(?:tk|taka|bdt)?\b/i);
  if(m){ minPrice=priceNumber(m[1]); maxPrice=priceNumber(m[2]); }
  if(maxPrice==null){
    m=t.match(/(?:under|below|less than|up to|maximum|max)\s*(?:tk|taka|bdt)?\s*(\d+(?:\.\d+)?)/i) || t.match(/(?:tk|taka|bdt)\s*(\d+(?:\.\d+)?)\s*(?:or less|maximum|max)/i);
    if(m){ minPrice=0; maxPrice=priceNumber(m[1]); }
  }
  if(minPrice==null){
    m=t.match(/(?:above|over|more than|minimum|min)\s*(?:tk|taka|bdt)?\s*(\d+(?:\.\d+)?)/i);
    if(m) minPrice=priceNumber(m[1]);
  }
  return {minPrice,maxPrice};
}
function detectVoiceSite(text){
  const lower=text.toLowerCase();
  const aliases=[
    {rx:/\b(?:biman|biman bangladesh(?: airlines)?)\b/i,key:'biman'},
    {rx:/\b(?:us[ -]?bangla|usbair)\b/i,key:'usbangla'},
    {rx:/\b(?:novoair|novo air|flynovoair)\b/i,key:'novoair'},
    {rx:/\b(?:trip\.com|trip com)\b/i,key:'trip'}
  ];
  const ali=aliases.find(a=>a.rx.test(lower));
  if(ali) return {...VOICE_SITES[ali.key],key:ali.key,domain:new URL(VOICE_SITES[ali.key].base).hostname};
  for(const [key,site] of Object.entries(VOICE_SITES)){
    if(new RegExp(`\\b${key}\\b`,'i').test(lower)) return {...site,key,domain:new URL(site.base).hostname};
  }
  const urlMatch=text.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/[^\s]*)?/i);
  if(urlMatch){
    const domain=urlMatch[1].toLowerCase();
    const base=`https://${domain}`;
    return {key:domain.split('.')[0],label:domain,base,domain,search:`${base}/search?q={query}`};
  }
  const named=text.match(/(?:go to|open|from|on|visit)\s+(?:the\s+)?([a-z0-9&' -]{2,40}?)\s+(?:website|site)\b/i) || text.match(/\b([a-z0-9&'-]{2,30})\s+(?:website|site)\b/i);
  if(named){
    const key=named[1].toLowerCase().replace(/\b(the|official)\b/g,'').trim().replace(/[^a-z0-9]/g,'');
    if(key){
      const base=`https://www.${key}.com`;
      return {key,label:named[1].trim(),base,domain:`www.${key}.com`,search:`${base}/search?q={query}`};
    }
  }
  return null;
}
function detectVoiceQuery(text, site, prices){
  let q=text;
  q=q.replace(/https?:\/\/\S+/ig,' ');
  q=q.replace(/\b(?:go to|open|visit|search|find|show me|create|make|build|generate|an|a|the|api|website|site|please|for me)\b/ig,' ');
  if(site){
    q=q.replace(new RegExp(site.key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),' ');
    q=q.replace(new RegExp(String(site.label||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),' ');
  }
  q=q.replace(/\b(?:price|range|priced|cost|between|from|under|below|above|over|less than|more than|up to|maximum|max|minimum|min)\b/ig,' ');
  q=q.replace(/\b\d[\d,]*(?:\.\d+)?\s*(?:tk|taka|bdt)?\b/ig,' ');
  q=q.replace(/[–—-]+/g,' ');
  q=normalizeVoiceText(q).replace(/^and\s+/i,'').replace(/\s+and$/i,'');
  const forMatch=text.match(/(?:api\s+)?for\s+(.+?)(?=\s+(?:range|price|from|under|below|above|over|between|up to)\b|\s+\d[\d,]*\s*(?:-|to)\s*\d|$)/i);
  if(forMatch){
    let f=forMatch[1].replace(/\b(?:shoe price|price)\b/ig,'shoe').trim();
    f=f.replace(/\b(?:on|from)\s+\w+\s+(?:website|site)\b/ig,'').trim();
    if(f && f.length<80) q=f;
  }
  return q || 'products';
}
function detectTravelIntent(text){
  const t=String(text||'').replace(/\s+/g,' ').trim();
  if(!/\b(flight|flights|airfare|airline|airport|trip\.com|biman|us[ -]?bangla|novoair)\b/i.test(t)) return null;
  let origin='', destination='', departDate='';
  // Prefer an explicit "from X to Y" route so phrases such as
  // "go to Biman website and search available flights from Dhaka to Chittagong"
  // cannot accidentally become one huge origin string.
  let route=t.match(/\bfrom\s+([A-Za-z][A-Za-z .'-]{1,45}?)\s+to\s+([A-Za-z][A-Za-z .'-]{1,45}?)(?=\s+(?:on|for|depart|departure|return|check|search|show|find|all|available|flight|flights|with|and)\b|[,.]|$)/i);
  if(!route){
    route=t.match(/\b([A-Za-z][A-Za-z .'-]{1,35}?)\s+to\s+([A-Za-z][A-Za-z .'-]{1,35}?)(?=\s+(?:on|for|depart|departure|return|check|search|show|find|available|flight|flights)\b|[,.]|$)/i);
  }
  if(route){
    origin=route[1].replace(/^(?:go|fly|flight|flights|select|search|available|from)\s+/i,'').trim();
    destination=route[2].trim();
  }
  const iso=t.match(/\b(20\d{2}-\d{2}-\d{2})\b/); if(iso) departDate=iso[1];
  return {origin,destination,departDate};
}
function parseVoiceIntent(raw){
  const transcript=normalizeVoiceText(raw);
  if(!transcript) throw new Error('Please record or type a voice command first.');
  let site=detectVoiceSite(transcript);
  const travel=detectTravelIntent(transcript);
  const askedAny=/\b(any website|any site|best website|best site|choose (?:a|the) website|choose (?:a|the) site|from anywhere)\b/i.test(transcript);
  if(travel && (!site || askedAny)) site={...VOICE_SITES.trip,key:'trip',domain:'www.trip.com',autoSelected:true};
  if(!site || askedAny) site=chooseBestVoiceSite(transcript);
  const prices=detectVoicePrices(transcript);
  const query=travel ? [travel.origin,travel.destination].filter(Boolean).join(' to ') || 'flights' : detectVoiceQuery(transcript,site,prices);
  const mode=travel?'agent':'catalog';
  const targetUrl=travel ? site.base : site.search.replace('{query}',encodeURIComponent(query));
  const range = prices.maxPrice!=null ? `৳${Number(prices.minPrice||0).toLocaleString()}–৳${Number(prices.maxPrice).toLocaleString()}` : prices.minPrice!=null ? `above ৳${Number(prices.minPrice).toLocaleString()}` : '';
  const cleanName=travel ? `${site.label} ${query} Flight Search API` : `${site.label} ${query}${range?' '+range:''} API`;
  return {
    id:`voice-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    name: cleanName.length>90 ? `${site.label} ${travel?'Flight Search':query} API` : cleanName,
    description: travel ? `Autonomous browser API that opens ${site.label}, analyzes the page, enters the requested flight route, searches, verifies the result page, and extracts visible live flight results.` : `Voice-created website API that searches ${site.label} for ${query}${range?` in the ${range} price range`:''}, then captures live visible product data.`,
    transcript,siteKey:site.key,siteLabel:site.label,domain:site.domain||new URL(site.base).hostname,baseUrl:site.base,autoSelectedSite:!!site.autoSelected,
    query,minPrice:prices.minPrice,maxPrice:prices.maxPrice,targetUrl,createdAt:new Date().toISOString(),type:'voice',mode,agentType:travel?'travel':null,travel
  };
}
function updateVoiceTranscriptDisplay(){
  const area=$('voice-transcript');
  if(area && document.activeElement!==area) area.value=state.voice.transcript || '';
}
async function ensureMicPermission(){
  if(!navigator.mediaDevices?.getUserMedia) return;
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  stream.getTracks().forEach(t=>t.stop());
}
async function startVoice(){
  const SpeechRecognition=window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    state.voice.lastError='Voice recognition is not available in this Chrome build. You can still type the command in the transcript box.';
    render(); return;
  }
  try{ await ensureMicPermission(); }catch(e){
    state.voice.lastError='Microphone permission is required. Allow microphone access for APIGarden and try again.'; render(); return;
  }
  if(voiceRecognition){ try{ voiceRecognition.abort(); }catch(e){} }
  voiceFinalTranscript=state.voice.transcript ? `${state.voice.transcript.trim()} ` : '';
  state.voice.manualStop=false; state.voice.listening=true; state.voice.lastError=''; state.voice.draft=null;
  const rec=new SpeechRecognition();
  voiceRecognition=rec;
  rec.continuous=true; rec.interimResults=true; rec.lang='en-US';
  rec.onresult=(event)=>{
    let interim='';
    for(let i=event.resultIndex;i<event.results.length;i++){
      const piece=event.results[i][0]?.transcript || '';
      if(event.results[i].isFinal) voiceFinalTranscript += piece + ' ';
      else interim += piece;
    }
    state.voice.transcript=normalizeVoiceText(voiceFinalTranscript + interim);
    updateVoiceTranscriptDisplay();
  };
  rec.onerror=(event)=>{
    if(event.error==='aborted' && state.voice.manualStop) return;
    state.voice.lastError=`Voice recognition: ${event.error || 'unknown error'}`;
    if(['not-allowed','service-not-allowed'].includes(event.error)) state.voice.manualStop=true;
  };
  rec.onend=()=>{
    if(state.voice.listening && !state.voice.manualStop){
      setTimeout(()=>{ try{ rec.start(); }catch(e){} },180);
    }else{
      state.voice.listening=false;
      voiceRecognition=null;
      render();
    }
  };
  rec.start(); render();
}
function stopVoice(){
  state.voice.manualStop=true; state.voice.listening=false;
  const area=$('voice-transcript'); if(area) state.voice.transcript=normalizeVoiceText(area.value);
  if(voiceRecognition){ try{ voiceRecognition.stop(); }catch(e){} }
  voiceRecognition=null; render();
}
function clearVoice(){
  if(state.voice.listening) stopVoice();
  state.voice={listening:false,manualStop:false,transcript:'',draft:null,lastError:''};
  if(state.store?.voiceDrafts && state.role && state.email){ delete state.store.voiceDrafts[key(state.role,state.email)]; save(); }
  voiceFinalTranscript=''; render();
}
async function analyzeVoice(){
  const area=$('voice-transcript');
  if(area) state.voice.transcript=normalizeVoiceText(area.value);
  try{
    state.voice.draft=parseVoiceIntent(state.voice.transcript);
    state.store.voiceDrafts=state.store.voiceDrafts||{};
    state.store.voiceDrafts[key(state.role,state.email)]=state.voice.draft;
    await save();
    state.voice.lastError=''; toast('Voice command analyzed. API draft is ready to run.');
  }catch(e){ state.voice.lastError=e.message || String(e); }
  render();
}
async function runVoiceDraft(){
  const d=state.voice.draft; if(!d) return;
  state.store.voiceDrafts=state.store.voiceDrafts||{}; state.store.voiceDrafts[key(state.role,state.email)]=d; await save();
  toast(`Opening ${d.siteLabel}…`);
  const res=await chrome.runtime.sendMessage({type:'APIGARDEN_RUN_VOICE_API',intent:d,runKind:'draft',runId:d.id});
  if(!res?.ok){ state.voice.lastError=res?.error || 'Could not run voice API'; render(); return; }
  const extracted=res.extraction?.ok?res.extraction:{results:[],resultCount:0,sourceUrl:res.url||d.targetUrl,pageTitle:''};
  d.lastOutcome={
    apiName:d.name, description:d.description, query:d.query, status:extracted.agent?.status==='needs_user_action'?'needs_user_action':((extracted.resultCount||0)>0?'success':'no_results_captured'), sourceUrl:extracted.sourceUrl||res.url||d.targetUrl,
    pageTitle:extracted.pageTitle||'', resultCount:extracted.resultCount||0, results:extracted.results||[],
    filters:d.agentType==='travel'?null:{minPrice:d.minPrice,maxPrice:d.maxPrice,currency:'BDT'}, voice:{transcript:d.transcript,website:d.siteLabel}, travel:d.travel||null, agent:extracted.agent||null,
    generatedAt:new Date().toISOString(), note:extracted.resultCount?(d.agentType==='travel'?'Autonomous browser agent reached a live result page and extracted visible flight results.':'Live visible product data extracted after the voice search and price filter were applied.'):(d.agentType==='travel'?'The autonomous browser agent attempted the workflow but could not verify visible final flight results.':'The website opened and the filter ran, but no matching visible product cards were detected.')
  };
  d.finalUrl=d.lastOutcome.sourceUrl;
  state.voice.draft=d; state.store.voiceDrafts[key(state.role,state.email)]=d; await save(); await chrome.storage.local.remove([VOICE_RESULT_KEY]); toast(extracted.resultCount?`${extracted.resultCount} matching live products found`:'Website opened; no matching product cards detected'); render();
}
async function saveVoiceDraft(){
  const d=state.voice.draft; if(!d?.lastOutcome){ toast('Run the API first'); return; }
  const u=currentUser(); u.apis=u.apis||[];
  u.apis.unshift({id:d.id,name:d.name,description:d.description,runs:1,type:'voice',finalUrl:d.finalUrl||d.targetUrl,voiceIntent:{...d,lastOutcome:undefined},lastOutcome:d.lastOutcome});
  state.store.users[key(state.role,state.email)]=u; delete state.store.voiceDrafts?.[key(state.role,state.email)]; state.voice.draft=null; await save(); state.tab='apis'; await saveSession(); toast('Voice API saved to My APIs'); render();
}
function downloadVoiceDraft(){
  const d=state.voice.draft; if(!d?.lastOutcome) return;
  downloadJsonFile(d.lastOutcome,`${safeFileName(d.name)}-outcome.json`);
}
async function runVoiceApi(index){
  const u=currentUser(); const api=u.apis?.[index]; if(!api || api.type!=='voice') return;
  const intent={...(api.voiceIntent||{}),name:api.name,description:api.description,targetUrl:api.finalUrl||api.voiceIntent?.targetUrl};
  const res=await chrome.runtime.sendMessage({type:'APIGARDEN_RUN_VOICE_API',intent,runKind:'saved',runId:api.id});
  if(!res?.ok){ toast(res?.error||'Could not run voice API'); return; }
  const ex=res.extraction?.ok?res.extraction:{results:[],resultCount:0};
  api.runs=(api.runs||0)+1; api.finalUrl=ex.sourceUrl||res.url||api.finalUrl;
  api.lastOutcome={apiName:api.name,description:api.description,query:intent.query||'',status:ex.agent?.status==='needs_user_action'?'needs_user_action':((ex.resultCount||0)>0?'success':'no_results_captured'),sourceUrl:api.finalUrl,pageTitle:ex.pageTitle||'',resultCount:ex.resultCount||0,results:ex.results||[],filters:intent.agentType==='travel'?null:{minPrice:intent.minPrice??null,maxPrice:intent.maxPrice??null,currency:'BDT'},voice:{transcript:intent.transcript||'',website:intent.siteLabel||intent.domain||''},travel:intent.travel||null,agent:ex.agent||null,generatedAt:new Date().toISOString(),note:ex.resultCount?(intent.agentType==='travel'?'Autonomous browser agent reached the live result page and captured visible flight results.':'Live visible product data extracted after the saved voice API ran.'):(intent.agentType==='travel'?'The autonomous workflow ran, but final visible flight results could not be verified.':'The website opened, but no matching visible product cards were detected.')};
  await save(); await chrome.storage.local.remove([VOICE_RESULT_KEY]); toast(ex.resultCount?`${ex.resultCount} matching live products captured`:'Page opened; no matching products detected'); render();
}

function recordingView(){
  const rec = state.recording || {isRecording:false,steps:[],finalUrl:''};
  const count = Array.isArray(rec.steps) ? rec.steps.length : 0;
  const status = rec.isRecording ? 'Recording is active' : 'Recorder is stopped';
  return `<div class="card recorder-card">
    <div class="recording-head"><div><h2>Activity Recorder</h2><p>${status}. Closing this popup will not stop it.</p></div><span class="record-dot ${rec.isRecording?'active':''}"></span></div>
    <div class="record-summary"><b>${count}</b> captured actions</div>
    ${rec.finalUrl ? `<label>Latest captured page</label><div class="record-url">${esc(rec.finalUrl)}</div>` : ''}
    <label>API name</label><input id="record-api-name" value="${esc(rec.title ? `${rec.title} Automation` : 'Recorded Browser Automation')}" placeholder="Walton colourful fridge API">
    <div class="actions">
      ${rec.isRecording
        ? `<button class="btn danger" data-action="stopRecording">Stop and create API</button>`
        : `<button class="btn primary" data-action="startRecording">Start recording</button>`}
      ${!rec.isRecording && count ? `<button class="btn soft" data-action="discardRecording">Discard recording</button>` : ''}
    </div>
    <p class="small">Start recording, browse in any Chrome tab, search or click normally, then return here and stop. The REC badge remains visible while recording.</p>
  </div>`;
}
async function refreshRecordingStatus(shouldRender=false){
  try{
    const res = await chrome.runtime.sendMessage({type:'APIGARDEN_RECORDING_STATUS'});
    if(res?.ok) state.recording = res.recording;
  }catch(e){ state.recording = {isRecording:false,steps:[],finalUrl:''}; }
  if(shouldRender) render();
}
async function startRecording(){
  const res = await chrome.runtime.sendMessage({type:'APIGARDEN_START_RECORDING'});
  if(!res?.ok){ toast(res?.error || 'Could not start recording'); return; }
  state.recording = res.recording;
  toast('Recording started. You may close the popup.');
  render();
}
async function stopRecording(){
  const desiredName = $('record-api-name')?.value.trim();
  const res = await chrome.runtime.sendMessage({type:'APIGARDEN_STOP_RECORDING'});
  if(!res?.ok){ toast(res?.error || 'Could not stop recording'); return; }
  state.recording = res.recording;
  const rec = res.recording || {};
  if(!rec.finalUrl){ toast('Stopped, but no normal website page was captured'); render(); return; }
  const u = currentUser();
  u.apis = u.apis || [];
  const extracted = res.extraction?.ok ? res.extraction : {results:[],resultCount:0};
  const apiName = desiredName || rec.title || 'Recorded Browser Automation';
  const apiDescription = `Recorded browser workflow with ${(rec.steps||[]).length} actions. Reopens the captured result page automatically.`;
  u.apis.unshift({
    name: apiName,
    description: apiDescription,
    runs:0,
    type:'recorded',
    finalUrl:rec.finalUrl,
    recording:{startedAt:rec.startedAt,stoppedAt:rec.stoppedAt,steps:rec.steps || [],finalUrl:rec.finalUrl,title:rec.title || ''},
    lastOutcome:{
      apiName,
      description: apiDescription,
      query: extracted.query || new URL(rec.finalUrl).searchParams.get('search') || new URL(rec.finalUrl).searchParams.get('q') || '',
      status: 'success',
      sourceUrl: extracted.sourceUrl || rec.finalUrl,
      pageTitle: extracted.pageTitle || rec.title || '',
      resultCount: extracted.resultCount || 0,
      results: extracted.results || [],
      recording:{
        capturedActions:(rec.steps||[]).length,
        startedAt:rec.startedAt || '',
        stoppedAt:rec.stoppedAt || ''
      },
      generatedAt:new Date().toISOString(),
      note: extracted.resultCount ? 'Live visible product data extracted when recording stopped.' : 'No product cards were detected on the page when recording stopped.'
    }
  });
  state.store.users[key(state.role,state.email)] = u;
  await save();
  await chrome.runtime.sendMessage({type:'APIGARDEN_CLEAR_RECORDING'});
  state.recording = {isRecording:false,steps:[],finalUrl:''};
  state.tab='apis';
  await saveSession();
  toast(extracted.resultCount ? `Recorded API created with ${extracted.resultCount} products` : 'Recorded API created; no products detected');
  render();
}
async function discardRecording(){
  const res = await chrome.runtime.sendMessage({type:'APIGARDEN_CLEAR_RECORDING'});
  if(res?.ok) state.recording=res.recording;
  toast('Recording discarded');
  render();
}
async function runRecordedApi(index){
  const u=currentUser();
  const api=u.apis?.[index];
  if(!api || api.type!=='recorded') return;
  const res=await chrome.runtime.sendMessage({type:'APIGARDEN_REPLAY_RECORDING',recording:api.recording || {finalUrl:api.finalUrl}});
  if(!res?.ok){ toast(res?.error || 'Could not open recorded API'); return; }
  api.runs=(api.runs||0)+1;
  const extracted = res.extraction?.ok ? res.extraction : {results:[],resultCount:0};
  api.lastOutcome = {
    apiName: api.name,
    description: api.description,
    query: extracted.query || api.recording?.steps?.filter(step=>step.type==='input').at(-1)?.value || '',
    status: 'success',
    sourceUrl: extracted.sourceUrl || api.finalUrl || api.recording?.finalUrl || '',
    pageTitle: extracted.pageTitle || '',
    resultCount: extracted.resultCount || 0,
    results: extracted.results || [],
    recording: {
      capturedActions: api.recording?.steps?.length || 0,
      startedAt: api.recording?.startedAt || '',
      stoppedAt: api.recording?.stoppedAt || ''
    },
    generatedAt: new Date().toISOString(),
    note: extracted.resultCount ? 'Live visible product data extracted from the opened webpage.' : 'The page opened, but no matching product cards with visible price/image data were detected.'
  };
  await save();
  toast(extracted.resultCount ? `${extracted.resultCount} live results captured` : 'Page opened; no product results detected');
  render();
}

function apisView(){
  const u = currentUser();
  return `<div class="card">
    <h2>My APIs</h2>
    <p class="small">Deleting an API removes it from your list. It does not restore used run count.</p>
    ${(u.apis || []).length ? u.apis.map((a,i)=>`<div class="api-row"><div><b>${esc(a.name)}</b><p>${esc(a.description)}</p><p class="small">${a.runs || 0} runs${a.type==='recorded'?' · Recorded automation':a.type==='voice'?' · Voice website API':''}</p></div><div class="api-actions">${a.type==='recorded'?`<button class="btn primary" data-action="runRecordedApi" data-index="${i}">Run API</button>`:a.type==='voice'?`<button class="btn primary" data-action="runVoiceApi" data-index="${i}">Run API</button>`:''}<button class="btn soft" data-action="downloadApiJson" data-index="${i}">Download JSON</button><button class="btn danger" data-action="deleteApi" data-index="${i}">Delete</button></div></div>`).join('') : `<p>No APIs yet.</p>`}
    <hr>
    <h3>Create quick API</h3>
    <label>API name</label><input id="api-name" placeholder="Hotel chooser API">
    <label>Description</label><textarea id="api-desc" rows="3" placeholder="This API recommends the best option from a page based on user needs."></textarea>
    <div class="actions"><button class="btn primary" data-action="addApi">Save API</button></div>
  </div>`;
}
function upgradeView(){
  return `<div class="card">
    <h2>Upgrade Plans</h2>
    <p>Choose the same plans available on the website.</p>
    <label>Backend URL / Render link</label>
    <input id="upgrade-backend" value="${esc(state.store.backendUrl || '')}" placeholder="https://api-garden.onrender.com">
    <div class="extension-plan"><span class="badge">Current</span><h3>Free Trial</h3><div class="plan-price">৳0</div><p>5 ready-made APIs · 6 free AI runs</p></div>
    <div class="extension-plan featured"><span class="badge">Popular</span><h3>Pro Monthly</h3><div class="plan-price">৳1200 <small>/ month</small></div><p>Unlimited runs · Sell on marketplace · Saved autofill</p><button class="btn primary" data-action="requestUpgrade" data-plan="Pro Monthly" data-amount="৳1200">Choose Pro Monthly</button></div>
    <div class="extension-plan"><h3>Pro Yearly</h3><div class="plan-price">৳9000 <small>/ year</small></div><p>Everything in monthly · 2 months free</p><button class="btn soft" data-action="requestUpgrade" data-plan="Pro Yearly" data-amount="৳9000">Choose Pro Yearly</button></div>
  </div>`;
}
function renderAdmin(){
  const pending = state.store.admin.pending || [];
  const approved = state.store.admin.approved || [];
  appShell(`<div class="card">
    <label>Backend URL / Render link</label>
    <input id="admin-backend" value="${esc(state.store.backendUrl || '')}" placeholder="https://api-garden.onrender.com">
    <div class="actions" style="margin-top:8px"><button class="btn soft" data-action="reloadAdmin">↻ Reload requests</button></div>
    <h2>Pending Approval</h2>
    ${pending.length ? pending.map((t,i)=>`<div class="card"><b>${esc(t.plan)}</b><p>${esc(t.buyer || t.user)} · ${esc(t.amount)} · ${esc(t.date)}</p><div class="actions"><button class="btn primary" data-action="approve" data-index="${i}">Approve</button><button class="btn danger" data-action="reject" data-index="${i}">Reject</button></div></div>`).join('') : `<p>No pending requests.</p>`}
    <hr>
    <h2>Approved / Rejected</h2>
    ${approved.length ? approved.slice(0,8).map(t=>`<p><b>${esc(t.status || 'Approved')}</b> — ${esc(t.plan)} — ${esc(t.buyer || t.user)}</p>`).join('') : `<p>No history yet.</p>`}
  </div>`);
}
function render(){
  if(state.screen === 'landing') return landing();
  if(state.screen === 'login') return loginScreen(state.role);
  return renderApp();
}

async function activeTab(){
  const tabs = await chrome.tabs.query({active:true,currentWindow:true});
  return tabs && tabs[0];
}
async function ensureContent(tabId){
  try{
    await chrome.tabs.sendMessage(tabId, {type:'APIGARDEN_PING'});
    return true;
  }catch(e){
    try{
      await chrome.scripting.executeScript({target:{tabId}, files:['content.js']});
      await chrome.tabs.sendMessage(tabId, {type:'APIGARDEN_PING'});
      return true;
    }catch(err){
      throw new Error('This page cannot be accessed by the extension. Try a normal website tab and refresh it once.');
    }
  }
}
async function sendToPage(message){
  const tab = await activeTab();
  if(!tab || !tab.id) throw new Error('No active tab found.');
  if(/^chrome:|^edge:|^about:|^chrome-extension:/.test(tab.url || '')) throw new Error('Extensions cannot read this type of page.');
  await ensureContent(tab.id);
  return await chrome.tabs.sendMessage(tab.id, message);
}
async function loadCurrentUrl(){
  try{
    const tab = await activeTab();
    const el = $('currentUrl');
    if(el) el.value = tab?.url || '';
  }catch(e){}
}
async function fillForm(){
  saveInfo();
  const u = currentUser();
  try{
    const res = await sendToPage({type:'APIGARDEN_FILL_FORM', data:u.savedInfo});
    toast(`Filled ${res?.filled || 0} matching fields`);
  }catch(e){ toast(e.message); }
}
async function askBackend(description,input){
  const backend = ($('an-backend')?.value || state.store.backendUrl || '').trim().replace(/\/$/,'');
  if(!backend) throw new Error('Paste your Render backend URL first.');
  state.store.backendUrl = backend;
  await save();
  const res = await fetch(`${backend}/api/run-api`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({description,input})
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Backend request failed.');
  return clean(data.answer || '');
}

function tokenizeQuestion(q){
  const stop = new Set(['best','suggest','recommend','which','what','for','me','the','a','an','is','are','will','be','to','of','and','or','in','on','with','available','list','page','this','their','there','i','want','need']);
  return String(q || '').toLowerCase()
    .replace(/[^a-z0-9\s]+/g,' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w));
}
function scoreItem(text, terms){
  const lower = String(text || '').toLowerCase();
  let score = 0;
  for(const t of terms){
    if(lower.includes(t)) score += 5;
    const singular = t.replace(/s$/,'');
    if(singular && singular !== t && lower.includes(singular)) score += 3;
  }
  const intentBoosts = [
    ['dandruff', ['dandruff','anti dandruff','scalp','head shoulders','clear','selsun','ketoconazole','shampoo']],
    ['vanilla', ['vanilla','cake','cream','pastry','bakery']],
    ['cake', ['cake','vanilla','chocolate','cream','pastry','bakery']],
    ['shampoo', ['shampoo','hair','scalp','dandruff']]
  ];
  for(const [intent, words] of intentBoosts){
    if(terms.includes(intent)){
      for(const w of words){ if(lower.includes(w)) score += 2; }
    }
  }
  // Slightly prefer concise product-looking texts.
  if(lower.length < 180) score += 1;
  if(/\b৳|\$|tk|bdt|price|ml|gm|g\b/.test(lower)) score += 1;
  return score;
}
function localAnalyzePage(question, page){
  const terms = tokenizeQuestion(question);
  const items = Array.isArray(page.items) ? page.items.map(x => typeof x === 'string' ? x : x.text).filter(Boolean) : [];
  const fallbackLines = String(page.text || '').split(/\n|\|/).map(x=>x.trim()).filter(x=>x.length > 4 && x.length < 260);
  const pool = [...items, ...fallbackLines];
  const seen = new Set();
  const ranked = pool
    .filter(x => {
      const k = x.toLowerCase();
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(text => ({text, score: scoreItem(text, terms)}))
    .filter(x => x.score > 0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);

  const qLower = String(question || '').toLowerCase();
  if(/summary|summarize|summarise|short note|main point/.test(qLower)){
    const cleanText = String(page.text || '').replace(/\s+/g,' ').slice(0,1200);
    return `Summary: ${cleanText || 'I could not read enough text from this page.'}`;
  }

  if(ranked.length){
    const best = ranked[0].text;
    const list = ranked.map((x,i)=>`${i+1}. ${x.text}`).join('\n');
    return `Best page-based match: ${best}

Why: It matches your question keywords from the current page content.

Other matching options found:
${list}`;
  }

  const sample = String(page.text || '').replace(/\s+/g,' ').slice(0,1000);
  return `I read the page, but I could not find a clear matching option for "${question}".

Page text sample:
${sample || 'No readable text found.'}`;
}

function formatAnalyzerResult(text){
  const safe = String(text || '').replace(/[#*|_`>]/g,'').replace(/\r/g,'').trim();
  if(!safe) return '<p>No answer returned.</p>';
  const lines=safe.split('\n').map(x=>x.trim()).filter(Boolean);
  const pairs=[]; const paragraphs=[]; const numbered=[];
  lines.forEach(line=>{
    const n=line.match(/^\d+[.)]\s*(.+)$/);
    if(n){ numbered.push(n[1]); return; }
    const pair=line.match(/^([^:]{2,45}):\s*(.+)$/);
    if(pair) pairs.push([pair[1],pair[2]]); else paragraphs.push(line.replace(/^[-•]+\s*/,''));
  });
  let html=paragraphs.map(x=>`<p>${esc(x)}</p>`).join('');
  if(pairs.length>=2) html+=`<table class="answer-table">${pairs.map(([a,b])=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>`;
  else html+=pairs.map(([a,b])=>`<p><strong>${esc(a)}:</strong> ${esc(b)}</p>`).join('');
  if(numbered.length) html+=`<ol>${numbered.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`;
  return html;
}

async function analyze(){
  const q = $('an-question').value.trim();
  if(!q){ toast('Write a question first'); return; }

  const u = currentUser();
  if(state.role !== 'pro'){
    if(u.credits.used >= u.credits.max){
      toast('Free runs finished');
      return;
    }
    u.credits.used++;
    state.store.users[key(state.role,state.email)] = u;
    await save();
    const badge = document.querySelector('.badge');
    if(badge) badge.textContent = `${u.credits.max-u.credits.used}/${u.credits.max} runs`;
  }

  const result = $('an-result');
  result.innerHTML = `<div class="result">Reading current page...</div>`;

  let page;
  try{
    page = await sendToPage({type:'APIGARDEN_GET_PAGE_CONTEXT'});
  }catch(e){
    result.innerHTML = `<div class="result">${esc(e.message || 'Could not read this page. Try refreshing the page once and open the extension again.')}</div>`;
    return;
  }

  const localAnswer = localAnalyzePage(q, page || {});
  const backendInput = `User question: ${q}

Current page URL: ${page.url || ''}
Current page title: ${page.title || ''}

Detected products/options/items:
${(page.items || []).map((x,i)=>`${i+1}. ${typeof x === 'string' ? x : x.text}`).slice(0,120).join('\n')}

Readable webpage content:
${(page.text || '').slice(0,12000)}

Rules:
- Answer according to this webpage only.
- If the user asks for a product recommendation, compare the available page items and choose the best match.
- For anti-dandruff shampoo, prefer products mentioning dandruff/scalp/shampoo or known anti-dandruff context if visible on the page.
- For vanilla cake, prefer items mentioning vanilla/cake/cream/bakery if visible on the page.
- For article questions, summarize or extract the requested name/detail from page text.
- If the exact answer is not visible, say what matching options you found instead.
- Keep it concise.
- Return clean plain text only.
- Do not use markdown, hash signs, asterisks, pipes, underscores, or decorative symbols.
- Use short labelled lines when comparison is useful.`;

  try{
    result.innerHTML = `<div class="result">Analyzing with AI...</div>`;
    const answer = await askBackend(
      'You are APIGarden Page Analyzer. You must answer using the supplied current webpage content and detected page items. Recommend the best matching product/option when asked.',
      backendInput
    );
    const finalAnswer = clean(answer) || localAnswer;
    result.innerHTML = `<div class="result">${formatAnalyzerResult(finalAnswer)}</div>`;
  }catch(e){
    // Important: even if Render URL/API fails, still show a page-based answer.
    result.innerHTML = `<div class="result">${formatAnalyzerResult(localAnswer)}<hr><span class="small">AI backend was not reachable, so this is a local page-based suggestion. Check the backend URL for smarter answers.</span></div>`;
  }

  await save();
}
async function reloadMessages(){
  state.store = await storageGet();
  if(!state.store.backendUrl) state.store.backendUrl = DEFAULT_BACKEND_URL;
  const synced = await pullMessagesFromBackend(state.role, state.email);
  toast(synced ? 'Admin messages reloaded from website' : 'Messages reloaded locally');
  render();
}
async function requestUpgrade(plan="Pro Monthly", amount="৳1200"){
  const upgradeBackend = $('upgrade-backend')?.value.trim();
  if(upgradeBackend) state.store.backendUrl = upgradeBackend;
  const u = currentUser();
  const txn = {
    id:'TXN-'+Math.floor(1000+Math.random()*9000),
    user:u.email,
    buyer:u.email,
    plan,
    amount,
    method:'bKash Send Money',
    date:new Date().toISOString().slice(0,10)
  };
  state.store.admin.pending.unshift(txn);
  await save();
  const synced = await pushPendingToBackend(txn);
  toast(synced ? 'Request sent to admin website and extension' : 'Request saved in extension. Add Backend URL to sync with website admin.');
}
async function approve(index){
  const t = state.store.admin.pending[index];
  if(!t) return;
  const pass = 'ap-' + Math.random().toString(36).slice(2,8);
  state.store.admin.pending.splice(index,1);
  state.store.admin.approved.unshift({...t,status:'Approved',password:pass});
  const freeK = key('free', t.buyer || t.user);
  const proK = key('pro', t.buyer || t.user);
  const free = state.store.users[freeK] || freshUser('free', t.buyer || t.user);
  const pro = state.store.users[proK] || freshUser('pro', t.buyer || t.user);
  const freeMsg = {from:'Admin', body:`Your ${t.plan} request has been approved. Pro login email: ${t.buyer || t.user}. Temporary password: ${pass}`, password:pass};
  const proMsg = {from:'Admin', body:`Your Pro account is active. Temporary password: ${pass}`, password:pass};
  free.messages.unshift(freeMsg);
  pro.messages.unshift(proMsg);
  pushUserMessageToBackend('free', t.buyer || t.user, freeMsg);
  pushUserMessageToBackend('pro', t.buyer || t.user, proMsg);
  pro.password = pass;
  pro.savedInfo = {...free.savedInfo, email:free.email};
  pro.apis = [...(free.apis || []), ...(pro.apis || [])];
  state.store.users[freeK] = free;
  state.store.users[proK] = pro;
  await save();
  await syncAdminToBackend();
  toast('Approved and message sent');
  render();
}
async function reject(index){
  const t = state.store.admin.pending[index];
  if(!t) return;
  state.store.admin.pending.splice(index,1);
  state.store.admin.approved.unshift({...t,status:'Rejected'});
  const freeK = key('free', t.buyer || t.user);
  const free = state.store.users[freeK] || freshUser('free', t.buyer || t.user);
  const rejectMsg = {from:'Admin', body:`Your ${t.plan} request was rejected. Please check your transaction details and try again.`};
  free.messages.unshift(rejectMsg);
  pushUserMessageToBackend('free', t.buyer || t.user, rejectMsg);
  state.store.users[freeK] = free;
  await save();
  await syncAdminToBackend();
  toast('Rejected and message sent');
  render();
}
async function addApi(){
  const name = $('api-name').value.trim();
  const description = $('api-desc').value.trim();
  if(!name || !description){ toast('Add name and description'); return; }
  const u = currentUser();
  u.apis.unshift({name,description,runs:0});
  state.store.users[key(state.role,state.email)] = u;
  await save();
  toast('API saved');
  render();
}
async function deleteApi(index){
  const u = currentUser();
  const api = u.apis[index];
  if(!api) return;
  if(!confirm(`Delete "${api.name}"? Used run count will not be restored.`)) return;
  u.apis.splice(index,1);
  state.store.users[key(state.role,state.email)] = u;
  await save();
  toast('API deleted');
  render();
}

document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const action = btn.dataset.action;
  if(action === 'gotoLogin'){ state.role = btn.dataset.role; state.screen='login'; render(); }
  if(action === 'landing'){ state.screen='landing'; state.role=null; render(); }
  if(action === 'login'){ login(btn.dataset.role); }
  if(action === 'logout'){ logout(); }
  if(action === 'tab'){ state.tab = btn.dataset.tab; await saveSession(); render(); }
  if(action === 'saveInfo'){ saveInfo(); await save(); }
  if(action === 'addCustomField'){ addCustomField(); }
  if(action === 'removeCustomField'){ removeCustomField(Number(btn.dataset.index)); }
  if(action === 'removeProfileField'){ removeProfileField(btn.dataset.field); }
  if(action === 'restoreProfileFields'){ restoreProfileFields(); }
  if(action === 'fillForm'){ fillForm(); }
  if(action === 'reloadUrl'){ loadCurrentUrl(); toast('URL reloaded'); }
  if(action === 'analyze'){ analyze(); }
  if(action === 'reloadMessages'){ reloadMessages(); }
  if(action === 'startRecording'){ startRecording(); }
  if(action === 'stopRecording'){ stopRecording(); }
  if(action === 'discardRecording'){ discardRecording(); }
  if(action === 'startVoice'){ startVoice(); }
  if(action === 'stopVoice'){ stopVoice(); }
  if(action === 'clearVoice'){ clearVoice(); }
  if(action === 'analyzeVoice'){ analyzeVoice(); }
  if(action === 'runVoiceDraft'){ runVoiceDraft(); }
  if(action === 'saveVoiceDraft'){ saveVoiceDraft(); }
  if(action === 'downloadVoiceDraft'){ downloadVoiceDraft(); }
  if(action === 'runVoiceApi'){ runVoiceApi(Number(btn.dataset.index)); }
  if(action === 'runRecordedApi'){ runRecordedApi(Number(btn.dataset.index)); }
  if(action === 'downloadApiJson'){ downloadApiJson(Number(btn.dataset.index)); }
  if(action === 'requestUpgrade'){ requestUpgrade(btn.dataset.plan || 'Pro Monthly', btn.dataset.amount || '৳1200'); }
  if(action === 'reloadAdmin'){ const adminBackend = $('admin-backend')?.value.trim(); state.store = await storageGet(); if(adminBackend) state.store.backendUrl = adminBackend; await save(); const synced = await pullAdminFromBackend(); toast(synced ? 'Website requests reloaded' : 'Extension requests reloaded'); render(); }
  if(action === 'approve'){ approve(Number(btn.dataset.index)); }
  if(action === 'reject'){ reject(Number(btn.dataset.index)); }
  if(action === 'addApi'){ addApi(); }
  if(action === 'deleteApi'){ deleteApi(Number(btn.dataset.index)); }
});

load();
