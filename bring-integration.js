(() => {
  'use strict';

  const capturedParams = new URLSearchParams(location.search);
  const pendingImport = capturedParams.has('recipe') ? {
    recipe: (capturedParams.get('recipe') || '').trim(),
    source: capturedParams.get('source') || '',
    rid: capturedParams.get('rid') || '',
    ingredients: parseIngredients(capturedParams.get('ingredients') || '')
  } : null;
  const LOCAL_KEY = 'cuina_bring_recipe_items_v1';

  function parseIngredients(raw) {
    return [...new Set(String(raw || '').split('♦').map(v => v.trim()).filter(Boolean))];
  }

  function parseIngredientText(raw) {
    if (!raw) return [];
    return [...new Set(String(raw).split(/\n|;|,/).map(v => v.trim()).filter(v => v.length > 1))].slice(0, 25);
  }

  function deriveIngredientsFromTitle(title) {
    let text = String(title || '').toLowerCase()
      .replace(/^\d+\.\s*/, '')
      .replace(/\b(exprés|express|base|suau|ràpid(?:a)?|fàcil|guisat(?:s|des)?|estofat(?:s|des)?|al vapor|a la catalana|batch|simultanis?|en dos nivells?|en dos temps|per tres usos|per tres àpats|sense remenar|lleuger(?:a)?)\b/g, ' ')
      .replace(/\b(crema|sopa|arròs|amanida|truita|puré|estofat|guisat|saltat|escalivada|brou|sofregit|salsa|compota|hummus)\s+(de|d'|amb)?\s*/g, '')
      .replace(/\s+(amb|i|més)\s+/g, ',')
      .replace(/\s+de\s+/g, ',')
      .replace(/\s+/g, ' ');
    return [...new Set(text.split(',').map(v => v.trim()).filter(v => v.length > 1))].slice(0, 12);
  }

  function safeKey(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '').slice(0, 180);
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function localRead() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function localWrite(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (_) {}
  }
  function localId(day, meal, recipe) { return `${day}|${meal}|${safeKey(recipe)}`; }
  function localSave(day, meal, recipe, data) {
    const all = localRead();
    all[localId(day, meal, recipe)] = data;
    localWrite(all);
  }
  function localGet(day, meal, recipe) { return localRead()[localId(day, meal, recipe)] || null; }
  function localRemove(day, meal, recipe) {
    const all = localRead();
    delete all[localId(day, meal, recipe)];
    localWrite(all);
  }

  function ensureStyles() {
    if (document.getElementById('bring-integration-style')) return;
    const style = document.createElement('style');
    style.id = 'bring-integration-style';
    style.textContent = `
      .bring-overlay{position:fixed;inset:0;background:rgba(15,23,42,.78);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px}
      .bring-card{width:min(94vw,460px);max-height:88dvh;overflow:auto;background:#fff;border-radius:28px;padding:22px;box-shadow:0 25px 60px rgba(0,0,0,.28);font-family:'Plus Jakarta Sans',sans-serif}
      .bring-card h2{font-size:21px;font-weight:800;margin:0 0 8px}.bring-card p{font-size:13px;color:#64748b;margin:0 0 14px;line-height:1.45}
      .bring-item{display:flex;gap:12px;align-items:flex-start;padding:12px 8px;border-bottom:1px solid #f1f5f9;font-size:15px;font-weight:700}.bring-item input{width:22px;height:22px;flex:none}
      .bring-warning{display:block;font-size:11px;color:#b45309;font-weight:700;margin-top:3px}
      .bring-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.bring-btn{min-height:48px;border-radius:14px;font-weight:800;padding:10px;border:0}.bring-primary{background:#ea580c;color:white}.bring-secondary{background:#f1f5f9;color:#334155}.bring-green{background:#16a34a;color:#fff}
      .bring-note{background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:10px!important;color:#9a3412!important;margin-top:12px!important}
      .bring-listbox{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin:12px 0}.bring-listbox div{padding:5px 0;font-weight:700}
    `;
    document.head.appendChild(style);
  }

  function showChoiceDialog({mode, recipe, items, warnings = {}, onConfirm, onSkip}) {
    ensureStyles();
    document.querySelector('.bring-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'bring-overlay';
    const title = mode === 'add' ? 'Quins aliments vols afegir a la llista de la compra?' : 'Vols treure també aliments de la llista de la compra?';
    const description = mode === 'add'
      ? `Has afegit “${esc(recipe)}” al menú. Marca només el que vulguis reposar.`
      : `Has tret “${esc(recipe)}” del menú. Marca els productes que vulguis revisar a Bring.`;
    overlay.innerHTML = `<div class="bring-card" role="dialog" aria-modal="true"><h2>${title}</h2><p>${description}</p><div class="bring-list"></div>${mode === 'remove' ? '<p class="bring-note">Bring no permet que aquesta web esborri productes automàticament. Et prepararem la llista perquè la revisis.</p>' : ''}<div class="bring-actions"><button class="bring-btn bring-secondary" data-skip>Ara no</button><button class="bring-btn bring-primary" data-ok>${mode === 'add' ? 'Continuar' : 'Preparar per treure'}</button></div></div>`;
    const list = overlay.querySelector('.bring-list');
    if (mode === 'add' && !items.length) {
      const note = document.createElement('p');
      note.textContent='No hi ha ingredients detallats disponibles. Escriu els aliments, un per línia.';
      const entry=document.createElement('textarea');entry.setAttribute('aria-label','Aliments, un per línia');entry.style.cssText='width:100%;min-height:110px;border:1px solid #cbd5e1;padding:12px';
      const prepare=document.createElement('button');prepare.textContent='Mostrar caselles';prepare.className='bring-btn bring-secondary';
      prepare.onclick=()=>{const names=parseIngredients(entry.value.split(/\r?\n/).join('♦'));showChoiceDialog({mode,recipe,items:names,warnings,onConfirm,onSkip});};
      list.append(note,entry,prepare);
    }
    items.forEach(item => {
      const row = document.createElement('label');
      row.className = 'bring-item';
      row.innerHTML = `<input type="checkbox" value="${esc(item)}"><span>${esc(item)}${warnings[item] ? '<span class="bring-warning">⚠️ També el necessita una altra recepta del menú</span>' : ''}</span>`;
      list.appendChild(row);
    });
    overlay.querySelector('[data-skip]').onclick = () => { overlay.remove(); onSkip?.(); };
    overlay.querySelector('[data-ok]').onclick = () => {
      const selected = [...overlay.querySelectorAll('input:checked')].map(el => el.value);
      if (!selected.length) { overlay.remove(); onSkip?.(); return; }
      overlay.remove(); onConfirm?.(selected);
    };
    document.body.appendChild(overlay);
  }

  function showTransferDialog(recipe, items, action = 'add') {
    ensureStyles();
    document.querySelector('.bring-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'bring-overlay';
    const isAdd = action === 'add';
    overlay.innerHTML = `<div class="bring-card" role="dialog" aria-modal="true">
      <h2>${isAdd ? 'Llista preparada per a Bring' : 'Productes a revisar a Bring'}</h2>
      <p>${isAdd ? 'Importa els ingredients a Bring! i afegeix-los individualment a la llista des d’allà.' : 'Aquests productes encara NO s’han tret de Bring. Revisa’ls i elimina’ls manualment dins de Bring.'}</p>
      <div class="bring-listbox">${items.map(x => `<div>• ${esc(x)}</div>`).join('')}</div>
      ${isAdd ? '' : '<div class="bring-actions"><button class="bring-btn bring-green" data-open>🛒 Obrir Bring</button></div>'}
      <button class="bring-btn bring-secondary" style="width:100%;margin-top:10px" data-close>Tancar</button>
    </div>`;
    if(isAdd){
      const importButton=document.createElement('button');importButton.className='bring-btn bring-primary';importButton.style.width='100%';importButton.textContent='Importar ingredients a Bring!';
      const message=document.createElement('p');message.setAttribute('role','status');
      overlay.querySelector('.bring-listbox').after(importButton,message);
      importButton.onclick=async()=>{
        importButton.disabled=true;message.textContent='Preparant la importació…';
        const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
        try{
          const selected=items.slice(0,40).map(itemId=>({itemId:String(itemId).slice(0,200),stock:false}));
          const ref=db.ref('bring_exports').push();
          await ref.set({name:('Compra: '+recipe).slice(0,310),author:'Cuina de Pep',linkOutUrl:'https://ijacoj2024.github.io/cuina/',items:selected,ingredients:selected,enableQuantityChange:false,expiresAt:Date.now()+23*60*60*1000});
          const url='https://api.getbring.com/rest/bringrecipes/deeplink?source=web&url='+encodeURIComponent(ref.toString()+'.json');
          message.textContent='Completa la importació a Bring!. Encara no podem confirmar que s’hi hagin afegit.';
          const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent='Obrir importació a Bring!';message.append(link);
          if(tab)tab.location.href=url;importButton.hidden=true;
        }catch(error){if(tab)tab.close();message.textContent='No s’ha pogut preparar la importació. Torna-ho a provar.';}
        finally{importButton.disabled=false;}
      };
    }
    if (!isAdd) overlay.querySelector('[data-open]').onclick = () => {
      window.open('https://web.getbring.com', '_blank', 'noopener');
    };
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  }

  async function bestEffortFirebaseSave(day, meal, recipe, selected, extra) {
    try {
      await db.ref('bring_recipe_items').child(day).child(meal).child(safeKey(recipe)).set({recipe, items:selected, source:extra.source || '', rid:extra.rid || '', updatedAt:Date.now()});
    } catch (_) {}
  }

  async function getOtherUsage(items, current) {
    const result = Object.fromEntries(items.map(i => [i, false]));
    const today=new Date();const todayKey=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    const normalize=s=>String(s).trim().toLocaleLowerCase('ca');
    const mark=value=>items.forEach(i=>{if(normalize(i)===normalize(value))result[i]=true;});
    const local = localRead();
    Object.entries(local).forEach(([id, rec]) => {
      if (id === localId(current.day, current.meal, current.recipe)) return;
      const [day,meal]=id.split('|');
      if(day<todayKey)return;
      const scheduled=typeof allSelections!=='undefined'?allSelections?.[day]?.[meal]:null;
      if(!Array.isArray(scheduled)||!scheduled.includes(rec.recipe))return;
      (rec.items || []).forEach(mark);
    });
    try {
      const [metaSnap, selSnap] = await Promise.all([db.ref('bring_recipe_items').once('value'), db.ref('seleccions').once('value')]);
      const meta = metaSnap.val() || {}, selections = selSnap.val() || {};
      Object.entries(meta).forEach(([day, meals]) => Object.entries(meals || {}).forEach(([meal, recipes]) => Object.entries(recipes || {}).forEach(([key, rec]) => {
        if (day < todayKey || (day === current.day && meal === current.meal && rec.recipe === current.recipe)) return;
        const scheduled = selections?.[day]?.[meal];
        if (!Array.isArray(scheduled) || !scheduled.includes(rec.recipe)) return;
        (rec.items || []).forEach(mark);
      })));
    } catch (_) {}
    return result;
  }

  function askToAdd(day, meal, recipe, items, extra = {}) {
    const cleaned = [...new Set((items || []).map(v => String(v).trim()).filter(Boolean))];

    showChoiceDialog({mode:'add', recipe, items:cleaned, onConfirm: selected => {
      const record = {recipe, items:selected, source:extra.source || '', rid:extra.rid || '', updatedAt:Date.now()};
      localSave(day, meal, recipe, record);
      showTransferDialog(recipe, selected, 'add');
      bestEffortFirebaseSave(day, meal, recipe, selected, extra);
    }});
  }

  function hookImportedRecipe() {
    if (!pendingImport) return;
    const dialog = document.getElementById('menu-import'), form = document.getElementById('menu-import-form');
    if (!dialog || !form) return;
    let submitted = null;
    form.addEventListener('submit', () => {
      submitted = {day:document.getElementById('menu-import-date')?.value, meal:document.getElementById('menu-import-meal')?.value, recipe:document.getElementById('menu-import-name')?.value?.trim() || pendingImport.recipe};
    }, true);
    dialog.addEventListener('close', async () => {
      if (dialog.returnValue !== 'saved') return;
      if (!submitted?.day || !submitted?.meal || !submitted?.recipe) return;
      try {
        const snap = await db.ref('seleccions').child(submitted.day).child(submitted.meal).once('value');
        const arr = snap.val();
        if (!Array.isArray(arr) || !arr.includes(submitted.recipe)) return;
      } catch (_) { return; }
      const items = pendingImport.ingredients.length ? pendingImport.ingredients : [];
      askToAdd(submitted.day, submitted.meal, submitted.recipe, items, {source:pendingImport.source, rid:pendingImport.rid});
    }, {once:true});
  }

  function hookExistingWebAdditions() {
    const original = window.addAndClose;
    if (typeof original !== 'function' || original.__bringWrapped) return;
    const wrapped = function(day, meal, recipe, el) {
      let items = [];
      try {
        const found = typeof allAliments !== 'undefined' && Array.isArray(allAliments) ? allAliments.find(a => a && a.nom === recipe) : null;
        items = parseIngredientText(found?.ingredients || found?.ingredientes || '');
      } catch (_) {}
      
      original(day, meal, recipe, el);
      setTimeout(async () => {
        try {
          const snap = await db.ref('seleccions').child(day).child(meal).once('value');
          const arr = snap.val();
          if (Array.isArray(arr) && arr.includes(recipe)) askToAdd(day, meal, recipe, items, {source:'web'});
        } catch (_) {}
      }, 350);
    };
    wrapped.__bringWrapped = true;
    window.addAndClose = wrapped;
  }

  function hookMealRemoval() {
    const original = window.removePlat;
    if (typeof original !== 'function' || original.__bringWrapped) return;
    const wrapped = async function(day, meal, index) {
      let recipe = '';
      try {
        const snap = await db.ref('seleccions').child(day).child(meal).once('value');
        const arr = snap.val();
        if (Array.isArray(arr)) recipe = arr[index] || '';
      } catch (_) {}
      original(day, meal, index);
      if (!recipe) return;
      const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
      if(day<=today)return;
      setTimeout(async () => {
        try {
          const currentSnap = await db.ref('seleccions').child(day).child(meal).once('value');
          const current = currentSnap.val();
          if (Array.isArray(current) && current.includes(recipe)) return;
        } catch (_) { return; }
        let meta = localGet(day, meal, recipe);
        let metaRef = null;
        if (!meta) {
          try {
            metaRef = db.ref('bring_recipe_items').child(day).child(meal).child(safeKey(recipe));
            const snap = await metaRef.once('value');
            meta = snap.val();
          } catch (_) {}
        }
        if (!meta || !Array.isArray(meta.items) || !meta.items.length) return;
        const warnings = await getOtherUsage(meta.items, {day, meal, recipe});
        showChoiceDialog({mode:'remove', recipe, items:meta.items, warnings, onConfirm: selected => {
          showTransferDialog(recipe, selected, 'remove');
          localRemove(day, meal, recipe);
          if (metaRef) metaRef.remove().catch(() => {});
          else { try { db.ref('bring_recipe_items').child(day).child(meal).child(safeKey(recipe)).remove(); } catch (_) {} }
        }, onSkip: () => {
          localRemove(day, meal, recipe);
          try { db.ref('bring_recipe_items').child(day).child(meal).child(safeKey(recipe)).remove(); } catch (_) {}
        }});
      }, 350);
    };
    wrapped.__bringWrapped = true;
    window.removePlat = wrapped;
  }

  window.addEventListener('load', () => setTimeout(() => { hookImportedRecipe(); hookExistingWebAdditions(); hookMealRemoval(); }, 0));
})();