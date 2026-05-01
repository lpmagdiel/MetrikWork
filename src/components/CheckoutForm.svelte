<script>
  import { onMount } from "svelte";
  import { loadStripe } from "@stripe/stripe-js";
  import { Elements, PaymentElement } from "svelte-stripe";
  import { paymentStore } from "../data/payments.svelte.js";
  import { createTeam } from "../data/teams.js";
  import { currentPath } from "../router.js";
  import { CreditCard, CheckCircle, AlertCircle, Loader } from "lucide-svelte";

  let stripe = $state(null);
  let elements = $state(null);
  let teamName = $state("");
  let processing = $state(false);
  let errorMessage = $state("");
  let success = $state(false);

  const plan = $derived(paymentStore.selectedPlan);

  onMount(async () => {
    stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC);

    // Create PaymentIntent on mount
    try {
      await paymentStore.createPaymentIntent();
    } catch (e) {
      errorMessage = "Error al inicializar el pago: " + e.message;
    }
  });

  async function handleSubmit() {
    if (!teamName.trim()) {
      errorMessage = "Por favor introduce el nombre del equipo";
      return;
    }

    if (!stripe || !elements) {
      errorMessage = "Stripe no está listo. Intenta de nuevo.";
      return;
    }

    processing = true;
    errorMessage = "";

    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (result.error) {
        errorMessage = result.error.message;
        processing = false;
        return;
      }

      // Payment successful - create team with payment data
      const paymentIntent = result.paymentIntent;

      const paymentData = {
        transactionId: paymentIntent.id,
        planName: plan.name,
        planPrice: plan.price,
        amount: plan.amount,
        cardLast4: paymentIntent.payment_method ? "****" : null,
        status: paymentIntent.status,
      };

      await createTeam(teamName.trim(), paymentData);

      paymentStore.setPaymentResult(paymentData);
      success = true;
      processing = false;

      // Redirect to teams after 2 seconds
      setTimeout(() => {
        paymentStore.reset();
        $currentPath = "#/teams";
      }, 2500);
    } catch (error) {
      errorMessage = error.message || "Error al procesar el pago";
      processing = false;
    }
  }
</script>

<div class="checkout-form">
  {#if success}
    <div class="success-screen">
      <div class="success-icon-wrapper">
        <CheckCircle size={64} />
      </div>
      <h2>¡Pago exitoso!</h2>
      <p>Tu equipo <strong>"{teamName}"</strong> ha sido creado con el <strong>{plan?.name}</strong>.</p>
      <p class="redirect-msg">Redirigiendo a tus equipos...</p>
    </div>
  {:else}
    <div class="plan-summary">
      <div class="plan-badge" style="background: {plan?.gradient}">
        <CreditCard size={20} color="white" />
      </div>
      <div class="plan-details">
        <span class="plan-name">{plan?.name} — {plan?.title}</span>
        <span class="plan-price">{plan?.price}/mes</span>
      </div>
    </div>

    <div class="form-group">
      <label for="team-name">Nombre del equipo</label>
      <input
        id="team-name"
        type="text"
        bind:value={teamName}
        placeholder="Ej: Mi equipo de trabajo"
        disabled={processing}
      />
    </div>

    <div class="stripe-element-wrapper">
      <label>Datos de pago</label>
      {#if stripe && paymentStore.clientSecret}
        <Elements
          {stripe}
          bind:elements
          clientSecret={paymentStore.clientSecret}
          theme="flat"
          variables={{
            colorPrimary: "#e3654e",
            colorBackground: "var(--bg-input, #f5f5f5)",
            colorText: "var(--text-primary, #333333)",
            borderRadius: "12px",
            fontFamily: '"SN Pro", sans-serif',
          }}
          rules={{
            ".Input": {
              border: "1px solid var(--border-color, #f9f9f9)",
              padding: "12px",
            },
          }}
        >
          <PaymentElement />
        </Elements>
      {:else if paymentStore.paymentStatus === "error"}
        <div class="element-error">
          <AlertCircle size={20} />
          <span>Error al cargar el formulario de pago</span>
        </div>
      {:else}
        <div class="element-loading">
          <Loader size={24} class="spinner" />
          <span>Cargando formulario de pago...</span>
        </div>
      {/if}
    </div>

    {#if errorMessage}
      <div class="error-banner">
        <AlertCircle size={16} />
        <span>{errorMessage}</span>
      </div>
    {/if}

    <div class="test-card-hint">
      <span>🧪 Tarjeta de prueba: <code>4242 4242 4242 4242</code> · Fecha: cualquier futura · CVC: <code>123</code></span>
    </div>

    <button
      class="submit-btn"
      onclick={handleSubmit}
      disabled={processing || !stripe || !paymentStore.clientSecret}
    >
      {#if processing}
        <Loader size={20} class="spinner" />
        <span>Procesando pago...</span>
      {:else}
        <CreditCard size={20} />
        <span>Pagar {plan?.price} y Crear Equipo</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .checkout-form {
    padding: 1.5rem;
    max-width: 500px;
    margin: 0 auto;
  }

  /* Success Screen */
  .success-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem 1rem;
    animation: fadeInUp 0.5s ease;
  }

  .success-icon-wrapper {
    color: #4caf50;
    margin-bottom: 1.5rem;
    animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .success-screen h2 {
    color: var(--text-primary);
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .success-screen p {
    color: var(--text-secondary);
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .redirect-msg {
    margin-top: 1.5rem;
    font-size: 0.85rem !important;
    opacity: 0.6;
  }

  /* Plan Summary */
  .plan-summary {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }

  .plan-badge {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .plan-details {
    display: flex;
    flex-direction: column;
  }

  .plan-name {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-secondary);
  }

  .plan-price {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-primary);
  }

  /* Form Group */
  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .form-group input {
    width: 100%;
    padding: 14px 16px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    font-size: 1rem;
    background: var(--bg-input);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.2s;
  }

  .form-group input:focus {
    border-color: #e3654e;
    box-shadow: 0 0 0 3px rgba(227, 101, 78, 0.1);
  }

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Stripe Element */
  .stripe-element-wrapper {
    margin-bottom: 1.5rem;
  }

  .stripe-element-wrapper label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .element-loading,
  .element-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    background: var(--bg-input);
    border-radius: 12px;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .element-error {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  /* Error Banner */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 12px;
    color: #ef4444;
    font-size: 0.85rem;
    margin-bottom: 1rem;
    animation: fadeIn 0.3s ease;
  }

  /* Test Card Hint */
  .test-card-hint {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.15);
    border-radius: 12px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
    font-size: 0.78rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .test-card-hint code {
    background: rgba(59, 130, 246, 0.12);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--text-primary);
  }

  /* Submit Button */
  .submit-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, #ff8a50, #ffd54f);
    color: white;
    border: none;
    border-radius: 16px;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 8px 24px rgba(255, 138, 80, 0.35);
  }

  .submit-btn:hover:not(:disabled) {
    transform: translateY(-3px);
    box-shadow: 0 12px 30px rgba(255, 138, 80, 0.5);
  }

  .submit-btn:active:not(:disabled) {
    transform: translateY(-1px);
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Animations */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes scaleIn {
    from {
      transform: scale(0);
    }
    to {
      transform: scale(1);
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
