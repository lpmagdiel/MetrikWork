<script>
  import { ChevronLeft } from "lucide-svelte";
  const { title = "MetricWork", description = "", action, icon = ChevronLeft, iconPosition = "left" ,paddingHorizontal=false} = $props();
  let Component = $derived(icon);
</script>

<header class={`header-container ${iconPosition} ${paddingHorizontal ? "padding-h" : ""}`}>
  <div class="header-action">
    {#if icon}
      {#if action}
        <button type="button" onclick={action} aria-label={title}>
          <Component size={20} />
        </button>
      {:else}
        <span class="static-icon" aria-hidden="true">
          <Component size={20} />
        </span>
      {/if}
    {:else}
      <ChevronLeft />
    {/if}
  </div>
  <div class="header-content">
    <h1>{title}</h1>
    <span>{description}</span>
  </div>
</header>


<style>
    .header-container{
        width: 100%;
        display: grid;
        align-items: center;
        padding: 5px 0px;
        grid-template-columns: 50px 1fr;
    }
    .header-container.left{
        direction: ltr;
    }
    .header-container.right{
        direction: rtl;
    }
    .header-container.padding-h{
        padding-left: 16px;
        padding-right: 16px;
    }
    .header-content{
        display: flex;
        flex-direction: column;
        text-align: left;
    }
    .header-content h1{
        color: var(--text-primary);
        font-size: 22px;
        font-weight: 600;
    }
    .header-content span{
        font-size: 12px;
        font-weight: 800;
        color: var(--text-secondary);
    }
    .header-action{
        border: none;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--text-primary);
        background: var(--bg-card);
        box-shadow: var(--shadow-card);
    }
    
    .header-action button{
        background: none;
        border: none;
        padding: 0;
        width: 100%;
        height: 100%;
        color: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .static-icon{
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>
