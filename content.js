
(function(){
  function norm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' '); }
  function nearbyText(el){
    let parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete')];
    if(el.labels) parts.push(...Array.from(el.labels).map(l=>l.innerText));
    const parent = el.closest('label, div, p, section, fieldset, form');
    if(parent) parts.push(parent.innerText.slice(0, 180));
    return norm(parts.filter(Boolean).join(' '));
  }
  function setValue(el, value){
    if(!value) return false;
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    if(['hidden','password','submit','button','checkbox','radio','file'].includes(type)) return false;
    if(tag === 'select'){
      const v = norm(value);
      const opt = Array.from(el.options).find(o => norm(o.value).includes(v) || norm(o.text).includes(v) || v.includes(norm(o.text)));
      if(opt){ el.value = opt.value; el.dispatchEvent(new Event('change', {bubbles:true})); return true; }
      return false;
    }
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.blur();
    return true;
  }
  function matchValue(label, data){
    if(/\b(full name|name|guest name|first name|last name)\b/.test(label) && !/\buser\s?name|company name\b/.test(label)) return data.name;
    if(/\b(email|e mail|mail address)\b/.test(label)) return data.email;
    if(/\b(phone|mobile|contact number|telephone|cell)\b/.test(label)) return data.phone;
    if(/\b(gender|sex)\b/.test(label)) return data.gender;
    if(/\b(location|city|country|address|area|district)\b/.test(label)) return data.location || data.address;
    if(/\b(date of birth|dob|birth date|birthday)\b/.test(label)) return data.dob;
    return '';
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
    if(msg && msg.type === 'APIGARDEN_FILL_FORM'){
      const data = msg.data || {};
      let filled = 0;
      document.querySelectorAll('input, textarea, select').forEach(el=>{
        const label = nearbyText(el);
        const value = matchValue(label, data);
        if(value && setValue(el, value)) filled++;
      });
      sendResponse({ok:true, filled});
      return true;
    }
    if(msg && msg.type === 'APIGARDEN_GET_PAGE_CONTEXT'){
      const title = document.title || '';
      const url = location.href;
      const pageText = (document.body?.innerText || '').replace(/\s+/g,' ').trim().slice(0, 9000);
      sendResponse({ok:true, text:`Title: ${title}\nURL: ${url}\nPage text: ${pageText}`});
      return true;
    }
  });
})();
