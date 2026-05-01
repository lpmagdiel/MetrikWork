<script>
  import { User } from "lucide-svelte";
  import { paymentStore, plans } from "../data/payments.svelte.js";

  const icons = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-icon lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users-icon lucide-users"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles-icon lucide-sparkles"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-briefcase-business-icon lucide-briefcase-business"><path d="M12 12h.01"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M22 13a18.15 18.15 0 0 1-20 0"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>`,
  ];
</script>

<div class="pricing-container">
  <div class="hero-section">
    <div class="hero-image">
      <div class="back-arrow">
        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
          fill="none"
          stroke="white"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><line x1="19" y1="12" x2="5" y2="12"></line><polyline
            points="12 19 5 12 12 5"
          ></polyline></svg
        >
      </div>
    </div>
  </div>

  <div class="cards-stack">
    {#each plans as plan}
      <button onclick={() => paymentStore.selectPlan(plan.name)}>
        <div
          class="plan-card"
          class:recommended={plan.recommended}
          class:selected={paymentStore.selectedPlanName === plan.name}
          style="--plan-color: {plan.color}; --plan-gradient: {plan.gradient}"
        >
          <div class="card-left">
            <div class="icon">
              {@html icons[plan.icon]}
            </div>
          </div>

          <div class="card-center">
            <div class="plan-info">
              <span class="plan-label">{plan.name}</span>
              {#if plan.recommended}
                <span class="most-popular">Más popular</span>
              {/if}
            </div>
            <div class="price-row">
              <span class="amount">{plan.price}</span>
              <span class="period">/mes</span>
            </div>
            <span class="billing-info">{plan.billing}</span>
            <ul>
              {#each plan.features as feature}
                <li>{feature}</li>
              {/each}
            </ul>
          </div>
          <div class="selected-indicator"></div>
        </div>
      </button>
    {/each}
  </div>
</div>

<style>
  .cards-stack {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    max-width: 500px;
    margin: 0 auto;
  }
  button {
    background-color: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    width: 100%;
    text-align: left;
    outline: none;
  }
  .plan-card {
    position: relative;
    border-radius: 24px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1.25rem;
    background: var(--bg-card);
    border: 2px solid var(--border-color);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    width: 100%;
    overflow: hidden;
  }
  .plan-card::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--plan-gradient);
    opacity: 0.03;
    transition: opacity 0.4s;
  }
  .plan-card:hover {
    transform: translateY(-4px);
    border-color: var(--accent-color);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  }
  :global(.dark) .plan-card:hover {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  }
  .plan-card.selected {
    border-color: var(--plan-color);
    background: var(--bg-card);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.05);
  }
  :global(.dark) .plan-card.selected {
    background: rgba(255, 255, 255, 0.03);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
  }
  .plan-card.selected::before {
    opacity: 0.08;
  }

  .card-left {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--plan-gradient);
    color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    position: relative;
    z-index: 1;
  }

  .card-center {
    flex: 1;
    position: relative;
    z-index: 1;
  }
  .card-center ul {
    margin-top: 0.5rem;
    padding-left: 1rem;
  }
  .plan-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.4rem;
  }

  .plan-label {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .most-popular {
    background: var(--plan-gradient);
    color: white;
    font-size: 0.65rem;
    font-weight: 800;
    padding: 0.2rem 0.6rem;
    border-radius: 100px;
    text-transform: uppercase;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .price-row {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
    margin-bottom: 0.1rem;
  }

  .amount {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .period {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .billing-info {
    font-size: 0.7rem;
    color: var(--text-secondary);
    font-weight: 500;
    opacity: 0.8;
  }

  .selected-indicator {
    position: absolute;
    right: 1.5rem;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
    background: var(--bg-page);
  }

  .plan-card.selected .selected-indicator {
    background: var(--plan-color);
    border-color: var(--plan-color);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  }

  .plan-card.selected .selected-indicator::after {
    content: "✓";
    color: white;
    font-size: 14px;
    font-weight: 900;
  }
</style>
