<script>
  import { AlertCircle, CheckCheck, Info, X } from "lucide-svelte";
  let { type, message, duration=2000, show = $bindable() } = $props();

    $effect(() => {
        if(show){
            setTimeout(() => {
                show = false;
            }, duration);
        }
    }); 
</script>

{#if show}
    <div class="toast" class:show={show} >
        <div class="toast-content">
            <div class="toast-icon">
                {#if type === 'success'}
                    <CheckCheck size={20} color="#4CAF50" />
                {:else if type === 'error'}
                    <X size={20} color="#f44336" />
                {:else if type === 'warning'}
                    <AlertCircle size={20} color="#ff9800" />
                {:else}
                    <Info size={20} color="#2196F3" />
                {/if}
            </div>
            <div class="toast-message">
                <p>{message}</p>
            </div>
        </div>
    </div>
{/if}

<style>
    .toast {
        width: 80%;
        position: fixed;
        top: -120px;
        left: 10%;
        background: white;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        z-index: 1000;
    }

    .toast.show {
        display: block;
        top: calc(var(--page-top-safe) + 20px);
        transition: top 0.5s ease-in-out;
    }

    .toast-content {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .toast-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .toast-message {
        display: flex;
        flex-direction: column;
    }

    .toast-message p {
        margin: 0;
        font-size: 14px;
        color: #333;
    }
</style>