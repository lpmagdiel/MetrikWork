<script>
  let { data = [], labels = [], color = "#e3654e", maxValue = 100 } = $props();
</script>

<div class="chart-container">
  <div class="chart-bars">
    {#each data as value, i}
      <div class="bar-wrapper">
        <div class="bar-label">{value}</div>
        <div
          class="bar"
          style="height: {(value / maxValue) * 100}%; background: {color};"
        ></div>
        <div class="bar-name">{labels[i] || ""}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .chart-container {
    width: 100%;
    padding: 20px 0;
  }

  .chart-bars {
    display: flex;
    align-items: flex-end;
    justify-content: space-around;
    height: 200px;
    gap: 12px;
  }

  .bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
    gap: 8px;
  }

  .bar-label {
    font-size: 12px;
    font-weight: 700;
    color: #333;
    margin-bottom: 4px;
  }

  .bar {
    width: 100%;
    min-height: 4px;
    border-radius: 8px 8px 0 0;
    transition: height 0.3s ease;
  }

  .bar-name {
    font-size: 11px;
    color: #878787;
    text-align: center;
    margin-top: 8px;
  }
</style>
