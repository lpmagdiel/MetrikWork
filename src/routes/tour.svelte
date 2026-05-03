<script>
  import { onMount } from "svelte";
  import { fly, fade, scale } from "svelte/transition";
  import { 
    Calendar, 
    CheckSquare, 
    Users, 
    DollarSign, 
    ArrowRight, 
    X,
    ChevronLeft,
    Sparkles
  } from "lucide-svelte";
  import { navigateTo } from "../router";

  let currentStep = 0;
  let progress = 0;

  const steps = [
    {
      title: "¡Bienvenido a MetricWork!",
      description: "La herramienta para organizar tu trabajo de forma eficiente.",
      icon: Sparkles,
      color: "var(--accent-color)"
    },
    {
      title: "Domina tu Calendario",
      description: "Organiza tus días sin esfuerzo. Solo toca una fecha para añadir eventos y recordatorios.",
      icon: Calendar,
      color: "#e0f2fe", // Blueish
      feature: "calendar"
    },
    {
      title: "Gestiona tus Tareas",
      description: "Crea listas de tareas y hazles seguimiento. ¡Nada se te escapará!",
      icon: CheckSquare,
      color: "#fef3c7", // Amber
      feature: "tasks"
    },
    {
      title: "Crea tus Equipos",
      description: "Invita a colaboradores y organiza el trabajo en grupo de manera sencilla.",
      icon: Users,
      color: "#f3e8ff", // Purple
      feature: "teams"
    },
    {
      title: "Precios y Jornadas",
      description: "Asigna precios por jornada y horas a cada miembro para un control total de costos.",
      icon: DollarSign,
      color: "#bbf7d0", // Mint
      feature: "payments"
    },
    {
      title: "¡Estás Listo!",
      description: "Ya conoces lo básico. Ahora es tu turno de empezar a crear con MetricWork.",
      icon: Sparkles,
      color: "var(--accent-color)",
      isLast: true
    }
  ];

  $: progress = ((currentStep + 1) / steps.length) * 100;

  function next() {
    if (currentStep < steps.length - 1) {
      currentStep++;
    } else {
      // Exit tour
      navigateTo('/');
    }
  }

  function back() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  function close() {
    window.location.href = "/home";
  }
</script>

<div class="tour-page">
  <!-- Progress Header -->
  <header class="tour-header">
    <button class="icon-btn close-btn" on:click={close}>
      <X size={24} />
    </button>
    <div class="progress-container">
      <div class="progress-bar" style="width: {progress}%"></div>
    </div>
    <div class="step-counter">
      {currentStep + 1}/{steps.length}
    </div>
  </header>

  <main class="tour-content">
    {#key currentStep}
      <div 
        class="step-view" 
        in:fly={{ y: 20, duration: 400, delay: 200 }} 
        out:fade={{ duration: 200 }}
      >
        <div class="mascot-container">
          {#if steps[currentStep].image}
            <img src={steps[currentStep].image} alt="Mascot" class="mascot-img" />
          {:else}
            <div class="feature-preview" style="background: {steps[currentStep].color}">
              <svelte:component this={steps[currentStep].icon} size={80} strokeWidth={1.5} />
            </div>
          {/if}
          
          <div class="speech-bubble">
             <h2>{steps[currentStep].title}</h2>
             <p>{steps[currentStep].description}</p>
          </div>
        </div>

        <div class="visual-explanation">
          {#if steps[currentStep].feature === 'calendar'}
            <div class="mock-ui calendar-mock" in:scale={{duration: 500, start: 0.9}}>
              <div class="mock-header">Mayo 2024</div>
              <div class="mock-grid">
                {#each Array(7) as _, i}
                  <div class="mock-day {i === 3 ? 'active' : ''}">
                    {i + 10}
                    {#if i === 3}
                      <span class="dot"></span>
                    {/if}
                  </div>
                {/each}
              </div>
              <div class="hint">Toca un día para añadir +</div>
            </div>
          {:else if steps[currentStep].feature === 'tasks'}
             <div class="mock-ui task-mock" in:scale={{duration: 500, start: 0.9}}>
                <div class="mock-task">
                  <div class="checkbox checked"></div>
                  <span>Diseñar UI Tutorial</span>
                </div>
                <div class="mock-task">
                  <div class="checkbox"></div>
                  <span>Implementar lógica</span>
                </div>
                <div class="mock-task">
                  <div class="checkbox"></div>
                  <span>Revisar colores</span>
                </div>
             </div>
          {:else if steps[currentStep].feature === 'teams'}
             <div class="mock-ui team-mock" in:scale={{duration: 500, start: 0.9}}>
                <div class="team-avatars">
                  <div class="mock-avatar" style="background: #fbbf24">M</div>
                  <div class="mock-avatar" style="background: #60a5fa">J</div>
                  <div class="mock-avatar" style="background: #34d399">A</div>
                  <div class="mock-avatar add">+</div>
                </div>
                <p>Crea tu equipo en segundos</p>
             </div>
          {:else if steps[currentStep].feature === 'payments'}
             <div class="mock-ui payment-mock" in:scale={{duration: 500, start: 0.9}}>
                <div class="payment-row">
                  <span>Jornada</span>
                  <span class="price">$50.00</span>
                </div>
                <div class="payment-row">
                  <span>Hora Extra</span>
                  <span class="price">$15.00</span>
                </div>
             </div>
          {/if}
        </div>
      </div>
    {/key}
  </main>

  <footer class="tour-footer">
    {#if currentStep > 0}
      <button class="back-btn" on:click={back}>
        <ChevronLeft size={20} />
        Atrás
      </button>
    {:else}
      <div></div>
    {/if}

    <button class="next-btn" on:click={next}>
      {steps[currentStep].isLast ? '¡Empezar!' : 'Continuar'}
      <ArrowRight size={20} />
    </button>
  </footer>
</div>

<style>
  .tour-page {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: var(--bg-page);
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow: hidden;
  }

  .tour-header {
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: var(--page-top-safe);
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    padding: 8px;
    border-radius: 50%;
  }

  .icon-btn:hover {
    background: var(--bg-input);
  }

  .progress-container {
    flex: 1;
    height: 12px;
    background: var(--bg-input);
    border-radius: 6px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--accent-color);
    border-radius: 6px;
    transition: width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .step-counter {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    min-width: 40px;
    text-align: right;
  }

  .tour-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    max-width: 500px;
    margin: 0 auto;
    width: 100%;
  }

  .step-view {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
  }

  .mascot-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .mascot-img {
    width: 180px;
    height: 180px;
    object-fit: contain;
    filter: drop-shadow(0 10px 20px rgba(0,0,0,0.1));
  }

  .feature-preview {
    width: 140px;
    height: 140px;
    border-radius: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    box-shadow: var(--shadow-soft);
  }

  .speech-bubble {
    background: var(--bg-card);
    padding: 24px;
    border-radius: 24px;
    position: relative;
    box-shadow: var(--shadow-card);
    border: 2px solid var(--border-color);
    text-align: center;
    width: 100%;
  }

  .speech-bubble::after {
    content: '';
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 12px solid transparent;
    border-right: 12px solid transparent;
    border-bottom: 12px solid var(--border-color);
  }

  .speech-bubble h2 {
    font-size: 24px;
    margin-bottom: 8px;
    font-weight: 800;
  }

  .speech-bubble p {
    color: var(--text-secondary);
    line-height: 1.5;
    font-size: 16px;
  }

  .visual-explanation {
    width: 100%;
    height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mock-ui {
    background: var(--bg-card-raised);
    padding: 20px;
    border-radius: 20px;
    width: 100%;
    box-shadow: var(--shadow-soft);
    border: 1px solid var(--border-color);
  }

  /* Mock Calendar */
  .calendar-mock {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .mock-header {
    font-weight: 700;
    font-size: 14px;
    text-align: center;
  }
  .mock-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
  }
  .mock-day {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    border-radius: 8px;
    position: relative;
  }
  .mock-day.active {
    background: var(--accent-color);
    font-weight: bold;
  }
  .dot {
    position: absolute;
    bottom: 4px;
    width: 4px;
    height: 4px;
    background: var(--text-primary);
    border-radius: 50%;
  }
  .hint {
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
  }

  /* Mock Tasks */
  .task-mock {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .mock-task {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }
  .checkbox {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-color);
    border-radius: 6px;
  }
  .checkbox.checked {
    background: var(--accent-color);
    border-color: var(--accent-color);
  }

  /* Mock Teams */
  .team-mock {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .team-avatars {
    display: flex;
    gap: -8px;
  }
  .mock-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid var(--bg-card-raised);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: white;
    margin-right: -10px;
  }
  .mock-avatar.add {
    background: var(--bg-input);
    color: var(--text-secondary);
    border-style: dashed;
    margin-right: 0;
  }

  /* Mock Payments */
  .payment-mock {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .payment-row {
    display: flex;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }
  .price {
    font-weight: 700;
    color: var(--success-color);
  }

  .tour-footer {
    padding: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: env(safe-area-inset-bottom, 0px);
    border-top: 2px solid var(--border-color);
  }

  .next-btn {
    background: var(--accent-strong);
    color: var(--bg-page);
    border: none;
    padding: 16px 32px;
    border-radius: 16px;
    font-weight: 700;
    font-size: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 4px 0 rgba(0,0,0,0.2);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .next-btn:active {
    transform: translateY(2px);
    box-shadow: 0 2px 0 rgba(0,0,0,0.2);
  }

  .back-btn {
    background: none;
    border: 2px solid var(--border-color);
    padding: 12px 20px;
    border-radius: 16px;
    font-weight: 600;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  @media (max-width: 480px) {
    .speech-bubble h2 {
      font-size: 20px;
    }
    .mascot-img {
      width: 140px;
      height: 140px;
    }
  }
</style>