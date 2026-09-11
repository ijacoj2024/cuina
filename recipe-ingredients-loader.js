(() => {
  'use strict';

  function normalizeRecipeName(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/^\s*\d+\.\s*/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function getFallbackIngredients(recipeName) {
    const map = window.CUINA_RECIPE_INGREDIENTS || {};
    return map[normalizeRecipeName(recipeName)] || [];
  }

  function hydrateIngredients() {
    if (typeof allAliments === 'undefined' || !Array.isArray(allAliments) || !allAliments.length) return 0;
    let changed = 0;
    allAliments.forEach(item => {
      if (!item || !item.nom) return;
      const current = String(item.ingredients || item.ingredientes || '').trim();
      if (current) return;
      const fallback = getFallbackIngredients(item.nom);
      if (!fallback.length) return;
      item.ingredients = fallback.join('\n');
      changed++;
    });
    return changed;
  }

  window.cuinaFallbackIngredients = getFallbackIngredients;
  window.cuinaHydrateIngredients = hydrateIngredients;

  // Les receptes arriben de Firebase de manera asíncrona. Durant els primers
  // segons completem en memòria els ingredients que falten a partir del
  // receptari de Google Sheets, sense sobreescriure Firebase.
  let tries = 0;
  const timer = setInterval(() => {
    hydrateIngredients();
    tries++;
    if (tries >= 80) clearInterval(timer);
  }, 250);
  window.addEventListener('load', hydrateIngredients);
})();