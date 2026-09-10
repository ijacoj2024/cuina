(() => {
  'use strict';

  const capturedParams = new URLSearchParams(location.search);
  const pendingImport = capturedParams.has('recipe') ? {
    recipe: (capturedParams.get('recipe') || '').trim(),
    source: capturedParams.get('source') || '',
    rid: capturedParams.get('rid') || '',
    ingredients: parseIngredients(capturedParams.get('ingredients') || '')
  } : null;

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
    const title = mode === 'add' ? 'Quins aliments vols preparar per a Bring?' : 'Vols treure també aliments de la llista de la compra?';
    const description = mode === 'add'
      ? `Has afegit “${esc(recipe)}” al menú. Marca només el que vulguis reposar.`
      : `Has tret “${esc(recipe)}” del menú. Marca els productes que vulguis revisar a Bring.`;
    overlay.innerHTML = `<div class="bring-card" role="dialog" aria-modal="true"><h2>${title}</h2><p>${description}</p><div class="bring-list"></div>${mode === 'remove' ? '<p class="bring-note">Bring no permet que aquesta web esborri productes automàticament. Et prepararem la llista perquè la revisis.</p>' : ''}<div class="bring-actions"><button class="bring-btn bring-secondary" data-skip>Ara no</button><button class="bring-btn bring-primary" data-ok>${mode === 'add' ? 'Continuar' : 'Preparar per treure'}</button></div></div>`;
    const list = overlay.querySelector('.bring-list');
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

  async function showTransferDialog(recipe, items, action = 'add') {
    ensureStyles();
    document.querySelector('.bring-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'bring-overlay';
    const isAdd = action === 'add';
    overlay.innerHTML = `<div class="bring-card" role="dialog" aria-modal="true">
      <h2>${isAdd ? 'Llista preparada per a Bring' : 'Productes a revisar a Bring'}</h2>
      <p>${isAdd ? 'Aquests productes encara NO s’han afegit a Bring. Copia’ls i després obre Bring per enganxar-los.' : 'Aquests productes encara NO s’han tret de Bring. Copia la llista i revisa’ls dins de Bring.'}</p>
      <div class="bring-listbox">${items.map(x => `<div>• ${esc(x)}</div>`).join('')}</div>
      <div class="bring-actions"><button class="bring-btn bring-secondary" data-copy>📋 Copiar llista</button><button class="bring-btn bring-green" data-open>🛒 Obrir Bring</button></div>
      <button class="bring-btn bring-secondary" style="width:100%;margin-top:10px" data-close>Tancar</button>
    </div>`;
    const text = items.join('\n');
    const copyBtn = overlay.querySelector('[data-copy]');
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '✓ Llista copiada';
      } catch (_) {
        copyBtn.textContent = 'Mantén premut i copia manualment';
      }
    };
    overlay.querySelector('[data-open]').onclick = async () => {
      try { await navigator.clipboard.writeText(text); copyBtn.textContent = '✓ Llista copiada'; } catch (_) {}
      window.open('https://web.getbring.com', '_blank', 'noopener');
    };
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  }

  async function getOtherUsage(items, current) {
    const result = Object.fromEntries(items.map(i => [i, false]));
    try {
      const [metaSnap, selSnap] = await Promise.all([db.ref('bring_recipe_items').once('value'), db.ref('seleccions').once('value')]);
      const meta = metaSnap.val() || {}, selections = selSnap.val() || {};
      Object.entries(meta).forEach(([day, meals]) => Object.entries(meals || {}).forEach(([meal, recipes]) => Object.entries(recipes || {}).forEach(([key, rec]) => {
        if (day === current.day && meal === current.meal && key === current.key) return;
        const scheduled = selections?.[day]?.[meal];
        if (!Array.isArray(scheduled) || !scheduled.includes(rec.recipe)) return;
        (rec.items || []).forEach(item => { if (item in result) result[item] = true; });
      })));
    } catch (_) {}
    return result;
  }

  function askToAdd(day, meal, recipe, items, extra = {}) {
    const cleaned = [...new Set((items || []).map(v => String(v).trim()).filter(Boolean))];
    if (!cleaned.length) return;
    const key = safeKey(recipe);
    showChoiceDialog({mode:'add', recipe, items:cleaned, onConfirm: async selected => {
      await db.ref('bring_recipe_items').child(day).child(meal).child(key).set({recipe, items:selected, source:extra.source || '', rid:extra.rid || '', updatedAt:Date.now()});
      await showTransferDialog(recipe, selected, 'add');
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
      if (!submitted?.day || !submitted?.meal || !submitted?.recipe) return;
      try {
        const snap = await db.ref('seleccions').child(submitted.day).child(submitted.meal).once('value');
        const arr = snap.val();
        if (!Array.isArray(arr) || !arr.includes(submitted.recipe)) return;
      } catch (_) { return; }
      const items = pendingImport.ingredients.length ? pendingImport.ingredients : deriveIngredientsFromTitle(submitted.recipe);
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
        items = parseIngredientText(found?.ingredients || '');
      } catch (_) {}
      if (!items.length) items = deriveIngredientsFromTitle(recipe);
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
      const key = safeKey(recipe);
      setTimeout(async () => {
        try {
          const currentSnap = await db.ref('seleccions').child(day).child(meal).once('value');
          const current = currentSnap.val();
          if (Array.isArray(current) && current.includes(recipe)) return;
          const metaRef = db.ref('bring_recipe_items').child(day).child(meal).child(key);
          const snap = await metaRef.once('value');
          const meta = snap.val();
          if (!meta || !Array.isArray(meta.items) || !meta.items.length) return;
          const warnings = await getOtherUsage(meta.items, {day, meal, key});
          showChoiceDialog({mode:'remove', recipe, items:meta.items, warnings, onConfirm: async selected => {
            await showTransferDialog(recipe, selected, 'remove');
            await metaRef.remove();
          }, onSkip: () => metaRef.remove()});
        } catch (_) {}
      }, 350);
    };
    wrapped.__bringWrapped = true;
    window.removePlat = wrapped;
  }

  window.addEventListener('load', () => setTimeout(() => { hookImportedRecipe(); hookExistingWebAdditions(); hookMealRemoval(); }, 0));
})();
