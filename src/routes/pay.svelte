<script>
  import { currentPath } from "../router.js";
  import StripeTablePrices from "../components/StripeTablePrices.svelte";
  import CheckoutForm from "../components/CheckoutForm.svelte";
  import { ArrowRight, ChevronLeft, CreditCard } from "lucide-svelte";
  import { paymentStore } from "../data/payments.svelte.js";

  let step = $state(1); // 1 = select plan, 2 = checkout

  function goToCheckout() {
    if (!paymentStore.selectedPlan) {
      return;
    }
    step = 2;
  }

  function goBack() {
    if (step === 2) {
      paymentStore.reset();
      step = 1;
    } else {
      $currentPath = "/teams";
    }
  }
</script>

<div class="pay-page" class:checkout-step={step === 2}>
  <div class="nav-header">
    <button class="back-button" onclick={goBack}>
      <ChevronLeft size={20} />
      <span>{step === 2 ? "Cambiar plan" : "Volver"}</span>
    </button>
    <div class="step-pill">
      <CreditCard size={16} />
      <span>{step === 1 ? "Planes" : "Pago"}</span>
    </div>
  </div>

  {#if step === 1}
    <section class="pay-intro">
      <span class="eyebrow">MetricWork Teams</span>
      <h1>Elige el plan de tu equipo</h1>
      <p>Selecciona el tamaño que necesitas y continúa para crear tu equipo.</p>
    </section>

    <section class="plans-shell">
      <StripeTablePrices />
    </section>

    <div class="payment-footer">
      <button class="pay-button" onclick={goToCheckout}>
        <span class="btn-content">
          <span>Continuar con {paymentStore.selectedPlan?.name || "el plan"}</span>
          <ArrowRight size={20} />
        </span>
      </button>
    </div>
  {:else}
    <section class="checkout-shell">
      <CheckoutForm />
    </section>
  {/if}
</div>

<style>
  .pay-page {
    height: 100%;
    overflow-y: auto;
    padding: 24px 20px calc(var(--bottom-nav-clearance) + 96px);
    background: var(--bg-page);
  }

  .pay-page.checkout-step {
    padding-bottom: var(--bottom-nav-clearance);
  }

  .nav-header {
    max-width: 500px;
    margin: 0 auto 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .back-button {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-card);
    transition: all 0.2s;
  }

  .back-button:hover {
    color: var(--text-primary);
    border-color: var(--accent-color);
  }

  .step-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 100px;
    background: var(--accent-color);
    color: var(--accent-ink);
    font-size: 13px;
    font-weight: 800;
  }

  .pay-intro {
    max-width: 500px;
    margin: 0 auto 18px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 22px;
    box-shadow: var(--shadow-card);
  }

  .eyebrow {
    color: var(--text-secondary);
    display: block;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .pay-intro h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    line-height: 1.08;
    color: var(--text-primary);
  }

  .pay-intro p {
    margin: 10px 0 0;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.45;
  }

  .plans-shell,
  .checkout-shell {
    max-width: 500px;
    margin: 0 auto;
  }

  .payment-footer {
    position: fixed;
    bottom: var(--bottom-nav-occupied);
    left: 0;
    right: 0;
    padding: 18px 20px;
    background: linear-gradient(to top, var(--bg-page) 80%, transparent);
    display: flex;
    justify-content: center;
    z-index: 90;
  }

  .pay-button {
    position: relative;
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    min-height: 54px;
    padding: 0 22px;
    border-radius: var(--radius-md);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: var(--shadow-button);
    width: 100%;
    max-width: 400px;
  }

  .pay-button:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-soft);
  }

  .pay-button:active {
    transform: translateY(-1px);
  }

  .btn-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    position: relative;
    z-index: 1;
  }

  @media (max-width: 420px) {
    .pay-page {
      padding-inline: 18px;
    }

    .pay-intro h1 {
      font-size: 25px;
    }
  }
</style>
