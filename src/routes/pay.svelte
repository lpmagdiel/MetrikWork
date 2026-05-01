<script>
  import { currentPath } from "../router.js";
  import StripeTablePrices from "../components/StripeTablePrices.svelte";
  import CheckoutForm from "../components/CheckoutForm.svelte";
  import { ChevronLeft, CreditCard, ArrowRight } from "lucide-svelte";
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
      $currentPath = "#/teams";
    }
  }
</script>

<div class="pay-page">
  <div class="nav-header">
    <button class="back-button" onclick={goBack}>
      <ChevronLeft size={20} />
      <span>{step === 2 ? "Cambiar plan" : "Volver"}</span>
    </button>
  </div>

  {#if step === 1}
    <StripeTablePrices />

    <div class="payment-footer">
      <button class="pay-button" onclick={goToCheckout}>
        <span class="btn-content">
          <ArrowRight size={20} />
          <span>Continuar con {paymentStore.selectedPlan?.name || "el plan"}</span>
        </span>
        <span class="btn-highlight"></span>
      </button>
    </div>
  {:else}
    <CheckoutForm />
  {/if}
</div>

<style>
  .pay-page {
    height: 100%;
    overflow-y: auto;
    padding-bottom: var(--bottom-nav-clearance);
    background: var(--bg-page);
  }

  .nav-header {
    padding: 1rem 1.5rem;
    max-width: 1200px;
  }

  .back-button {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 0.95rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    transition: all 0.2s;
  }

  .back-button:hover {
    color: var(--text-primary);
    background: var(--bg-card);
  }

  .payment-footer {
    position: fixed;
    bottom: var(--bottom-nav-occupied);
    left: 0;
    right: 0;
    padding: 1.5rem;
    background: linear-gradient(to top, var(--bg-page) 80%, transparent);
    display: flex;
    justify-content: center;
    z-index: 100;
  }

  .pay-button {
    position: relative;
    background: linear-gradient(135deg, #ff8a50, #ffd54f);
    color: white;
    border: none;
    padding: 1rem 2.5rem;
    border-radius: 16px;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 10px 25px -5px rgba(255, 138, 80, 0.4);
    width: 100%;
    max-width: 400px;
  }

  .pay-button:hover {
    transform: translateY(-4px);
    box-shadow: 0 15px 30px -5px rgba(255, 138, 80, 0.6);
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

  .btn-highlight {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transform: translateX(-100%);
    transition: transform 0.6s;
  }

  .pay-button:hover .btn-highlight {
    transform: translateX(100%);
  }

  :global(.dark) .payment-footer {
    background: linear-gradient(to top, #0f172a 80%, transparent);
  }
</style>
