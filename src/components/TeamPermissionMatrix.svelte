<script>
  import {
    TEAM_PERMISSION_LABELS,
    TEAM_PERMISSION_MODULE_ACTIONS,
    getTeamPermissionActionHint,
    getTeamPermissionActionLabel,
  } from "../data/permissions.js";

  let {
    permissions = {},
    disabled = false,
    // Visibilidad de tareas: se muestra dentro de la fila de "Tareas" para
    // que el menú de permisos y el de ajustes de equipo no estén separados.
    showTasksVisibility = false,
    tasksVisibility = "all",
    visibilityGroup = "tasks-visibility",
    onToggle = () => {},
    onTasksVisibilityChange = () => {},
  } = $props();

  const modules = Object.entries(TEAM_PERMISSION_LABELS);

  function getActions(module) {
    return TEAM_PERMISSION_MODULE_ACTIONS[module] || [];
  }

  function isChecked(module, action) {
    return Boolean(permissions?.[module]?.[action]);
  }
</script>

<div class="permissions-editor">
  {#each modules as [module, moduleLabel]}
    <div class="permission-row">
      <span class="permission-module">{moduleLabel}</span>
      <div class="permission-actions">
        {#each getActions(module) as action}
          <label class="permission-toggle" title={getTeamPermissionActionHint(module, action)}>
            <input
              type="checkbox"
              checked={isChecked(module, action)}
              disabled={disabled}
              onchange={() => onToggle(module, action)}
            />
            <span>{getTeamPermissionActionLabel(module, action)}</span>
          </label>
        {/each}
      </div>

      {#if module === "tasks" && showTasksVisibility}
        <div class="permission-scope">
          <span class="permission-scope-label">Visibilidad de las tareas</span>
          <div class="permission-actions">
            <label class="permission-toggle" title="El miembro ve todas las tareas del equipo">
              <input
                type="radio"
                name={visibilityGroup}
                checked={tasksVisibility !== "own"}
                disabled={disabled}
                onchange={() => onTasksVisibilityChange("all")}
              />
              <span>Todas</span>
            </label>
            <label
              class="permission-toggle"
              title="El miembro solo ve sus tareas y las de los fantasmas que gestiona"
            >
              <input
                type="radio"
                name={visibilityGroup}
                checked={tasksVisibility === "own"}
                disabled={disabled}
                onchange={() => onTasksVisibilityChange("own")}
              />
              <span>Solo las suyas</span>
            </label>
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .permissions-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .permission-row {
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 12px;
    min-width: 0;
  }

  .permission-module {
    display: block;
    margin-bottom: 9px;
    font-size: 13px;
    font-weight: 800;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .permission-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .permission-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .permission-toggle input {
    width: auto;
    min-width: 0;
    margin: 0;
    accent-color: var(--accent-color);
    flex-shrink: 0;
  }

  .permission-scope {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--border-color);
    min-width: 0;
  }

  .permission-scope-label {
    display: block;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  @media (max-width: 380px) {
    .permission-actions {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
