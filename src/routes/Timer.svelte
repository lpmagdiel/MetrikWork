<script>
  import { onDestroy } from "svelte";
  import { Play, Pause, RefreshCcw, Clock } from "lucide-svelte";

  let elapsed = 0;
  let isRunning = false;
  let intervalId;

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    intervalId = setInterval(() => {
      elapsed += 1;
    }, 1000);
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(intervalId);
    intervalId = null;
  }

  function resetTimer() {
    pauseTimer();
    elapsed = 0;
  }

  function toggleTimer() {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });
</script>

<div class="timer-page">
  <header class="timer-header">
    <div>
      <p class="overline">Control de horas</p>
      <h1>Horas trabajadas</h1>
    </div>
    <div class="status-pill">
      <Clock size={18} />
      <span>{isRunning ? "En curso" : "Pausado"}</span>
    </div>
  </header>

  <section class="timer-card">
    <div class="timer-ring" class:running={isRunning}>
      <div class="timer-display">{formatTime(elapsed)}</div>
    </div>
    <p class="timer-copy">
      Inicia, pausa y reinicia tu contador de horas sin necesidad de almacenar datos. Ideal para medir sesiones rápidas y mantener el flujo de trabajo.
    </p>

    <div class="timer-actions">
      <button class="primary-btn" on:click={toggleTimer}>
        {#if isRunning}
          <Pause size={18} />
          Pausar
        {:else}
          <Play size={18} />
          Iniciar
        {/if}
      </button>
      <button class="secondary-btn" on:click={resetTimer} disabled={elapsed === 0 && !isRunning}>
        <RefreshCcw size={18} />
        Reiniciar
      </button>
    </div>
  </section>
</div>

<style>
  .timer-page {
    padding: 24px 24px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    min-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
    background-color: var(--bg-page);
  }

  .timer-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }

  .overline {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 10px;
  }

  h1 {
    font-size: 2rem;
    margin: 0;
    line-height: 1.1;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--bg-accent-subtle);
    color: var(--text-primary);
    border: 1px solid rgba(0, 0, 0, 0.06);
    font-weight: 600;
    box-shadow: var(--shadow-soft);
  }
  .timer-display {
    font-size: clamp(2.8rem, 5vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.05em;
    color: var(--text-primary);
    text-align: center;
    z-index: 2;
  }
  .timer-card {
    display: grid;
    place-items: center;
    gap: 20px;
    padding: 28px 20px;
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
    border: 1px solid var(--border-color);
  }

  .timer-ring {
    width: min(100%, 320px);
    max-width: 320px;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: radial-gradient(circle at top, rgba(167, 243, 208, 0.18), rgba(255, 255, 255, 0.8) 45%, var(--bg-card) 65%);
    border: 1px solid var(--accent-color);
    box-shadow: inset 0 10px 30px rgba(0, 0, 0, 0.04);
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .timer-ring::before {
    content: "";
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent, var(--accent-color), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
    animation: none;
  }

  .timer-ring::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at center, rgba(167, 243, 208, 0.2), transparent 50%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .timer-ring.running {
    box-shadow: inset 0 10px 30px rgba(0, 0, 0, 0.04), 0 0 20px rgba(167, 243, 208, 0.3);
  }

  .timer-ring.running::before {
    opacity: 1;
    animation: spin-border 2s linear infinite;
  }

  .timer-ring.running::after {
    opacity: 1;
    animation: breathe 1.5s ease-in-out infinite;
  }

  @keyframes spin-border {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes breathe {
    0%, 100% {
      transform: scale(0.95);
      opacity: 0.4;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.8;
    }
  }

  .timer-display {
    font-size: clamp(2.8rem, 5vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.05em;
    color: var(--text-primary);
    text-align: center;
  }

  .timer-copy {
    max-width: 560px;
    color: var(--text-secondary);
    text-align: center;
    line-height: 1.7;
    margin: 0;
  }

  .timer-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 14px;
    width: 100%;
  }

  .primary-btn,
  .secondary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 160px;
    padding: 16px 20px;
    border-radius: 16px;
    border: none;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
    font-weight: 700;
  }

  .primary-btn {
    background: var(--accent-color);
    color: var(--accent-strong);
    box-shadow: var(--shadow-button);
  }

  .secondary-btn {
    background: var(--bg-input);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .primary-btn:hover,
  .secondary-btn:hover {
    transform: translateY(-1px);
  }

  .secondary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }

  .summary-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .summary-card {
    padding: 20px;
    border-radius: var(--radius-md);
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-card);
  }

  .summary-card span {
    display: block;
    color: var(--text-muted);
    margin-bottom: 10px;
    font-size: 0.94rem;
  }

  .summary-card strong {
    font-size: 1.35rem;
    display: block;
    color: var(--text-primary);
  }

  @media (max-width: 520px) {
    .timer-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .summary-row {
      grid-template-columns: 1fr;
    }
  }
</style>