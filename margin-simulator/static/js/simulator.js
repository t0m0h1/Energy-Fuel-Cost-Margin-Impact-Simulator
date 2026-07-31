/* ==========================================================================
   Energy & Fuel Cost Margin Impact Simulator
   Pure client-side calculation engine + Chart.js rendering.
   Everything recalculates in real time on input — no server round trip.
   ========================================================================== */

   (() => {
    'use strict';
  
    // ------------------------------------------------------------------
    // 1. PASS-THROUGH ASSUMPTIONS
    // How much of an "oil price shock" (%) actually lands on each cost
    // line. Fuel/Fleet is ~100% oil-linked; Logistics is heavily but not
    // fully exposed (carriers absorb some, surcharge the rest); grid
    // Electricity has only partial oil/gas-linked generation exposure.
    // Tune these to match a specific business's real exposure.
    // ------------------------------------------------------------------
    const PASS_THROUGH = {
      electricity: 0.30,
      fuel: 1.00,
      logistics: 0.70,
    };
  
    // ------------------------------------------------------------------
    // 2. DOM REFERENCES
    // ------------------------------------------------------------------
    const els = {
      revenue: document.getElementById('revenue'),
      electricity: document.getElementById('electricity'),
      fuel: document.getElementById('fuel'),
      logistics: document.getElementById('logistics'),
  
      shockSlider: document.getElementById('shockSlider'),
      shockReadout: document.getElementById('shockReadout'),
      shockPresets: document.getElementById('shockPresets'),
  
      statusDot: document.getElementById('statusDot'),
      statusLabel: document.getElementById('statusLabel'),
  
      scenarioName: document.getElementById('scenarioName'),
      saveScenarioBtn: document.getElementById('saveScenarioBtn'),
      scenarioList: document.getElementById('scenarioList'),
      scenarioMsg: document.getElementById('scenarioMsg'),
  
      kpiPriceIncrease: document.getElementById('kpiPriceIncrease'),
      kpiBaselineMargin: document.getElementById('kpiBaselineMargin'),
      kpiShockedMargin: document.getElementById('kpiShockedMargin'),
      kpiCompression: document.getElementById('kpiCompression'),
  
      gaugeBaseline: document.getElementById('gaugeBaseline'),
      gaugeShocked: document.getElementById('gaugeShocked'),
      gaugeMarker: document.getElementById('gaugeMarker'),
      gaugeAbsDollars: document.getElementById('gaugeAbsDollars'),
    };
  
    // ------------------------------------------------------------------
    // 3. CALCULATION ENGINE
    // Takes raw inputs + a shock percentage (e.g. 25 for +25%) and
    // returns every derived figure the UI needs.
    // ------------------------------------------------------------------
    function calculate(inputs, shockPct) {
      const shock = shockPct / 100; // e.g. 25 -> 0.25
  
      const revenue = Math.max(inputs.revenue, 0);
  
      // Baseline (no shock) cost lines
      const baseline = {
        electricity: inputs.electricity,
        fuel: inputs.fuel,
        logistics: inputs.logistics,
      };
      const baselineTotalExpense = baseline.electricity + baseline.fuel + baseline.logistics;
      const baselineMargin = revenue - baselineTotalExpense;
      const baselineMarginPct = revenue > 0 ? baselineMargin / revenue : 0;
  
      // Shocked cost lines, each scaled by its own pass-through ratio
      const shocked = {
        electricity: baseline.electricity * (1 + shock * PASS_THROUGH.electricity),
        fuel: baseline.fuel * (1 + shock * PASS_THROUGH.fuel),
        logistics: baseline.logistics * (1 + shock * PASS_THROUGH.logistics),
      };
      const shockedTotalExpense = shocked.electricity + shocked.fuel + shocked.logistics;
      const shockedMargin = revenue - shockedTotalExpense;
      const shockedMarginPct = revenue > 0 ? shockedMargin / revenue : 0;
  
      // Margin compression, in percentage points
      const compressionPts = (baselineMarginPct - shockedMarginPct) * 100;
      const compressionDollars = baselineMargin - shockedMargin;
  
      // Recommended price increase: the revenue lift required so the
      // POST-shock margin percentage returns to the baseline margin
      // percentage (i.e. fully protects the margin ratio, not just
      // absolute dollars).
      //   R' * (1 - baselineMarginPct) = shockedTotalExpense
      //   R' = shockedTotalExpense / (1 - baselineMarginPct)
      let recommendedIncreasePct = 0;
      if (revenue > 0 && baselineMarginPct < 1) {
        const requiredRevenue = shockedTotalExpense / (1 - baselineMarginPct);
        recommendedIncreasePct = ((requiredRevenue - revenue) / revenue) * 100;
      }
  
      return {
        revenue,
        baseline,
        baselineTotalExpense,
        baselineMargin,
        baselineMarginPct,
        shocked,
        shockedTotalExpense,
        shockedMargin,
        shockedMarginPct,
        compressionPts,
        compressionDollars,
        recommendedIncreasePct: Math.max(recommendedIncreasePct, 0),
      };
    }
  
    // ------------------------------------------------------------------
    // 4. CHART.JS SETUP
    // Grouped bars for the three cost lines (baseline vs shocked) plus
    // a secondary-axis line tracing net margin % baseline -> shocked.
    // ------------------------------------------------------------------
    const ctx = document.getElementById('marginChart').getContext('2d');
  
    const chart = new Chart(ctx, {
      data: {
        labels: ['Electricity', 'Fuel / Fleet', 'Logistics'],
        datasets: [
          {
            type: 'bar',
            label: 'Baseline Expense',
            data: [0, 0, 0],
            backgroundColor: 'rgba(53, 199, 166, 0.55)', // teal
            borderRadius: 4,
            borderSkipped: false,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'bar',
            label: 'Shocked Expense',
            data: [0, 0, 0],
            backgroundColor: 'rgba(227, 168, 59, 0.85)', // amber
            borderRadius: 4,
            borderSkipped: false,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Net Margin %',
            data: [null, null, null], // placeholder; real values set as a flat overlay below
            borderColor: '#E5484D',
            backgroundColor: '#E5484D',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#E5484D',
            yAxisID: 'y1',
            order: 1,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false }, // custom legend rendered in HTML header
          tooltip: {
            backgroundColor: '#161B26',
            borderColor: '#232B3A',
            borderWidth: 1,
            titleColor: '#E8ECF1',
            bodyColor: '#E8ECF1',
            titleFont: { family: 'IBM Plex Mono' },
            bodyFont: { family: 'IBM Plex Mono' },
            padding: 10,
            callbacks: {
              label: (item) => {
                if (item.dataset.yAxisID === 'y1') {
                  return `${item.dataset.label}: ${item.raw === null ? '—' : item.raw.toFixed(2) + '%'}`;
                }
                return `${item.dataset.label}: $${Number(item.raw).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#7C8798', font: { family: 'IBM Plex Mono', size: 11 } },
            grid: { color: '#1A2029' },
          },
          y: {
            position: 'left',
            ticks: {
              color: '#7C8798',
              font: { family: 'IBM Plex Mono', size: 10 },
              callback: (v) => '$' + Number(v).toLocaleString(),
            },
            grid: { color: '#1A2029' },
            title: { display: true, text: 'Expense ($/mo)', color: '#7C8798', font: { family: 'Inter', size: 11 } },
          },
          y1: {
            position: 'right',
            ticks: {
              color: '#E5484D',
              font: { family: 'IBM Plex Mono', size: 10 },
              callback: (v) => v + '%',
            },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Net Margin %', color: '#E5484D', font: { family: 'Inter', size: 11 } },
          },
        },
      },
    });
  
    // ------------------------------------------------------------------
    // 5. RENDER — pushes calculation results into the DOM + chart
    // ------------------------------------------------------------------
    function readInputs() {
      return {
        revenue: parseFloat(els.revenue.value) || 0,
        electricity: parseFloat(els.electricity.value) || 0,
        fuel: parseFloat(els.fuel.value) || 0,
        logistics: parseFloat(els.logistics.value) || 0,
      };
    }
  
    function formatPct(n, decimals = 2) {
      return `${n.toFixed(decimals)}%`;
    }
  
    function formatUSD(n) {
      return `$${Math.round(n).toLocaleString()}`;
    }
  
    function render() {
      const inputs = readInputs();
      const shockPct = parseFloat(els.shockSlider.value) || 0;
      const r = calculate(inputs, shockPct);
  
      // --- Shock readout + status pill ---
      els.shockReadout.textContent = `+${shockPct}%`;
      if (shockPct === 0) {
        els.statusLabel.textContent = 'BASELINE';
        els.statusDot.style.backgroundColor = '#35C7A6';
        els.statusDot.style.boxShadow = '0 0 8px 2px rgba(53,199,166,0.6)';
      } else if (shockPct < 50) {
        els.statusLabel.textContent = `SHOCK +${shockPct}%`;
        els.statusDot.style.backgroundColor = '#E3A83B';
        els.statusDot.style.boxShadow = '0 0 8px 2px rgba(227,168,59,0.6)';
      } else {
        els.statusLabel.textContent = `SEVERE SHOCK +${shockPct}%`;
        els.statusDot.style.backgroundColor = '#E5484D';
        els.statusDot.style.boxShadow = '0 0 8px 2px rgba(229,72,77,0.6)';
      }
  
      // --- Sync preset buttons' active state ---
      [...els.shockPresets.querySelectorAll('.shock-btn')].forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.shock) === shockPct);
      });
  
      // --- KPI cards ---
      els.kpiPriceIncrease.textContent = formatPct(r.recommendedIncreasePct);
      els.kpiBaselineMargin.textContent = formatPct(r.baselineMarginPct * 100);
      els.kpiShockedMargin.textContent = formatPct(r.shockedMarginPct * 100);
      els.kpiShockedMargin.className =
        'font-mono text-2xl font-semibold mt-2 ' + (r.shockedMarginPct < r.baselineMarginPct ? 'text-red' : 'text-teal');
      els.kpiCompression.textContent = `${r.compressionPts.toFixed(2)} pts`;
  
      // --- Margin compression gauge (signature element) ---
      // Scale: 0-100% margin mapped across the full gauge width.
      const clampPct = (v) => Math.min(Math.max(v, 0), 100);
      const baselinePctClamped = clampPct(r.baselineMarginPct * 100);
      const shockedPctClamped = clampPct(r.shockedMarginPct * 100);
      els.gaugeBaseline.style.width = `${baselinePctClamped}%`;
      els.gaugeShocked.style.width = `${shockedPctClamped}%`;
      els.gaugeMarker.style.left = `${baselinePctClamped}%`;
      els.gaugeAbsDollars.textContent = `${formatUSD(r.compressionDollars)} / mo at risk`;
  
      // --- Chart update ---
      chart.data.datasets[0].data = [r.baseline.electricity, r.baseline.fuel, r.baseline.logistics];
      chart.data.datasets[1].data = [r.shocked.electricity, r.shocked.fuel, r.shocked.logistics];
      // Overlay net margin % as a flat reference line across the 3 categories:
      // first point = baseline margin %, last point = shocked margin % (visual trend)
      chart.data.datasets[2].data = [
        r.baselineMarginPct * 100,
        null,
        r.shockedMarginPct * 100,
      ];
      chart.update('none'); // 'none' = skip animation for real-time slider dragging
    }
  
    // ------------------------------------------------------------------
    // 6. EVENT WIRING
    // ------------------------------------------------------------------
    [els.revenue, els.electricity, els.fuel, els.logistics].forEach((input) => {
      input.addEventListener('input', render);
    });
  
    els.shockSlider.addEventListener('input', render);
  
    els.shockPresets.addEventListener('click', (e) => {
      const btn = e.target.closest('.shock-btn');
      if (!btn) return;
      els.shockSlider.value = btn.dataset.shock;
      render();
    });
  
    // ------------------------------------------------------------------
    // 7. SAVED SCENARIOS — persisted server-side via /api/scenarios
    // ------------------------------------------------------------------
    function showScenarioMsg(text, isError = false) {
      els.scenarioMsg.textContent = text;
      els.scenarioMsg.className = `text-[11px] mb-3 ${isError ? 'text-red' : 'text-teal'}`;
      setTimeout(() => els.scenarioMsg.classList.add('hidden'), 2500);
    }
  
    async function loadScenarios() {
      try {
        const res = await fetch('/api/scenarios');
        if (!res.ok) throw new Error('Failed to load scenarios');
        const scenarios = await res.json();
        renderScenarioList(scenarios);
      } catch (err) {
        els.scenarioList.innerHTML = `<li class="text-[11px] text-red">Couldn't load saved scenarios.</li>`;
      }
    }
  
    function renderScenarioList(scenarios) {
      if (!scenarios.length) {
        els.scenarioList.innerHTML = `<li class="text-[11px] text-muted">No saved scenarios yet.</li>`;
        return;
      }
  
      els.scenarioList.innerHTML = scenarios
        .map(
          (s) => `
          <li class="flex items-center justify-between gap-2 bg-raised border border-hairline rounded-md px-3 py-2">
            <button data-load="${s.id}" class="text-left flex-1 min-w-0">
              <span class="block text-sm text-ink truncate">${escapeHtml(s.name)}</span>
              <span class="block text-[10px] font-mono text-muted">
                Rev $${Math.round(s.revenue).toLocaleString()} · Shock +${s.shock_pct}%
              </span>
            </button>
            <button data-delete="${s.id}"
              class="text-muted hover:text-red text-xs font-mono px-1.5 shrink-0" title="Delete">
              ✕
            </button>
          </li>`
        )
        .join('');
    }
  
    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  
    async function saveScenario() {
      const name = els.scenarioName.value.trim() || 'Untitled scenario';
      const inputs = readInputs();
      const shockPct = parseFloat(els.shockSlider.value) || 0;
  
      try {
        const res = await fetch('/api/scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            revenue: inputs.revenue,
            electricity: inputs.electricity,
            fuel: inputs.fuel,
            logistics: inputs.logistics,
            shock_pct: shockPct,
          }),
        });
        if (!res.ok) throw new Error('Save failed');
        els.scenarioName.value = '';
        showScenarioMsg('Scenario saved.');
        loadScenarios();
      } catch (err) {
        showScenarioMsg("Couldn't save scenario — try again.", true);
      }
    }
  
    async function deleteScenario(id) {
      try {
        const res = await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        loadScenarios();
      } catch (err) {
        showScenarioMsg("Couldn't delete scenario.", true);
      }
    }
  
    function applyScenario(s) {
      els.revenue.value = s.revenue;
      els.electricity.value = s.electricity;
      els.fuel.value = s.fuel;
      els.logistics.value = s.logistics;
      els.shockSlider.value = s.shock_pct;
      render();
    }
  
    els.saveScenarioBtn.addEventListener('click', saveScenario);
  
    els.scenarioList.addEventListener('click', (e) => {
      const loadBtn = e.target.closest('[data-load]');
      const deleteBtn = e.target.closest('[data-delete]');
  
      if (loadBtn) {
        const id = Number(loadBtn.dataset.load);
        fetch('/api/scenarios')
          .then((r) => r.json())
          .then((scenarios) => {
            const match = scenarios.find((s) => s.id === id);
            if (match) applyScenario(match);
          });
      }
  
      if (deleteBtn) {
        deleteScenario(Number(deleteBtn.dataset.delete));
      }
    });
  
    // Initial paint + load any previously saved scenarios
    render();
    loadScenarios();
  })();