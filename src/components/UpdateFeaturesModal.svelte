<script>
  import { updateData } from "../data/updateFeatures.js";
  let { open = false, onClose = () => {} } = $props();

  const closeModal = () => {
    open = false;
    onClose();
  };
</script>

{#if open}
  <div class="modal-backdrop">
    <div class="modal">
      <h2>{updateData.message}</h2>
      <ul>
        {#each updateData.features as feature}
          <li>• {feature}</li>
        {/each}
      </ul>
      <button class="close-btn" onclick={closeModal}>Cerrar</button>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.35);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal {
    background: #fff;
    border-radius: 16px;
    padding: 32px 24px 24px 24px;
    max-width: 400px;
    width: 90vw;
    box-shadow: 0 4px 32px rgba(0,0,0,0.15);
    text-align: left;
  }
  h2 {
    margin-top: 0;
    font-size: 1.3rem;
    margin-bottom: 16px;
  }
  ul {
    margin: 0 0 18px 0;
    padding-left: 18px;
  }
  .close-btn {
    background: var(--accent-color, #2196F3);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 24px;
    font-size: 1rem;
    cursor: pointer;
    margin-top: 8px;
    width: 100%;
  }
</style>
