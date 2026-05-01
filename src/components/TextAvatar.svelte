<script>
  const { fullName } = $props();
  let initials = $state("");

  $effect(() => {
    if (fullName.trim().length > 0 && fullName.includes(" ")) {
      initials = fullName
        .split(" ")
        .map((part) => part[0].toUpperCase())
        .join("");
    }
  });
</script>

<div class="avatar">{initials}</div>

<style>
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--accent-color);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
  }
</style>
