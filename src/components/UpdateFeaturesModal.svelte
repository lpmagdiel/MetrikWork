<script>
  import { updateData } from "../data/updateFeatures.js";
  import { showUpdateFeaturesAlert } from "../data/alerts.js";

  let { open = false, onClose = () => {} } = $props();
  let isShowing = false;

  $effect(() => {
    if (!open || isShowing) return;

    isShowing = true;
    showUpdateFeaturesAlert(updateData).finally(() => {
      isShowing = false;
      onClose();
    });
  });
</script>
