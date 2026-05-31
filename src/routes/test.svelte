<script>
  import { ChevronLeft } from "lucide-svelte";
  import { navigateTo } from "../router.js";
</script>

<div class="test-page">
  <div class="nav-header">
    <button type="button" class="back-button" onclick={() => navigateTo("/")}>
      <ChevronLeft size={18} />
      <span>Volver al Home</span>
    </button>
  </div>

  <section class="test-content">
    <h1>Vista de pruebas</h1>
    <p>No hay módulos de pago externos activos.</p>
  </section>
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

  .test-content {
    max-width: 720px;
    width: calc(100% - 40px);
    margin: 0 auto;
    padding: 24px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .test-content h1 {
    margin: 0 0 8px;
    font-size: 22px;
  }

  .test-content p {
    margin: 0;
    color: var(--text-secondary);
  }
</style>
