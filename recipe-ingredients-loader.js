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

  function deriveIngredientsFromTitle(title) {
    let text = normalizeRecipeName(title)
      .replace(/\b(expres|express|base|suau|rapid|rapida|facil|guisat|guisada|estofat|estofada|al vapor|a la catalana|batch|simultani|simultanis|intens|versio)\b/g, ' ')
      .replace(/\b(crema|sopa|brou|amanida|truita|pure|samfaina|pisto)\b/g, ' ')
      .replace(/\b(amb|i|mes|de|del|dels|les|la|el|al|a les)\b/g, ',')
      .replace(/\s+/g, ' ');
    return [...new Set(text.split(',').map(x => x.trim()).filter(x => x.length > 2))].slice(0, 10);
  }

  function getFallbackIngredients(recipeName) {
    const map = window.CUINA_RECIPE_INGREDIENTS || {};
    const mapped = [...(map[normalizeRecipeName(recipeName)] || [])];
    const derived = deriveIngredientsFromTitle(recipeName);
    const isGeneric = mapped.some(x => /^(Hortalisses indicades|Verdures indicades|Ingredients indicats)/i.test(x));
    if (!mapped.length) return derived;
    if (!isGeneric) return mapped;
    const usefulMapped = mapped.filter(x => !/^(Hortalisses indicades|Verdures indicades|Ingredients indicats)/i.test(x));
    return [...new Set([...derived, ...usefulMapped])];
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