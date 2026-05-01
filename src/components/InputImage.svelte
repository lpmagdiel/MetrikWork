<script>
  import { ImageUp } from "lucide-svelte";

    let image = $state(null);
    let { onOpen } = $props();

    function handleOpen(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = () => {
            image = reader.result;
            console.log(reader);
            onOpen(image);
        };
        reader.readAsDataURL(file);
    }
</script>

<div class="input-image">
    <label for="image"><ImageUp /></label>
    <input type="file" id="image" name="image" accept="image/*" bind:value={image} onchange={handleOpen} />
</div>

<style>
    .input-image {
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 50%;
        cursor: pointer;
        background-color: #E67959;
        width: 44px;
        height: 44px;
        color: white;
        padding-top: 5px;
    }

    input {
        display: none;
    }
</style>