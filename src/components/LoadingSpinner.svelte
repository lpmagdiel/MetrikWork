<!-- LoadingRing.svelte -->
<script>
  export let show = false;
  export let overlay = true;
</script>

{#if show}
  <div class="loading-container" class:overlay>
    <div class="ring-spinner">
      <div class="ring-segment"></div>
      <div class="ring-segment"></div>
      <div class="ring-segment"></div>
      <div class="ring-segment"></div>
    </div>
  </div>
{/if}

<style>
  .loading-container {
    width: 100vw;
    height: 100vh;
    top: 0;
    left: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    z-index: 1000;
  }
  .loading-container:before {
    content: "";
    position: absolute;
    width: 20px;
    height: 20px;
    background-color: var(--accent-color);
    border-radius: 50%;
  }

  .loading-container.overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--bg-page);
    opacity: 0.8;
  }

  .ring-spinner {
    position: relative;
    width: 60px;
    height: 60px;
  }

  .ring-segment {
    position: absolute;
    width: 100%;
    height: 100%;
    border: 6px solid transparent;
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: ring-spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
  }

  .ring-segment:nth-child(1) {
    animation-delay: -0.45s;
  }

  .ring-segment:nth-child(2) {
    animation-delay: -0.3s;
  }

  .ring-segment:nth-child(3) {
    animation-delay: -0.15s;
  }

  @keyframes ring-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
