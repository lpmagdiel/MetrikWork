<script>
  import { onMount } from 'svelte';
  import { X, CheckCircle, AlertCircle, Info } from 'lucide-svelte';

  let { show = $bindable(false), type = 'info', title = '', message = '', duration = 4000 } = $props();

  let isVisible = $state(false);
  let timeoutId;

  const icons = {
    success: { icon: CheckCircle, color: 'var(--success-color)' },
    error: { icon: AlertCircle, color: 'var(--danger-color)' },
    warning: { icon: AlertCircle, color: 'var(--warning-color)' },
    info: { icon: Info, color: 'var(--info-color)' }
  };

  $effect(() => {
    if (show) {
      isVisible = true;
      clearTimeout(timeoutId);
      if (duration > 0) {
        timeoutId = setTimeout(() => {
          isVisible = false;
          show = false;
        }, duration);
      }
    } else {
      isVisible = false;
    }
  });

  function close() {
    isVisible = false;
    show = false;
  }

  const currentIcon = icons[type] || icons.info;
</script>

{#if show}
  <div class="alert-overlay" onclick={close}>
    <div class="alert-container {type} {isVisible ? 'visible' : ''}" onclick={(e) => e.stopPropagation()}>
      <div class="alert-content">
        <div class="alert-icon" style="color: {currentIcon.color}">
          <svelte:component this={currentIcon.icon} size={28} />
        </div>
        <div class="alert-text">
          {#if title}
            <h3 class="alert-title">{title}</h3>
          {/if}
          {#if message}
            <p class="alert-message">{message}</p>
          {/if}
        </div>
      </div>
      <button class="alert-close" onclick={close} aria-label="Cerrar alerta">
        <X size={20} />
      </button>
    </div>
  </div>
{/if}

<style>
  .alert-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 32px;
    z-index: 9999;
    animation: fadeIn 0.2s ease;
  }

  .alert-container {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-soft);
    padding: 20px;
    max-width: 420px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    transform: scale(0.9) translateY(-20px);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .alert-container.visible {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  .alert-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
  }

  .alert-content {
    display: flex;
    gap: 12px;
    flex: 1;
  }

  .alert-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .alert-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .alert-message {
    font-size: 0.9rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .alert-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .alert-close:hover {
    background: var(--bg-input);
    color: var(--text-primary);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .alert-overlay {
      padding: 16px;
      align-items: flex-end;
    }

    .alert-container {
      width: 100%;
      max-width: none;
    }
  }
</style>
