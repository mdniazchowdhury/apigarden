
(function(){
  if(window.__APIGARDEN_CONTENT_READY__) return;
  window.__APIGARDEN_CONTENT_READY__ = true;

  function norm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function firstName(full){ return String(full || '').trim().split(/\s+/)[0] || ''; }
  function lastName(full){ const parts = String(full || '').trim().split(/\s+/); return parts.length > 1 ? parts.slice(1).join(' ') : ''; }

  function nearbyText(el){
    let parts = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('autocomplete'),
      el.getAttribute('title')
    ];
    if(el.labels) parts.push(...Array.from(el.labels).map(l=>l.innerText));
    const parent = el.closest('label, div, p, section, fieldset, form, tr, td');
    if(parent) parts.push(parent.innerText.slice(0, 220));
    return norm(parts.filter(Boolean).join(' '));
  }

  function setValue(el, value){
    if(!value) return false;
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    if(['hidden','password','submit','button','checkbox','radio','file'].includes(type)) return false;

    if(tag === 'select'){
      const v = norm(value);
      const opt = Array.from(el.options).find(o => {
        const ov = norm(o.value);
        const ot = norm(o.text);
        return ov === v || ot === v || ov.includes(v) || ot.includes(v) || v.includes(ot);
      });
      if(opt){
        el.value = opt.value;
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
        return true;
      }
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
    if(/\b(first name|given name)\b/.test(label)) return firstName(data.name);
    if(/\b(last name|surname|family name)\b/.test(label)) return lastName(data.name);
    if(/\b(full name|guest name|customer name|your name|name)\b/.test(label) && !/\buser\s?name|company name|hotel name|property name\b/.test(label)) return data.name;
    if(/\b(email|e mail|mail address)\b/.test(label)) return data.email;
    if(/\b(phone|mobile|contact number|telephone|cell|whatsapp)\b/.test(label)) return data.phone;
    if(/\b(gender|sex)\b/.test(label)) return data.gender;
    if(/\bcountry\b/.test(label)) return data.country;
    if(/\b(city|town|district)\b/.test(label)) return data.city;
    if(/\b(location|address|area|street|road|state|province)\b/.test(label)) return data.location || data.address || data.city;
    if(/\b(date of birth|dob|birth date|birthday)\b/.test(label)) return data.dob;
    return '';
  }

  function fillForm(data){
    let filled = 0;
    document.querySelectorAll('input, textarea, select').forEach(el=>{
      const label = nearbyText(el);
      const value = matchValue(label, data || {});
      if(value && setValue(el, value)) filled++;
    });
    return filled;
  }

  function getPageContext(){
    const title = document.title || '';
    const url = location.href;
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map(h=>h.innerText.trim()).filter(Boolean).slice(0, 20).join(' | ');
    const text = (document.body?.innerText || '').replace(/\s+/g,' ').trim().slice(0, 12000);
    return `Title: ${title}\nURL: ${url}\nHeadings: ${headings}\nPage text: ${text}`;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
    if(msg && msg.type === 'APIGARDEN_PING'){
      sendResponse({ok:true});
      return true;
    }
    if(msg && msg.type === 'APIGARDEN_FILL_FORM'){
      const filled = fillForm(msg.data || {});
      sendResponse({ok:true, filled});
      return true;
    }
    if(msg && msg.type === 'APIGARDEN_GET_PAGE_CONTEXT'){
      sendResponse({ok:true, text:getPageContext(), url:location.href, title:document.title || ''});
      return true;
    }
  });
})();
