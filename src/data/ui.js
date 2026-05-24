import { derived, writable } from "svelte/store";

export const openSliceContainers = writable(0);

export const hasOpenSliceContainer = derived(
  openSliceContainers,
  ($openSliceContainers) => $openSliceContainers > 0,
);
