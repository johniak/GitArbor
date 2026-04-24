<script lang="ts">
  import type { AppSettings } from '../../shared/ipc';
  import SettingsTabs, { type Tab } from './SettingsTabs.svelte';
  import GeneralPage from './GeneralPage.svelte';

  let currentTab = $state<Tab>('general');
  let settings = $state<AppSettings | null>(null);

  async function load() {
    settings = await window.electronAPI.appSettings.get();
  }

  load();

  async function handleGeneralChange(patch: Partial<AppSettings['general']>) {
    // Optimistic update so subsequent onChange reads see the latest values
    if (settings) {
      settings = {
        ...settings,
        general: { ...settings.general, ...patch },
      };
    }
    await window.electronAPI.appSettings.update({ general: patch });
  }
</script>

<div class="settings">
  <SettingsTabs current={currentTab} onSelect={(t) => (currentTab = t)} />

  <div class="body">
    {#if settings}
      {#if currentTab === 'general'}
        <GeneralPage {settings} onChange={handleGeneralChange} />
      {:else}
        <div class="placeholder">Coming soon…</div>
      {/if}
    {:else}
      <div class="placeholder">Loading…</div>
    {/if}
  </div>
</div>

<style>
  .settings {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-base);
    color: var(--color-text-primary);
  }

  .body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    font-size: 13px;
  }
</style>
