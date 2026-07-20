
const $ = (id) => document.getElementById(id);
const STORE_KEY = 'apigarden_extension_store_v1';
const DEFAULT_BACKEND_URL = 'https://api-garden.onrender.com';
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
        backendUrl: DEFAULT_BACKEND_URL,
        session:null,
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
    savedInfo:{name:'', email, phone:'', gender:'', country:'', city:'', location:'', dob:''},
    messages:[],
    apis: seeded ? JSON.parse(JSON.stringify(defaultApis)) : [],
    password:''
  };
}
async function load(){
  state.store = await storageGet();
  if(!state.store.backendUrl) state.store.backendUrl = DEFAULT_BACKEND_URL;
  if(state.store.session && state.store.session.role && state.store.session.email){
    state.role = state.store.session.role;
    state.email = state.store.session.email;
    state.tab = state.store.session.tab || (state.role === 'admin' ? 'admin' : 'info');
    state.screen = 'app';
    if(state.role === 'admin') await pullAdminFromBackend();
    else await syncExtensionProfileFromCloud();
  }
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
  save().then(()=>setScreen('app'));
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
    <input id="backendUrl" value="${esc(state.store.backendUrl || '')}" placeholder="https://api-garden.onrender.com">
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
  save().then(()=>{ syncExtensionProfileToCloud(); toast('Saved and synced'); });
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
    <p>Send a Pro Monthly payment request to admin. To show this request in the website admin panel, paste the Render backend URL once.</p>
    <label>Backend URL / Render link</label>
    <input id="upgrade-backend" value="${esc(state.store.backendUrl || '')}" placeholder="https://api-garden.onrender.com">
    <div class="actions"><button class="btn primary" data-action="requestUpgrade">Send Pro Monthly Request</button></div>
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
- Do not use markdown bold stars.`;

  try{
    result.innerHTML = `<div class="result">Analyzing with AI...</div>`;
    const answer = await askBackend(
      'You are APIGarden Page Analyzer. You must answer using the supplied current webpage content and detected page items. Recommend the best matching product/option when asked.',
      backendInput
    );
    const finalAnswer = clean(answer) || localAnswer;
    result.innerHTML = `<div class="result">${esc(finalAnswer).replace(/\n/g,'<br>')}</div>`;
  }catch(e){
    // Important: even if Render URL/API fails, still show a page-based answer.
    result.innerHTML = `<div class="result">${esc(clean(localAnswer)).replace(/\n/g,'<br>')}<hr><span class="small">AI backend was not reachable, so this is a local page-based suggestion. Paste/check your Render backend URL for smarter answers.</span></div>`;
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
async function requestUpgrade(){
  const upgradeBackend = $('upgrade-backend')?.value.trim();
  if(upgradeBackend) state.store.backendUrl = upgradeBackend;
  const u = currentUser();
  const txn = {
    id:'TXN-'+Math.floor(1000+Math.random()*9000),
    user:u.email,
    buyer:u.email,
    plan:'Pro Monthly',
    amount:'৳1200',
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
  if(action === 'fillForm'){ fillForm(); }
  if(action === 'reloadUrl'){ loadCurrentUrl(); toast('URL reloaded'); }
  if(action === 'analyze'){ analyze(); }
  if(action === 'reloadMessages'){ reloadMessages(); }
  if(action === 'requestUpgrade'){ requestUpgrade(); }
  if(action === 'reloadAdmin'){ const adminBackend = $('admin-backend')?.value.trim(); state.store = await storageGet(); if(adminBackend) state.store.backendUrl = adminBackend; await save(); const synced = await pullAdminFromBackend(); toast(synced ? 'Website requests reloaded' : 'Extension requests reloaded'); render(); }
  if(action === 'approve'){ approve(Number(btn.dataset.index)); }
  if(action === 'reject'){ reject(Number(btn.dataset.index)); }
  if(action === 'addApi'){ addApi(); }
  if(action === 'deleteApi'){ deleteApi(Number(btn.dataset.index)); }
});

load();
