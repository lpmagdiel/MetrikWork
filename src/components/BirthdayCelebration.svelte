<script>
  import { Cake, PartyPopper, Sparkles, X } from "lucide-svelte";

  let { show = $bindable(false), name = "", onClose = () => {} } = $props();

  const confetti = Array.from({ length: 34 }, (_, index) => ({
    id: index,
    x: 4 + ((index * 17) % 92),
    delay: (index % 9) * 0.16,
    duration: 3.6 + (index % 5) * 0.42,
    size: 7 + (index % 4) * 3,
    spin: 120 + (index % 7) * 42,
    tone: index % 5,
  }));

  const firstName = $derived(
    String(name || "").trim().split(/\s+/)[0] || "hoy",
  );

  function close() {
    show = false;
    onClose();
  }
</script>

{#if show}
  <div class="birthday-overlay" role="dialog" aria-modal="true" aria-labelledby="birthday-title">
    <div class="confetti-field" aria-hidden="true">
      {#each confetti as piece (piece.id)}
        <span
          class={`confetti tone-${piece.tone}`}
          style={`--x: ${piece.x}%; --delay: ${piece.delay}s; --duration: ${piece.duration}s; --size: ${piece.size}px; --spin: ${piece.spin}deg;`}
        ></span>
      {/each}
    </div>

    <section class="birthday-panel">
      <button type="button" class="birthday-close" aria-label="Cerrar felicitación" onclick={close}>
        <X size={19} />
      </button>

      <div class="birthday-icon-stack" aria-hidden="true">
        <span class="sparkle sparkle-left"><Sparkles size={26} /></span>
        <span class="cake-ring">
          <Cake size={60} strokeWidth={1.65} />
        </span>
        <span class="sparkle sparkle-right"><PartyPopper size={28} /></span>
      </div>

      <p class="birthday-eyebrow">Hoy celebramos contigo</p>
      <h2 id="birthday-title">Feliz cumpleaños, {firstName}</h2>
      <p class="birthday-message">
        Que este día venga lleno de calma, cariño y buenos momentos. Gracias por formar parte de MetricWork.
      </p>

      <button type="button" class="birthday-action" onclick={close}>
        <Sparkles size={18} />
        <span>Gracias</span>
      </button>
    </section>
  </div>
{/if}

<style>
  .birthday-overlay {
    position: fixed;
    inset: 0;
    z-index: 1400;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      linear-gradient(140deg, rgba(15, 23, 42, 0.7), rgba(30, 41, 59, 0.38)),
      color-mix(in srgb, var(--accent-color) 12%, transparent);
    overflow: hidden;
  }

  .confetti-field {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .confetti {
    position: absolute;
    top: -24px;
    left: var(--x);
    width: var(--size);
    height: calc(var(--size) * 1.55);
    border-radius: 3px;
    animation: confetti-fall var(--duration) cubic-bezier(0.33, 0, 0.67, 1) var(--delay) infinite;
    opacity: 0.95;
  }

  .tone-0 {
    background: #f97316;
  }

  .tone-1 {
    background: #22c55e;
  }

  .tone-2 {
    background: #38bdf8;
  }

  .tone-3 {
    background: #facc15;
  }

  .tone-4 {
    background: #ec4899;
  }

  .birthday-panel {
    position: relative;
    width: min(100%, 430px);
    min-height: 420px;
    padding: 38px 28px 28px;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.72);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.86)),
      var(--bg-card);
    box-shadow: 0 28px 70px rgba(15, 23, 42, 0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    text-align: center;
    color: #111827;
    animation: birthday-arrive 0.72s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .birthday-panel::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      linear-gradient(110deg, transparent 0 22%, rgba(255, 255, 255, 0.54) 34%, transparent 48% 100%),
      linear-gradient(180deg, rgba(252, 211, 77, 0.2), transparent 40%);
    animation: birthday-shine 3.2s ease-in-out infinite;
    pointer-events: none;
  }

  :global(:root.dark) .birthday-panel {
    border-color: rgba(255, 255, 255, 0.16);
    background:
      linear-gradient(180deg, rgba(17, 24, 39, 0.94), rgba(15, 23, 42, 0.9)),
      var(--bg-card);
    color: #f8fafc;
  }

  .birthday-close {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 2;
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 15px;
    background: rgba(17, 24, 39, 0.08);
    color: currentColor;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  :global(:root.dark) .birthday-close {
    background: rgba(255, 255, 255, 0.1);
  }

  .birthday-icon-stack,
  .birthday-eyebrow,
  .birthday-panel h2,
  .birthday-message,
  .birthday-action {
    position: relative;
    z-index: 1;
  }

  .birthday-icon-stack {
    width: 154px;
    height: 126px;
    display: grid;
    place-items: center;
  }

  .cake-ring {
    width: 108px;
    height: 108px;
    border-radius: 36px;
    display: grid;
    place-items: center;
    color: #9f1239;
    background:
      linear-gradient(135deg, rgba(251, 113, 133, 0.3), rgba(253, 224, 71, 0.34)),
      #fff7ed;
    box-shadow: 0 20px 40px rgba(190, 18, 60, 0.2);
    animation: cake-float 2.8s ease-in-out infinite;
  }

  :global(:root.dark) .cake-ring {
    color: #fecdd3;
    background:
      linear-gradient(135deg, rgba(251, 113, 133, 0.25), rgba(253, 224, 71, 0.18)),
      rgba(255, 255, 255, 0.08);
  }

  .sparkle {
    position: absolute;
    color: #f59e0b;
    animation: sparkle-pop 1.7s ease-in-out infinite;
  }

  .sparkle-left {
    left: 4px;
    top: 18px;
  }

  .sparkle-right {
    right: 2px;
    bottom: 18px;
    animation-delay: 0.38s;
  }

  .birthday-eyebrow {
    margin: 0;
    color: #be123c;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  :global(:root.dark) .birthday-eyebrow {
    color: #fda4af;
  }

  .birthday-panel h2 {
    margin: 0;
    font-size: clamp(30px, 9vw, 44px);
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
  }

  .birthday-message {
    max-width: 330px;
    margin: 0;
    color: rgba(17, 24, 39, 0.68);
    font-size: 15px;
    line-height: 1.55;
    font-weight: 650;
  }

  :global(:root.dark) .birthday-message {
    color: rgba(248, 250, 252, 0.72);
  }

  .birthday-action {
    min-height: 46px;
    margin-top: 6px;
    border: none;
    border-radius: 17px;
    padding: 0 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    background: #111827;
    color: #ffffff;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 14px 30px rgba(17, 24, 39, 0.24);
  }

  :global(:root.dark) .birthday-action {
    background: #ffffff;
    color: #111827;
  }

  @keyframes confetti-fall {
    0% {
      transform: translate3d(-12px, -24px, 0) rotate(0deg);
    }
    100% {
      transform: translate3d(18px, 110vh, 0) rotate(var(--spin));
    }
  }

  @keyframes birthday-arrive {
    0% {
      opacity: 0;
      transform: translateY(24px) scale(0.94);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes birthday-shine {
    0%,
    44% {
      transform: translateX(-120%);
    }
    100% {
      transform: translateX(120%);
    }
  }

  @keyframes cake-float {
    0%,
    100% {
      transform: translateY(0) rotate(-2deg);
    }
    50% {
      transform: translateY(-8px) rotate(2deg);
    }
  }

  @keyframes sparkle-pop {
    0%,
    100% {
      opacity: 0.45;
      transform: scale(0.86) rotate(-8deg);
    }
    50% {
      opacity: 1;
      transform: scale(1.16) rotate(8deg);
    }
  }

  @media (max-width: 520px) {
    .birthday-overlay {
      padding: 16px;
    }

    .birthday-panel {
      min-height: 390px;
      padding: 36px 22px 24px;
      border-radius: 24px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .confetti,
    .birthday-panel,
    .birthday-panel::before,
    .cake-ring,
    .sparkle {
      animation: none;
    }
  }
</style>
