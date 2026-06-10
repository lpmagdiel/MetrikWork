<script>
  import { ArrowLeft, CalendarDays, Cookie, ExternalLink, FileText } from "lucide-svelte";
  import { legalLinks } from "../data/legalContent.js";
  import { navigateTo } from "../router.js";
  import { openCookiePreferences } from "../data/cookieConsent.js";

  let { document } = $props();

  function goBack() {
    if (history.length > 1) {
      history.back();
      return;
    }

    navigateTo("/hello");
  }
</script>

<div class="legal-page">
  <div class="legal-shell">
    <header class="legal-header">
      <button type="button" class="back-btn" onclick={goBack} aria-label="Volver">
        <ArrowLeft size={20} />
      </button>
      <div>
        <span>{document.eyebrow}</span>
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
      </div>
    </header>

    <nav class="legal-nav" aria-label="Paginas legales">
      {#each legalLinks as link}
        <a href={link.href} class:active={link.href === document.href}>
          {link.label}
        </a>
      {/each}
    </nav>

    <article class="legal-document">
      <div class="legal-meta">
        <span><CalendarDays size={16} /> Version {document.version}</span>
        <span><FileText size={16} /> MetricWork</span>
      </div>

      {#each document.sections as section}
        <section>
          <h2>{section.title}</h2>
          {#each section.paragraphs as paragraph}
            <p>{paragraph}</p>
          {/each}
        </section>
      {/each}

      {#if document.title === "Politica de cookies"}
        <button type="button" class="cookie-settings-btn" onclick={openCookiePreferences}>
          <Cookie size={18} />
          <span>Configurar cookies</span>
        </button>
      {/if}
    </article>

    <footer class="legal-footer">
      <span>Este texto debe revisarse antes de uso comercial definitivo.</span>
      <a href="/privacy">
        <span>Privacidad</span>
        <ExternalLink size={15} />
      </a>
    </footer>
  </div>
</div>

<style>
  .legal-page {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 24%, var(--bg-page)) 0%, var(--bg-page) 320px);
    color: var(--text-primary);
    padding: calc(var(--page-top-safe) + 20px) 18px 42px;
    box-sizing: border-box;
  }

  .legal-shell {
    width: min(100%, 920px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .legal-header {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 16px;
    align-items: flex-start;
  }

  .back-btn {
    width: 44px;
    height: 44px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }

  .legal-header span {
    display: block;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .legal-header h1 {
    margin: 4px 0 8px;
    color: var(--text-primary);
    font-size: clamp(30px, 8vw, 46px);
    line-height: 1;
    font-weight: 950;
    letter-spacing: 0;
  }

  .legal-header p {
    max-width: 680px;
    margin: 0;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.55;
    font-weight: 650;
  }

  .legal-nav {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 0;
    scrollbar-width: none;
  }

  .legal-nav::-webkit-scrollbar {
    display: none;
  }

  .legal-nav a {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    text-decoration: none;
    font-size: 13px;
    font-weight: 850;
    white-space: nowrap;
  }

  .legal-nav a.active {
    background: var(--accent-strong);
    color: var(--bg-card);
    border-color: var(--accent-strong);
  }

  :global(:root.dark) .legal-nav a.active {
    color: #000000;
  }

  .legal-document {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
    padding: clamp(20px, 5vw, 34px);
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .legal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .legal-meta span {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .legal-document section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .legal-document h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 19px;
    line-height: 1.2;
    font-weight: 900;
    letter-spacing: 0;
  }

  .legal-document p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.65;
    font-weight: 560;
  }

  .cookie-settings-btn {
    min-height: 46px;
    align-self: flex-start;
    border: none;
    border-radius: var(--radius-md);
    padding: 0 16px;
    background: var(--accent-strong);
    color: var(--bg-card);
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: var(--shadow-button);
  }

  :global(:root.dark) .cookie-settings-btn {
    color: #000000;
  }

  .legal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .legal-footer a {
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    text-decoration: none;
    font-weight: 900;
  }

  @media (max-width: 620px) {
    .legal-header {
      grid-template-columns: 1fr;
    }

    .legal-footer {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
