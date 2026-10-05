<script>
  let {
    data = [],
    size = 180,
    thickness = 26,
    showLegend = true,
    valueFormatter = null,
  } = $props();

  let total = $derived(
    data.reduce((sum, item) => sum + (Number(item?.value) || 0), 0),
  );

  let segments = $derived.by(() => {
    if (total <= 0) return [];
    let cumulative = 0;
    return data.map((item) => {
      const value = Number(item?.value) || 0;
      const fraction = value / total;
      const start = cumulative;
      cumulative += fraction;
      const end = cumulative;
      return {
        ...item,
        value,
        fraction,
        start,
        end,
        percentage: fraction * 100,
      };
    });
  });

  const center = $derived(size / 2);
  const radius = $derived((size - thickness) / 2 - 2);
  const innerRadius = $derived(radius - thickness);

  function polarToCartesian(cx, cy, r, angle) {
    const radians = (angle - 90) * (Math.PI / 180);
    return {
      x: cx + r * Math.cos(radians),
      y: cy + r * Math.sin(radians),
    };
  }

  function arcPath(startAngle, endAngle) {
    if (endAngle - startAngle >= 359.999) {
      const top = polarToCartesian(center, center, radius, 0);
      const bottom = polarToCartesian(center, center, radius, 180);
      const left = polarToCartesian(center, center, radius, 90);
      const right = polarToCartesian(center, center, radius, 270);
      return [
        `M ${top.x} ${top.y}`,
        `A ${radius} ${radius} 0 0 1 ${right.x} ${right.y}`,
        `A ${radius} ${radius} 0 0 1 ${bottom.x} ${bottom.y}`,
        `A ${radius} ${radius} 0 0 1 ${left.x} ${left.y}`,
        `A ${radius} ${radius} 0 0 1 ${top.x} ${top.y}`,
        `Z`,
      ].join(" ");
    }
    const start = polarToCartesian(center, center, radius, endAngle);
    const end = polarToCartesian(center, center, radius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`,
      `L ${center} ${center}`,
      `Z`,
    ].join(" ");
  }

  function displayValue(value) {
    if (typeof valueFormatter === "function") return valueFormatter(value);
    return new Intl.NumberFormat("es-ES").format(value);
  }
</script>

<div class="pie-chart" class:no-legend={!showLegend}>
  <div class="pie-canvas">
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gráfico de pastel">
      {#if total <= 0 || !segments.length}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--bg-input)"
          stroke-width={thickness}
        />
      {:else}
        {#each segments as segment}
          {#if segment.fraction > 0}
            <path
              d={arcPath(segment.start * 360, segment.end * 360)}
              fill={segment.color || "var(--accent-color)"}
              stroke="var(--bg-card)"
              stroke-width="2"
            >
              <title>{segment.label}: {displayValue(segment.value)} ({segment.percentage.toFixed(1)}%)</title>
            </path>
          {/if}
        {/each}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="var(--bg-card)"
        />
        <text
          x={center}
          y={center - 6}
          text-anchor="middle"
          class="pie-total"
        >
          {displayValue(total)}
        </text>
        <text
          x={center}
          y={center + 14}
          text-anchor="middle"
          class="pie-subtotal"
        >
          Total
        </text>
      {/if}
    </svg>
  </div>

  {#if showLegend}
    <ul class="pie-legend">
      {#each segments as segment (segment.label)}
        <li>
          <span class="legend-swatch" style={`background: ${segment.color || "var(--accent-color)"};`}></span>
          <span class="legend-label">{segment.label}</span>
          <strong>{segment.percentage.toFixed(1)}%</strong>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .pie-chart {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .pie-chart.no-legend {
    justify-content: center;
  }

  .pie-canvas {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pie-canvas :global(svg) {
    width: 180px;
    height: 180px;
    max-width: 100%;
  }

  .pie-total {
    font-size: 14px;
    font-weight: 800;
    fill: var(--text-primary);
  }

  .pie-subtotal {
    font-size: 10px;
    font-weight: 600;
    fill: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pie-legend {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
    min-width: 0;
    flex: 1 1 160px;
  }

  .pie-legend li {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-primary);
  }

  .legend-swatch {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    display: block;
  }

  .legend-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pie-legend strong {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 700;
  }
</style>