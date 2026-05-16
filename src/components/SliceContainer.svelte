<script>
  import { ChevronDown } from "lucide-svelte";
  import { useSwipe } from "svelte-gestures";
  import { slide } from "svelte/transition";
  export let show = false;
  export let bg = "var(--bg-card)";

  const handleSwipe = (event) => {
    if (event.detail.direction == "bottom") {
      show = false;
    }
  };
</script>

{#if show}
  <div
    style="background: {bg};"
    class="slice-container"
    transition:slide={{ duration: 300, axis: "y" }}
    {...useSwipe(handleSwipe)}
  >
    <div class="slice-container-close">
      <button on:click={() => (show = false)}>
        <ChevronDown size={32} color="var(--accent-color)" strokeWidth={3} />
      </button>
    </div>
    <div class="slice-container-content">
      <slot />
    </div>
  </div>
{/if}

<style>
  .slice-container {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: auto;
    min-height: 65vh;
    max-height: 95vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    z-index: 120;
    box-shadow: 0px -3px 12px 4px rgba(0, 0, 0, 0.3);
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    padding: 8px;
  }
  .slice-container-close {
    width: 100%;
    height: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
  }
  .slice-container-close button {
    background: none;
    border: none;
    padding: 0;
  }
  .slice-container-content {
    display: block;
    width: 100%;
    height: calc(100% - 40px);
    overflow-y: auto;
  }
</style>
