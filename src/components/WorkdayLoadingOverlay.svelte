<script>
  import { LoaderCircle, MapPin, CheckCircle2 } from "lucide-svelte";

  const {
    phase = "idle",
    visible = false,
    label = ""
  } = $props();

  const steps = [
    { id: "location", label: "Obteniendo ubicación", icon: MapPin },
    { id: "registering", label: "Registrando jornada", icon: CheckCircle2 }
  ];

  let currentStepIndex = $derived.by(() => {
    if (phase === "location") return 0;
    if (phase === "registering") return 1;
    return -1;
  });

  let visibleOverlay = $derived(Boolean(visible) && phase !== "idle" && phase !== "done");
</script>

{#if visibleOverlay}
  <div class="workday-loading-overlay" role="status" aria-live="polite" aria-busy="true">
    <div class="backdrop"></div>
    <div class="card">
      <div class="spinner" aria-hidden="true">
        <LoaderCircle size={36} />
      </div>
      <h2 class="title">{label || steps[currentStepIndex]?.label || "Procesando"}</h2>
      <p class="hint">Por favor espera unos segundos</p>
      <ol class="steps">
        {#each steps as step, index (step.id)}
          {@const Icon = step.icon}
          <li class="step" class:active={index === currentStepIndex} class:done={index < currentStepIndex}>
            <span class="step-icon" aria-hidden="true">
              <Icon size={16} />
            </span>
            <span class="step-label">{step.label}</span>
          </li>
        {/each}
      </ol>
    </div>
  </div>
{/if}

<style>
  .workday-loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 16px;
    pointer-events: auto;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: overlay-fade 0.18s ease-out;
  }

  .card {
    position: relative;
    background: var(--bg-surface, #ffffff);
    color: var(--text-primary, #0f172a);
    border-radius: 18px;
    padding: 28px 26px;
    width: 100%;
    max-width: 360px;
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.22);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
    animation: overlay-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .spinner {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.12);
    color: rgb(99, 102, 241);
    animation: spinner-pulse 1.4s ease-in-out infinite;
  }

  .spinner :global(svg) {
    animation: spinner-rotate 1s linear infinite;
  }

  .title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary, #64748b);
  }

  .steps {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--bg-input, #f1f5f9);
    color: var(--text-secondary, #64748b);
    font-size: 13px;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .step-icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.18);
    color: #64748b;
    flex-shrink: 0;
  }

  .step.active {
    background: rgba(99, 102, 241, 0.14);
    color: var(--text-primary, #0f172a);
    font-weight: 600;
  }

  .step.active .step-icon {
    background: rgb(99, 102, 241);
    color: #ffffff;
    animation: spinner-rotate 1.2s linear infinite;
  }

  .step.done {
    color: var(--text-primary, #0f172a);
  }

  .step.done .step-icon {
    background: rgb(34, 197, 94);
    color: #ffffff;
  }

  @keyframes overlay-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes overlay-pop {
    from { opacity: 0; transform: translateY(8px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes spinner-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes spinner-pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.32); }
    50% { transform: scale(1.04); box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .card,
    .spinner,
    .step.active .step-icon {
      animation: none;
    }
  }
</style>
