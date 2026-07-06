
const $ = (id) => document.getElementById(id);
const STORE_KEY = 'apigarden_extension_store_v1';
const ISHITA = 'ishita.chowdhury@northsouth.edu';

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
  store:null
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
        backendUrl:'',
        users:{},
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
function key(role,email){ return `${role}:${String(email || '').toLowerCase()}`; }
function freshUser(role,email){
  const seeded = role === 'free' && String(email).toLowerCase() === ISHITA;
  return {
    role,email,
    credits:{used:0,max:6},
    savedInfo:{name:'', email, phone:'', gender:'', country:'', city:'', location:'', dob:''},
    messages:[],
    apis: seeded ? JSON.parse(JSON.stringify(defaultApis)) : [],
    password:''
  };
}
async function load(){
  state.store = await storageGet();
  render();
}
async function save(){
  await storageSet(state.store);
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
  save().then(()=>setScreen('app'));
}
function logout(){
  state.screen='landing'; state.role=null; state.email=''; state.tab='info';
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
    state.tab === 'apis' ? apisView() :
    upgradeView()
  );
  appShell(content);
  if(state.tab === 'analyzer') loadCurrentUrl();
}
function infoView(){
  const u = currentUser();
  const i = u.savedInfo || {};
  return `<div class="card">
    <h2>Saved Info</h2>
    <p>Save your common details, then fill matching fields on the current Chrome page.</p>
    <label>Backend URL / Render link</label>
    <input id="backendUrl" value="${esc(state.store.backendUrl || '')}" placeholder="https://your-app.onrender.com">
    <div class="grid2">
      <div><label>Name</label><input id="info-name" value="${esc(i.name)}"></div>
      <div><label>Email</label><input id="info-email" value="${esc(i.email || u.email)}"></div>
      <div><label>Phone</label><input id="info-phone" value="${esc(i.phone)}"></div>
      <div><label>Gender</label><input id="info-gender" value="${esc(i.gender)}"></div>
      <div><label>Country</label><input id="info-country" value="${esc(i.country)}"></div>
      <div><label>City</label><input id="info-city" value="${esc(i.city)}"></div>
      <div><label>Location / Address</label><input id="info-location" value="${esc(i.location)}"></div>
      <div><label>Date of birth</label><input id="info-dob" value="${esc(i.dob)}"></div>
    </div>
    <div class="actions">
      <button class="btn soft" data-action="saveInfo">Save info</button>
      <button class="btn primary" data-action="fillForm">Fill current page form</button>
    </div>
    <p class="small">Works on normal webpages. Chrome system pages and some protected pages cannot be edited by extensions.</p>
  </div>`;
}
function saveInfo(){
  const u = currentUser();
  state.store.backendUrl = $('backendUrl')?.value.trim() || state.store.backendUrl || '';
  u.savedInfo = {
    name:$('info-name').value.trim(),
    email:$('info-email').value.trim(),
    phone:$('info-phone').value.trim(),
    gender:$('info-gender').value.trim(),
    country:$('info-country').value.trim(),
    city:$('info-city').value.trim(),
    location:$('info-location').value.trim(),
    dob:$('info-dob').value.trim()
  };
  state.store.users[key(state.role,state.email)] = u;
  save().then(()=>toast('Saved'));
}
function analyzerView(){
  return `<div class="card">
    <h2>Current Page Analyzer</h2>
    <p>Ask about the page that was open when you clicked the extension.</p>
    <label>Current page URL</label>
    <input id="currentUrl" readonly placeholder="Detecting current tab...">
    <label>Backend URL / Render link</label>
    <input id="an-backend" value="${esc(state.store.backendUrl || '')}" placeholder="https://your-app.onrender.com">
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
function apisView(){
  const u = currentUser();
  return `<div class="card">
    <h2>My APIs</h2>
    <p class="small">Deleting an API removes it from your list. It does not restore used run count.</p>
    ${(u.apis || []).length ? u.apis.map((a,i)=>`<div class="api-row"><div><b>${esc(a.name)}</b><p>${esc(a.description)}</p><p class="small">${a.runs || 0} runs</p></div><button class="btn danger" data-action="deleteApi" data-index="${i}">Delete</button></div>`).join('') : `<p>No APIs yet.</p>`}
    <hr>
    <h3>Create quick API</h3>
    <label>API name</label><input id="api-name" placeholder="Hotel chooser API">
    <label>Description</label><textarea id="api-desc" rows="3" placeholder="This API recommends the best option from a page based on user needs."></textarea>
    <div class="actions"><button class="btn primary" data-action="addApi">Save API</button></div>
  </div>`;
}
function upgradeView(){
  return `<div class="card">
    <h2>Upgrade Request</h2>
    <p>Send a Pro Monthly payment request to admin. Admin can approve/reject from the extension admin panel.</p>
    <button class="btn primary" data-action="requestUpgrade">Send Pro Monthly Request</button>
  </div>`;
}
function renderAdmin(){
  const pending = state.store.admin.pending || [];
  const approved = state.store.admin.approved || [];
  appShell(`<div class="card">
    <div class="actions" style="margin-top:0"><button class="btn soft" data-action="reloadAdmin">↻ Reload requests</button></div>
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
async function analyze(){
  const q = $('an-question').value.trim();
  if(!q){ toast('Write a question first'); return; }
  const u = currentUser();
  if(state.role !== 'pro'){
    if(u.credits.used >= u.credits.max){ toast('Free runs finished'); return; }
    u.credits.used++;
  }
  const result = $('an-result');
  result.innerHTML = `<div class="result">Reading current page...</div>`;
  try{
    const page = await sendToPage({type:'APIGARDEN_GET_PAGE_CONTEXT'});
    const answer = await askBackend(
      'Analyze the current webpage and answer the user question using only page content. Give the best answer first and short reasons. Do not use markdown bold stars.',
      `Question: ${q}\n\nCurrent webpage content:\n${(page.text || '').slice(0,9000)}`
    );
    result.innerHTML = `<div class="result">${esc(answer).replace(/\n/g,'<br>')}</div>`;
    await save();
    render();
    state.tab='analyzer';
  }catch(e){
    result.innerHTML = `<div class="result">${esc(e.message)}</div>`;
  }
}
async function reloadMessages(){
  state.store = await storageGet();
  toast('Messages reloaded');
  render();
}
async function requestUpgrade(){
  const u = currentUser();
  state.store.admin.pending.unshift({
    id:'TXN-'+Math.floor(1000+Math.random()*9000),
    user:u.email,
    buyer:u.email,
    plan:'Pro Monthly',
    amount:'৳1200',
    method:'bKash Send Money',
    date:new Date().toISOString().slice(0,10)
  });
  await save();
  toast('Request sent to admin');
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
  free.messages.unshift({from:'Admin', body:`Your ${t.plan} request has been approved. Pro login email: ${t.buyer || t.user}. Temporary password: ${pass}`, password:pass});
  pro.messages.unshift({from:'Admin', body:`Your Pro account is active. Temporary password: ${pass}`, password:pass});
  pro.password = pass;
  pro.savedInfo = {...free.savedInfo, email:free.email};
  pro.apis = [...(free.apis || []), ...(pro.apis || [])];
  state.store.users[freeK] = free;
  state.store.users[proK] = pro;
  await save();
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
  free.messages.unshift({from:'Admin', body:`Your ${t.plan} request was rejected. Please check your transaction details and try again.`});
  state.store.users[freeK] = free;
  await save();
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
  if(action === 'tab'){ state.tab = btn.dataset.tab; render(); }
  if(action === 'saveInfo'){ saveInfo(); await save(); }
  if(action === 'fillForm'){ fillForm(); }
  if(action === 'reloadUrl'){ loadCurrentUrl(); toast('URL reloaded'); }
  if(action === 'analyze'){ analyze(); }
  if(action === 'reloadMessages'){ reloadMessages(); }
  if(action === 'requestUpgrade'){ requestUpgrade(); }
  if(action === 'reloadAdmin'){ state.store = await storageGet(); toast('Requests reloaded'); render(); }
  if(action === 'approve'){ approve(Number(btn.dataset.index)); }
  if(action === 'reject'){ reject(Number(btn.dataset.index)); }
  if(action === 'addApi'){ addApi(); }
  if(action === 'deleteApi'){ deleteApi(Number(btn.dataset.index)); }
});

load();
