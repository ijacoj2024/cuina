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
    return [...new Set(raw.split('♦').map(v => v.trim()).filter(Boolean))];
  }

  function deriveIngredientsFromTitle(title) {
    let text = String(title || '').toLowerCase()
      .replace(/^\d+\.\s*/, '')
      .replace(/\b(exprés|express|base|suau|ràpid(?:a)?|fàcil|guisat(?:s|des)?|estofat(?:s|des)?|al vapor|a la catalana)\b/g, ' ')
      .replace(/\b(crema|sopa|arròs|amanida|truita|puré|estofat|guisat|saltat|escalivada)\s+(de|d'|amb)?\s*/g, '')
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

  function escapeHtml(value) {
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
      .bring-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.bring-btn{min-height:48px;border-radius:14px;font-weight:800;padding:10px;border:0}.bring-primary{background:#ea580c;color:white}.bring-secondary{background:#f1f5f9;color:#334155}
      .bring-note{background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:10px!important;color:#9a3412!important;margin-top:12px!important}
    `;
    document.head.appendChild(style);
  }

  async function getOtherUsage(items, current) {
    const result = Object.fromEntries(items.map(i => [i, false]));
    try {
      const [metaSnap, selSnap] = await Promise.all([
        db.ref('bring_recipe_items').once('value'),
        db.ref('seleccions').once('value')
      ]);
      const meta = metaSnap.val() || {};
      const selections = selSnap.val() || {};
      Object.entries(meta).forEach(([day, meals]) => {
        Object.entries(meals || {}).forEach(([meal, recipes]) => {
          Object.entries(recipes || {}).forEach(([key, rec]) => {
            if (day === current.day && meal === current.meal && key === current.key) return;
            const scheduled = selections?.[day]?.[meal];
            if (!Array.isArray(scheduled) || !scheduled.includes(rec.recipe)) return;
            (rec.items || []).forEach(item => { if (item in result) result[item] = true; });
          });
        });
      });
    } catch (_) {}
    return result;
  }

  function showChoiceDialog({mode, recipe, items, warnings = {}, onConfirm, onSkip}) {
    ensureStyles();
    document.querySelector('.bring-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'bring-overlay';
    const title = mode === 'add' ? 'Quins aliments vols afegir a la llista de la compra?' : 'Vols treure també aliments de la llista de la compra?';
    const description = mode === 'add'
      ? `Has afegit “${escapeHtml(recipe)}” al menú. Marca només el que vulguis reposar.`
      : `Has tret “${escapeHtml(recipe)}” del menú. Marca els productes que vulguis treure de Bring!`;
    overlay.innerHTML = `<div class="bring-card" role="dialog" aria-modal="true"><h2>${title}</h2><p>${description}</p><div class="bring-list"></div>${mode === 'remove' ? '<p class="bring-note">Per seguretat, no esborrem res automàticament de Bring!. T’obrirem Bring! amb la llista dels productes seleccionats perquè els treguis.</p>' : ''}<div class="bring-actions"><button class="bring-btn bring-secondary" data-skip>Ara no</button><button class="bring-btn bring-primary" data-ok>${mode === 'add' ? 'Afegir a Bring!' : 'Obrir Bring i treure’ls'}</button></div></div>`;
    const list = overlay.querySelector('.bring-list');
    items.forEach((item, idx) => {
      const row = document.createElement('label');
      row.className = 'bring-item';
      row.innerHTML = `<input type="checkbox" value="${escapeHtml(item)}"><span>${escapeHtml(item)}${warnings[item] ? '<span class="bring-warning">⚠️ També el necessita una altra recepta del menú</span>' : ''}</span>`;
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

  async function createTemporaryExport(action, recipe, items) {
    const ref = db.ref('bring_exports').push();
    const now = Date.now();
    await ref.set({ action, recipe, items, createdAt: now, expiresAt: now + 23 * 60 * 60 * 1000 });
    return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}bring-export.html?token=${encodeURIComponent(ref.key)}`;
  }

  async function sendToBring(recipe, items) {
    const exportUrl = await createTemporaryExport('add', recipe, items);
    const text = items.join('\n');
    if (navigator.share) {
      try {
        await navigator.share({ title: `Compra: ${recipe}`, text, url: exportUrl });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    window.open('https://web.getbring.com', '_blank', 'noopener');
    if (typeof showToast === 'function') showToast('Llista copiada. Enganxa-la a Bring!');
  }

  async function openBringForRemoval(recipe, items) {
    await createTemporaryExport('remove', recipe, items);
    const text = items.join('\n');
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    window.open('https://web.getbring.com', '_blank', 'noopener');
    if (typeof showToast === 'function') showToast('Productes a treure copiats. Revisa’ls a Bring!');
  }

  function hookImportedRecipe() {
    if (!pendingImport) return;
    const dialog = document.getElementById('menu-import');
    const form = document.getElementById('menu-import-form');
    if (!dialog || !form) return;
    let submitted = null;
    form.addEventListener('submit', () => {
      submitted = {
        day: document.getElementById('menu-import-date')?.value,
        meal: document.getElementById('menu-import-meal')?.value,
        recipe: document.getElementById('menu-import-name')?.value?.trim() || pendingImport.recipe
      };
    }, true);
    dialog.addEventListener('close', async () => {
      if (!submitted?.day || !submitted?.meal || !submitted?.recipe) return;
      try {
        const snap = await db.ref('seleccions').child(submitted.day).child(submitted.meal).once('value');
        const arr = snap.val();
        if (!Array.isArray(arr) || !arr.includes(submitted.recipe)) return;
      } catch (_) { return; }
      const items = pendingImport.ingredients.length ? pendingImport.ingredients : deriveIngredientsFromTitle(submitted.recipe);
      if (!items.length) return;
      const key = safeKey(submitted.recipe);
      showChoiceDialog({
        mode: 'add', recipe: submitted.recipe, items,
        onConfirm: async selected => {
          await db.ref('bring_recipe_items').child(submitted.day).child(submitted.meal).child(key).set({recipe: submitted.recipe, items: selected, source: pendingImport.source, rid: pendingImport.rid, updatedAt: Date.now()});
          await sendToBring(submitted.recipe, selected);
        }
      });
    }, {once:true});
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
      try {
        const metaRef = db.ref('bring_recipe_items').child(day).child(meal).child(key);
        const snap = await metaRef.once('value');
        const meta = snap.val();
        if (!meta || !Array.isArray(meta.items) || !meta.items.length) return;
        const warnings = await getOtherUsage(meta.items, {day, meal, key});
        showChoiceDialog({
          mode: 'remove', recipe, items: meta.items, warnings,
          onConfirm: async selected => { await openBringForRemoval(recipe, selected); await metaRef.remove(); },
          onSkip: () => metaRef.remove()
        });
      } catch (_) {}
    };
    wrapped.__bringWrapped = true;
    window.removePlat = wrapped;
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      hookImportedRecipe();
      hookMealRemoval();
    }, 0);
  });
})();
