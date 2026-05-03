<script>
  import { navigateTo } from "../router.js";
  import StripeTablePrices from "../components/StripeTablePrices.svelte";
</script>

<div class="test-page">
  <div class="nav-header">
    <button class="back-button" onclick={() => navigateTo("/")}>
      <span class="icon">←</span> Volver al Home
    </button>
  </div>

  <StripeTablePrices />
</div>

<style>
  .test-page {
    height: 100%;
    overflow-y: auto;
    padding-bottom: var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    background-color: var(--bg-page);
    display: flex;
    flex-direction: column;
  }

  .nav-header {
    padding: 1.5rem 2rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }

  .back-button {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: color 0.2s ease;
    padding: 0.5rem 1rem;
    border-radius: 8px;
  }

  .back-button:hover {
    color: var(--accent-color);
    background: var(--bg-accent-subtle);
  }

  .icon {
    font-size: 1.2rem;
  }
</style>
