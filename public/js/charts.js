/* ==========================================================================
   Control de Gastos — charts.js
   Gráficos de torta por categoría (Chart.js) y su leyenda. Las instancias viven en `charts` y se destruyen antes de recrearse.
   ========================================================================== */

// Instancias activas de Chart.js, indexadas por id de <canvas>. Se destruyen
// y recrean en cada render para evitar fugas de memoria / gráficos duplicados.
const charts = {};

// Convierte un color '#rrggbb' o 'hsl(h, s%, l%)' (los dos formatos que puede
// devolver colorForCategory) a su equivalente rgba/hsla con la opacidad dada.
// Se usa para "apagar" las categorías no seleccionadas en la torta.
function colorWithAlpha(color, alpha) {
  if (!color) return color;
  if (color[0] === '#') {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const m = color.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i);
  if (m) return `hsla(${m[1]}, ${m[2]}%, ${m[3]}%, ${alpha})`;
  return color;
}

function catLegendRow(cat, amount, total, selectedCat) {
  const color = colorForCategory(cat);
  const icon = iconForCategory(cat);
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  const isActive = selectedCat && selectedCat !== 'all' && selectedCat === cat;
  return `
    <div class="cat-legend-row cat-legend-row-clickable${isActive ? ' active' : ''}" data-cat="${escapeHtml(cat)}">
      <span class="cat-legend-name"><span class="cat-dot" style="background:${color}"></span><span class="cat-emoji">${icon}</span>${escapeHtml(cat)}</span>
      <span class="cat-legend-meta">
        <span class="cat-legend-pct">${pct}%</span>
        <span class="cat-legend-amount" data-amount="${amount}">${fmtMoneyPriv(amount)}</span>
      </span>
    </div>`;
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    charts[id] = null;
  }
}

function renderCategoryPie(canvasId, entries, selectedCat, onToggle) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = entries.map(([cat]) => cat || 'Sin categoría');
  const data = entries.map(([, amount]) => amount);
  const baseColors = entries.map(([cat]) => colorForCategory(cat));
  const total = data.reduce((s, v) => s + v, 0);
  const hasSelection = !!selectedCat && selectedCat !== 'all';

  const colors = baseColors.map((c, i) => (!hasSelection || labels[i] === selectedCat) ? c : colorWithAlpha(c, 0.25));
  const offsets = labels.map((l) => (hasSelection && l === selectedCat) ? 14 : 0);

  // Si el chart ya existe y los datos (categorías/montos) no cambiaron, solo estamos
  // cambiando la selección: actualizamos colores/offset en el chart existente sin
  // destruirlo ni recrearlo, para evitar que la animación de entrada se repita cada
  // vez que se filtra por categoría. Solo se destruye/recrea cuando cambian los datos
  // reales (cambio de mes, nuevos gastos, etc.).
  const existing = charts[canvasId];
  const shapeKey = labels.join('|') + '::' + data.join(',');
  if (existing && existing._catShapeKey === shapeKey) {
    existing.data.datasets[0].backgroundColor = colors;
    existing.data.datasets[0].offset = offsets;
    existing.options.onClick = (evt, elements) => {
      if (!elements.length || !onToggle) return;
      onToggle(labels[elements[0].index]);
    };
    existing.update('none');
    return;
  }

  destroyChart(canvasId);

  charts[canvasId] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: '#171b22', borderWidth: 2, offset: offsets }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length || !onToggle) return;
        onToggle(labels[elements[0].index]);
      },
      onHover: (evt, elements) => {
        if (evt.native && evt.native.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          footerFont: { size: 11, weight: 'normal' },
          footerColor: '#8b93a1',
          footerMarginTop: 4,
          callbacks: {
            // Línea 1 (con el cuadrito de color que Chart.js dibuja junto al body): nombre.
            title: () => [],
            label: (ctx) => ctx.label,
            // Línea 2: monto.
            afterLabel: (ctx) => fmtMoneyPriv(ctx.parsed),
            // Línea 3 (footer): porcentaje del total.
            footer: (items) => {
              const item = items[0];
              if (!item) return '';
              const pct = total > 0 ? Math.round((item.parsed / total) * 100) : 0;
              return `${pct}% del total`;
            }
          }
        }
      }
    }
  });
  charts[canvasId]._catShapeKey = shapeKey;
}

// otrosBreakdown: lista opcional [[categoriaChica, monto], ...] de las
// categorías plegadas dentro de "Otros" (ver groupSmallCategories). Cuando
// "Otros" está seleccionada, se muestra un desglose chico con el % que
// representa cada una dentro de "Otros" — como un sibling del row, no un
// hijo, para que un click ahí no dispare el onToggle del row (que la
// deseleccionaría).
function renderCategorySection(prefix, entries, selectedCat, onToggle, otrosBreakdown) {
  const wrap = document.getElementById(prefix + 'ChartWrap');
  const legend = document.getElementById(prefix + 'Categorias');
  const empty = document.getElementById(prefix + 'CatEmpty');
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!entries.length) {
    if (wrap) wrap.classList.add('hidden');
    if (legend) legend.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    destroyChart(prefix + 'PieChart');
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');
  if (legend) {
    legend.innerHTML = entries.map(([cat, amount]) => {
      const row = catLegendRow(cat, amount, total, selectedCat);
      if (cat === 'Otros' && selectedCat === 'Otros') {
        // % sobre el total general (mismo denominador que el resto de la
        // leyenda), no sobre el subtotal de "Otros" — para que sea
        // comparable con el % que ya se ve en las otras filas.
        return row + otrosBreakdownHtml(otrosBreakdown, total);
      }
      return row;
    }).join('');
    legend.querySelectorAll('[data-cat]').forEach((el) => {
      el.addEventListener('click', () => onToggle && onToggle(el.dataset.cat));
    });
  }
  renderCategoryPie(prefix + 'PieChart', entries, selectedCat, onToggle);
}

function otrosBreakdownHtml(otrosBreakdown, grandTotal) {
  if (!otrosBreakdown || !otrosBreakdown.length) return '';
  const rows = otrosBreakdown
    .slice()
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => {
      const pct = grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0;
      return `
        <div class="cat-otros-sub-row">
          <span class="cat-otros-sub-name">${iconForCategory(cat)} ${escapeHtml(cat)}</span>
          <span class="cat-otros-sub-meta">${pct}% · ${fmtMoneyPriv(amount)}</span>
        </div>`;
    }).join('');
  return `<div class="cat-otros-breakdown">${rows}</div>`;
}
