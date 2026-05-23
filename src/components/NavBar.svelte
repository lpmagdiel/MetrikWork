<script>
  import {
    CalendarDays,
    LayoutDashboard,
    SlidersHorizontal,
    TimerReset,
    Users,
  } from "lucide-svelte";
  import { currentPath } from "../router.js";

  const isActive = (iconPath) => {
    const path = $currentPath;
    if (iconPath === "/") {
      return path === "/" || path === "";
    }
    if (iconPath === "/teams") {
      return (
        path.startsWith("/teams") ||
        path.startsWith("/chat") ||
        path.startsWith("/team-payments")
      );
    }
    return path.startsWith(iconPath);
  };

</script>

<nav class="navbar">
  <ul>
    <li>
      <a
        href="/"
        class:active={isActive("/")}
        aria-label="Inicio"
        aria-current={isActive("/") ? "page" : undefined}
      >
        <LayoutDashboard size={21} strokeWidth={2.3} />
        <span>Inicio</span>
      </a>
    </li>
    <li>
      <a
        href="/teams"
        class:active={isActive("/teams")}
        aria-label="Equipos"
        aria-current={isActive("/teams") ? "page" : undefined}
      >
        <Users size={21} strokeWidth={2.3} />
        <span>Equipos</span>
      </a>
    </li>
    <li>
      <a
        href="/timer"
        class:active={isActive("/timer")}
        aria-label="Timer"
        aria-current={isActive("/timer") ? "page" : undefined}
      >
        <TimerReset size={21} strokeWidth={2.3} />
        <span>Timer</span>
      </a>
    </li>
    <li>
      <a
        href="/calendar"
        class:active={isActive("/calendar")}
        aria-label="Agenda"
        aria-current={isActive("/calendar") ? "page" : undefined}
      >
        <CalendarDays size={21} strokeWidth={2.3} />
        <span>Agenda</span>
      </a>
    </li>
    <li>
      <a
        href="/settings"
        class:active={isActive("/settings")}
        aria-label="Ajustes"
        aria-current={isActive("/settings") ? "page" : undefined}
      >
        <SlidersHorizontal size={21} strokeWidth={2.3} />
        <span>Ajustes</span>
      </a>
    </li>
  </ul>
</nav>

<style>
  .navbar {
    position: fixed;
    bottom: calc(var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px));
    left: 0;
    width: 100%;
    height: var(--bottom-nav-height);
    z-index: 100;
    padding: 0 20px;
    pointer-events: none;
  }

  .navbar ul {
    list-style-type: none;
    margin: 0;
    padding: 6px;
    display: flex;
    align-items: center;
    height: 100%;
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    justify-content: space-around;
    gap: 4px;
    background: var(--nav-bg);
    border: 1px solid var(--border-color);
    border-radius: 40px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    pointer-events: auto;
  }

  .navbar li {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .navbar a {
    height: 48px;
    width: 100%;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0 12px;
  }

  .navbar a span {
    display: none;
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
  }

  .navbar a.active {
    color: var(--accent-ink);
    background: var(--accent-color);
  }

  .navbar a.active span {
    display: inline;
  }

  .navbar a:active {
    transform: scale(0.92);
  }

  :global(:root.dark) .navbar a.active {
    color: #000000;
    background: var(--accent-color);
  }
</style>
