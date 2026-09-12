(() => {
  'use strict';

  function norm(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function terms(value) {
    return norm(value).split(/\s+/).filter(x => x.length >= 3);
  }

  function recipeIngredients(recipe) {
    const direct = String(recipe?.ingredients || recipe?.ingredientes || '').trim();
    if (direct) return direct;
    try {
      const fallback = typeof window.cuinaFallbackIngredients === 'function'
        ? window.cuinaFallbackIngredients(recipe?.nom || '')
        : [];
      return Array.isArray(fallback) ? fallback.join(' ') : '';
    } catch (_) { return ''; }
  }

  function scoreRecipe(recipe, expiryName) {
    const wanted = terms(expiryName);
    if (!wanted.length) return 0;
    const hay = norm((recipe?.nom || '') + ' ' + recipeIngredients(recipe));
    let score = 0;
    wanted.forEach(t => {
      if (hay.includes(t)) score += 2;
      else if (t.endsWith('s') && hay.includes(t.slice(0, -1))) score += 1;
      else if (!t.endsWith('s') && hay.includes(t + 's')) score += 1;
    });
    return score;
  }

  function matchingRecipes(expiryName) {
    try { if (typeof window.cuinaHydrateIngredients === 'function') window.cuinaHydrateIngredients(); } catch (_) {}
    if (typeof allAliments === 'undefined' || !Array.isArray(allAliments)) return [];
    return allAliments
      .map(r => ({r, s: scoreRecipe(r, expiryName)}))
      .filter(x => x.s > 0)
      .sort((a,b) => b.s - a.s || String(a.r.nom || '').localeCompare(String(b.r.nom || '')))
      .slice(0, 20)
      .map(x => x.r);
  }

  window.openCaducitatRecipes = function(expiryName) {
    const list = matchingRecipes(expiryName);
    const safeTitle = String(expiryName || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const body = list.length
      ? list.map(r => {
          const id = String(r.id || '').replace(/'/g, "\\'");
          const nom = String(r.nom || 'Sense nom').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
          return `<button onclick="openEditById('${id}')" class="w-full text-left p-4 bg-slate-50 rounded-2xl border font-bold">🍽️ ${nom}</button>`;
        }).join('')
      : `<div class="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm font-bold text-amber-800">No he trobat cap recepta que contingui “${safeTitle}”.</div>`;

    if (typeof showModal !== 'function') return;
    showModal(`
      <div class="p-6 space-y-4">
        <div class="flex justify-between items-start gap-3">
          <div>
            <div class="text-[10px] font-black text-orange-500 uppercase">Caducitat</div>
            <h2 class="text-xl font-black">Què puc fer amb ${safeTitle}?</h2>
            <p class="text-xs text-slate-500 mt-1">Receptes de la teva app que utilitzen aquest ingredient.</p>
          </div>
          <button onclick="closeModal()" class="text-slate-400 text-2xl">×</button>
        </div>
        <div class="space-y-2">${body}</div>
      </div>
    `);
  };

  function enhanceCalendar() {
    const alerts = document.querySelectorAll('.caducitat-alert');
    alerts.forEach(alert => {
      if (alert.dataset.recipeSearchReady === '1') return;
      const label = alert.querySelector('span');
      if (!label) return;
      const name = label.textContent.replace(/^⚠️\s*/, '').trim();
      label.style.cursor = 'pointer';
      label.title = 'Veure receptes per aprofitar aquest aliment';
      label.onclick = ev => { ev.stopPropagation(); window.openCaducitatRecipes(name); };
      alert.dataset.recipeSearchReady = '1';
    });
  }

  function enhanceCadList() {
    const grid = document.getElementById('cad-list-grid');
    if (!grid) return;
    [...grid.children].forEach(card => {
      if (card.dataset.recipeSearchReady === '1') return;
      const nameNode = card.querySelector('.recipe-card-text');
      if (!nameNode) return;
      const name = nameNode.textContent.trim();
      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-1';
      const btn = document.createElement('button');
      btn.className = 'bg-orange-50 text-orange-700 font-black text-[10px] px-3 py-2 rounded-xl border border-orange-100';
      btn.textContent = '🍽️ RECEPTES';
      btn.onclick = ev => { ev.stopPropagation(); window.openCaducitatRecipes(name); };
      const deleteBtn = [...card.querySelectorAll('button')].find(b => /ESBORRAR/i.test(b.textContent || ''));
      if (deleteBtn) {
        deleteBtn.parentNode?.insertBefore(actions, deleteBtn);
        actions.appendChild(btn);
        actions.appendChild(deleteBtn);
      } else {
        card.appendChild(btn);
      }
      card.dataset.recipeSearchReady = '1';
    });
  }

  function enhance() {
    try { enhanceCalendar(); enhanceCadList(); } catch (_) {}
  }

  const observer = new MutationObserver(() => enhance());
  window.addEventListener('load', () => {
    enhance();
    observer.observe(document.body, {childList:true, subtree:true});
  });
})();