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

  const items = [
    { href: "/", label: "Inicio", icon: LayoutDashboard },
    { href: "/teams", label: "Equipos", icon: Users },
    { href: "/timer", label: "Timer", icon: TimerReset },
    { href: "/calendar", label: "Agenda", icon: CalendarDays },
    { href: "/settings", label: "Ajustes", icon: SlidersHorizontal },
  ];
</script>

<nav class="navbar">
  <ul>
    {#each items as item}
      <li>
        <a
          href={item.href}
          class:active={isActive(item.href)}
          aria-label={item.label}
          aria-current={isActive(item.href) ? "page" : undefined}
        >
          <svelte:component this={item.icon} size={21} strokeWidth={2.3} />
          <span>{item.label}</span>
        </a>
      </li>
    {/each}
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
