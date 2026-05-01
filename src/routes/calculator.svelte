<script>
  import {
    Delete,
    Share2,
    Plus,
    Clock,
    DollarSign,
    TimerReset,
  } from "lucide-svelte";

  let hourlyRate = 8;
  let typingTime = "0";
  let accumulatedMinutes = 0; // total accumulated minutes
  let estimatedPay = 0;

  // Parse typingTime string to minutes
  function parseToMinutes(timeStr) {
    if (timeStr.includes(":")) {
      const parts = timeStr.split(":");
      const h = parseInt(parts[0]) || 0;
      const m = parseInt(parts[1]) || 0;
      return h * 60 + m;
    }
    return (parseInt(timeStr) || 0) * 60;
  }

  // Format total minutes as "Xh Ym"
  function formatTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  $: totalHoursDecimal = accumulatedMinutes / 60;
  $: estimatedPay = totalHoursDecimal * hourlyRate;

  function addTime() {
    const mins = parseToMinutes(typingTime);
    if (mins > 0) {
      accumulatedMinutes += mins;
    }
    typingTime = "0";
  }

  function resetTotal() {
    accumulatedMinutes = 0;
    typingTime = "0";
  }

  function handleKeypad(key) {
    if (key === "backspace") {
      if (typingTime.length > 1) {
        typingTime = typingTime.slice(0, -1);
      } else {
        typingTime = "0";
      }
      return;
    }

    if (typingTime === "0" && key !== ":") {
      typingTime = key.toString();
    } else {
      if (key === ":" && typingTime.includes(":")) return;
      if (typingTime.includes(":")) {
        const parts = typingTime.split(":");
        if (parts[1].length >= 2) return;
      }
      typingTime += key.toString();
    }
  }

  async function shareCalculation() {
    const text = `Calculadora de Trabajo:\nTarifa: $${hourlyRate}/hr\nTiempo: ${formatTime(accumulatedMinutes)}\nTotal: $${estimatedPay.toFixed(2)}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Cálculo de Trabajo", text });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert("Cálculo copiado al portapapeles");
      } catch (err) {
        alert("No se pudo compartir");
      }
    }
  }
</script>

<div class="page-container">
  <!-- Header -->
  <div class="header">
    <div class="title-group">
      <h1>Calculadora</h1>
    </div>
    <button class="reset-btn" onclick={resetTotal} title="Reiniciar">
      <TimerReset size={18} />
    </button>
  </div>

  <!-- Rate input -->
  <div class="rate-card">
    <span class="rate-label">Tarifa por hora</span>
    <div class="rate-input-row">
      <span class="currency-symbol">$</span>
      <input type="number" bind:value={hourlyRate} min="0" />
      <span class="rate-unit">/ hr</span>
    </div>
  </div>

  <!-- Typing display -->
  <div class="display-card">
    <div class="display-label">
      <Clock size={13} />
      <span>Digitando</span>
    </div>
    <div class="display-time">{typingTime}</div>
  </div>

  <!-- Results -->
  <div class="results-row">
    <div class="result-card total-time">
      <div class="result-label">
        <Clock size={13} />
        <span>Tiempo Total</span>
      </div>
      <div class="result-value">{formatTime(accumulatedMinutes)}</div>
    </div>
    <div class="result-card total-pay">
      <div class="result-label">
        <DollarSign size={13} />
        <span>Pago Est.</span>
      </div>
      <div class="result-value pay-value">$ {estimatedPay.toFixed(2)}</div>
    </div>
  </div>

  <!-- Keypad -->
  <div class="keypad">
    <button class="key" onclick={() => handleKeypad(1)}>1</button>
    <button class="key" onclick={() => handleKeypad(2)}>2</button>
    <button class="key" onclick={() => handleKeypad(3)}>3</button>
    <button class="key" onclick={() => handleKeypad(4)}>4</button>
    <button class="key" onclick={() => handleKeypad(5)}>5</button>
    <button class="key" onclick={() => handleKeypad(6)}>6</button>
    <button class="key" onclick={() => handleKeypad(7)}>7</button>
    <button class="key" onclick={() => handleKeypad(8)}>8</button>
    <button class="key" onclick={() => handleKeypad(9)}>9</button>
    <button class="key colon-key" onclick={() => handleKeypad(":")}>:</button>
    <button class="key" onclick={() => handleKeypad(0)}>0</button>
    <button class="key delete-key" onclick={() => handleKeypad("backspace")}>
      <Delete size={20} />
    </button>
  </div>

  <!-- Actions -->
  <div class="actions">
    <button class="add-btn" onclick={addTime}>
      <Plus size={22} />
      <span>Sumar</span>
    </button>
    <button class="share-btn" onclick={shareCalculation}>
      <Share2 size={18} />
      <span>Compartir</span>
    </button>
  </div>
</div>

<style>
  .page-container {
    padding: 24px 20px var(--bottom-nav-clearance);
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
    overflow-y: auto;
    background: var(--bg-page);
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h1 {
    font-size: 22px;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
  }

  .reset-btn {
    background: var(--bg-card);
    border: none;
    border-radius: 12px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    cursor: pointer;
    box-shadow: var(--shadow-card);
    transition: all 0.2s;
  }

  .reset-btn:hover {
    color: var(--accent-ink);
    background: var(--accent-color);
  }

  /* Rate card */
  .rate-card {
    background: var(--bg-card);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    box-shadow: var(--shadow-card);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .rate-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-secondary);
  }

  .rate-input-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .currency-symbol {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .rate-input-row input {
    border: none;
    background: transparent;
    font-size: 22px;
    font-weight: 800;
    color: var(--text-primary);
    width: 80px;
    outline: none;
    text-align: right;
    padding: 0;
  }

  .rate-unit {
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  /* Display card (typing) */
  .display-card {
    background: var(--bg-card);
    border-radius: var(--radius-md);
    padding: 12px 16px;
    box-shadow: var(--shadow-card);
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-left: 4px solid var(--accent-color);
  }

  .display-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-secondary);
  }

  .display-time {
    font-size: 28px;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: 1px;
  }

  /* Results row */
  .results-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .result-card {
    background: var(--bg-card);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: var(--shadow-card);
    border: 1px solid var(--border-color);
  }

  .result-card.total-pay {
    background: var(--accent-color);
    box-shadow: var(--shadow-card);
    border-color: transparent;
  }

  .result-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
  }

  .result-value {
    font-size: 22px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1;
  }

  /* Keypad */
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    min-height: 50%;
  }

  .key {
    background: var(--bg-card);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    cursor: pointer;
    box-shadow: var(--shadow-card);
    transition:
      transform 0.08s,
      box-shadow 0.08s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    min-height: 44px;
  }

  .key:active {
    transform: translateY(3px);
    box-shadow: none;
  }

  .colon-key {
    font-size: 26px;
    font-weight: 900;
    color: var(--text-primary);
  }

  .delete-key {
    background: var(--bg-input);
    color: var(--text-primary);
    box-shadow: var(--shadow-card);
  }

  .delete-key:active {
    box-shadow: none;
  }

  /* Actions */
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .add-btn {
    height: 50px;
    border-radius: 14px;
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow-button);
    transition: all 0.2s;
  }

  .add-btn:active {
    transform: scale(0.97);
  }

  .share-btn {
    height: 50px;
    border-radius: 14px;
    background: var(--bg-card);
    color: var(--text-secondary);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--shadow-card);
    transition: all 0.2s;
  }

  .share-btn:active {
    transform: scale(0.97);
  }

  .share-btn:hover {
    box-shadow: var(--shadow-soft);
  }
</style>
