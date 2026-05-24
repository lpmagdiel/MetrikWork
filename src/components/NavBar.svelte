<script>
  import { onMount, tick } from "svelte";
  import {
    ClipboardList,
    LayoutDashboard,
    SlidersHorizontal,
    TimerReset,
    Users,
  } from "lucide-svelte";
  import { currentPath } from "../router.js";

  const navItems = [
    { href: "/", label: "Inicio", icon: LayoutDashboard },
    { href: "/teams", label: "Equipos", icon: Users },
    { href: "/timer", label: "Timer", icon: TimerReset },
    { href: "/requests", label: "Solicitudes", icon: ClipboardList },
    { href: "/settings", label: "Ajustes", icon: SlidersHorizontal },
  ];

  const isPathActive = (path, iconPath) => {
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

  let navList;
  let navLinks = [];
  let indicator = { width: 48, x: 6 };

  const updateIndicator = () => {
    const activeLink = navLinks[activeIndex];
    if (!navList || !activeLink) return;

    const navRect = navList.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    indicator = {
      width: linkRect.width,
      x: linkRect.left - navRect.left,
    };
  };

  const scheduleIndicatorUpdate = async () => {
    await tick();
    requestAnimationFrame(updateIndicator);
  };

  $: activeIndex = Math.max(
    navItems.findIndex((item) => isPathActive($currentPath, item.href)),
    0,
  );
  $: navStyle = `--indicator-width: ${indicator.width}px; --indicator-x: ${indicator.x}px;`;
  $: $currentPath, activeIndex, scheduleIndicatorUpdate();

  onMount(() => {
    updateIndicator();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateIndicator)
        : null;

    if (resizeObserver && navList) {
      resizeObserver.observe(navList);
    }

    window.addEventListener("resize", updateIndicator);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  });
</script>

<nav class="navbar">
  <ul bind:this={navList} style={navStyle}>
    {#each navItems as item, index}
      {@const active = isPathActive($currentPath, item.href)}
      {@const Icon = item.icon}
      <li class:active-item={active}>
        <a
          bind:this={navLinks[index]}
          href={item.href}
          class:active={active}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={21} strokeWidth={2.3} />
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
    position: relative;
    overflow: hidden;
  }

  .navbar ul::before {
    content: "";
    position: absolute;
    z-index: 0;
    top: 6px;
    bottom: 6px;
    left: 0;
    width: var(--indicator-width);
    border-radius: 30px;
    background: var(--accent-color);
    box-shadow: 0 10px 22px color-mix(in srgb, var(--accent-color) 35%, transparent);
    transform: translate3d(var(--indicator-x), 0, 0);
    transition:
      transform 0.52s cubic-bezier(0.2, 0.9, 0.2, 1.16),
      box-shadow 0.3s ease;
    will-change: transform;
  }

  .navbar li {
    flex: 1 1 0;
    display: flex;
    justify-content: center;
    min-width: 0;
    position: relative;
    z-index: 1;
  }

  .navbar li.active-item {
    flex: 0 0 auto;
  }

  .navbar a {
    height: 48px;
    width: 48px;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 30px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    transition:
      color 0.22s ease,
      transform 0.24s cubic-bezier(0.2, 0.9, 0.2, 1.2);
    padding: 0 12px;
    min-width: 0;
  }

  .navbar a span {
    max-width: 0;
    opacity: 0;
    margin-left: 0;
    overflow: hidden;
    transform: translateX(-6px);
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    transition:
      opacity 0.2s ease,
      transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .navbar a.active {
    width: auto;
    color: var(--accent-ink);
    transform: translateY(-1px);
  }

  .navbar a.active span {
    max-width: 84px;
    opacity: 1;
    margin-left: 8px;
    transform: translateX(0);
  }

  .navbar a:active {
    transform: scale(0.92);
  }

  :global(:root.dark) .navbar a.active {
    color: #000000;
  }
</style>
