<script>
  import { BriefcaseBusiness, Check, Sparkles, User, Users } from "lucide-svelte";
  import { paymentStore, plans } from "../data/payments.svelte.js";

  const icons = [
    User,
    Users,
    Sparkles,
    BriefcaseBusiness,
  ];
</script>

<div class="pricing-container">
  <div class="cards-stack">
    {#each plans as plan}
      <button
        class="plan-option"
        class:selected={paymentStore.selectedPlanName === plan.name}
        onclick={() => paymentStore.selectPlan(plan.name)}
      >
        <div
          class="plan-card"
          class:recommended={plan.recommended}
          class:selected={paymentStore.selectedPlanName === plan.name}
        >
          <div class="card-left">
            <div class="icon">
              <svelte:component this={icons[plan.icon]} size={24} />
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
                <li>
                  <Check size={14} />
                  <span>{feature}</span>
                </li>
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
  .pricing-container {
    width: 100%;
  }

  .cards-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0;
    max-width: 500px;
    margin: 0 auto;
  }

  .plan-option {
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
    border-radius: var(--radius-lg);
    padding: 18px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    width: 100%;
    overflow: hidden;
    box-shadow: var(--shadow-card);
  }

  .plan-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 5px;
    background: var(--border-color);
    transition: background-color 0.2s ease;
  }

  .plan-card:hover {
    transform: translateY(-1px);
    border-color: var(--accent-color);
    box-shadow: var(--shadow-soft);
  }

  .plan-card.selected {
    border-color: var(--accent-color);
    background: var(--bg-card);
    box-shadow: var(--shadow-soft);
  }

  .plan-card.selected::after {
    background: var(--accent-color);
  }

  .card-left {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-input);
    color: var(--text-primary);
    position: relative;
    z-index: 1;
    flex-shrink: 0;
  }

  .plan-card.selected .card-left {
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .card-center {
    flex: 1;
    position: relative;
    z-index: 1;
  }

  .card-center ul {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .card-center li {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  .card-center li svg {
    color: var(--success-color);
    flex-shrink: 0;
  }

  .plan-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .plan-label {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  .most-popular {
    background: var(--accent-color);
    color: var(--accent-ink);
    font-size: 0.65rem;
    font-weight: 800;
    padding: 0.2rem 0.6rem;
    border-radius: 100px;
    text-transform: uppercase;
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
    background: var(--accent-strong);
    border-color: var(--accent-strong);
  }

  .plan-card.selected .selected-indicator::after {
    content: "✓";
    color: var(--bg-card);
    font-size: 14px;
    font-weight: 900;
  }

  @media (max-width: 420px) {
    .plan-card {
      padding: 16px;
    }

    .card-left {
      width: 46px;
      height: 46px;
    }
  }
</style>
