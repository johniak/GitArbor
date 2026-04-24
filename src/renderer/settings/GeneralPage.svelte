<script lang="ts">
  import { onMount } from 'svelte';
  import type { AppSettings } from '../../shared/ipc';

  type Props = {
    settings: AppSettings;
    onChange: (patch: Partial<AppSettings['general']>) => void;
  };

  let { settings, onChange }: Props = $props();

  // App-level values the user has typed (persist when override is on).
  let appName = $state(settings.general.authorName);
  let appEmail = $state(settings.general.authorEmail);

  // Read-only snapshot of what `git config --global user.name/email` says.
  // Shown (disabled) when override is off.
  let globalName = $state('');
  let globalEmail = $state('');

  let projectFolder = $state(settings.general.projectFolder);
  let overrideAuthorOnCommit = $state(settings.general.overrideAuthorOnCommit);

  // What the inputs actually show: app values while override is on, otherwise
  // the read-only global values.
  let displayName = $derived(overrideAuthorOnCommit ? appName : globalName);
  let displayEmail = $derived(overrideAuthorOnCommit ? appEmail : globalEmail);

  onMount(async () => {
    try {
      globalName = (
        (await window.electronAPI.git.getConfig('user.name')) ?? ''
      ).trim();
    } catch {
      globalName = '';
    }
    try {
      globalEmail = (
        (await window.electronAPI.git.getConfig('user.email')) ?? ''
      ).trim();
    } catch {
      globalEmail = '';
    }
  });

  function handleOverrideToggle() {
    // When turning the override on for the first time, seed the app values
    // with whatever global currently has so the user has a starting point.
    if (overrideAuthorOnCommit) {
      const patch: Partial<AppSettings['general']> = {
        overrideAuthorOnCommit,
      };
      if (!appName && globalName) {
        appName = globalName;
        patch.authorName = globalName;
      }
      if (!appEmail && globalEmail) {
        appEmail = globalEmail;
        patch.authorEmail = globalEmail;
      }
      onChange(patch);
    } else {
      onChange({ overrideAuthorOnCommit });
    }
  }

  async function browseProjectFolder() {
    const dir = await window.electronAPI.repo.pickDirectory({
      title: 'Default project folder',
      defaultPath: projectFolder || undefined,
    });
    if (!dir) return;
    projectFolder = dir;
    onChange({ projectFolder });
  }
</script>

<div class="page">
  <label class="checkbox-row top-checkbox">
    <input
      type="checkbox"
      bind:checked={overrideAuthorOnCommit}
      onchange={handleOverrideToggle}
      data-testid="settings-override-checkbox"
    />
    <span>
      Override Git author on commits (use the Full Name / Email below instead of
      your global Git config)
    </span>
  </label>

  <fieldset class="group">
    <legend>Default user information</legend>

    <div class="field">
      <label for="settings-name">Full Name:</label>
      <input
        id="settings-name"
        type="text"
        value={displayName}
        disabled={!overrideAuthorOnCommit}
        oninput={(e) => {
          appName = (e.currentTarget as HTMLInputElement).value;
        }}
        onblur={() => onChange({ authorName: appName })}
        data-testid="settings-name"
      />
    </div>

    <div class="field">
      <label for="settings-email">Email address:</label>
      <input
        id="settings-email"
        type="text"
        value={displayEmail}
        disabled={!overrideAuthorOnCommit}
        oninput={(e) => {
          appEmail = (e.currentTarget as HTMLInputElement).value;
        }}
        onblur={() => onChange({ authorEmail: appEmail })}
        data-testid="settings-email"
      />
    </div>
  </fieldset>

  <fieldset class="group">
    <legend>Miscellaneous</legend>

    <div class="field">
      <label for="settings-project-folder">Project folder:</label>
      <div class="dir-row">
        <input
          id="settings-project-folder"
          type="text"
          bind:value={projectFolder}
          onblur={() => onChange({ projectFolder })}
          placeholder="~/Projects"
          data-testid="settings-project-folder"
        />
        <button
          type="button"
          class="browse"
          onclick={browseProjectFolder}
          data-testid="settings-project-folder-browse"
        >
          Browse…
        </button>
      </div>
    </div>
  </fieldset>
</div>

<style>
  .page {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }

  .top-checkbox {
    font-size: 13px;
    color: var(--color-text-primary);
    display: flex;
    gap: 10px;
    align-items: flex-start;
    line-height: 1.4;
  }

  .checkbox-row input {
    accent-color: var(--color-text-accent);
    margin-top: 3px;
    flex-shrink: 0;
  }

  .group {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .group legend {
    padding: 0 6px;
    font-size: 12px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 12px;
    align-items: center;
  }

  .field label {
    color: var(--color-text-secondary);
    font-size: 12px;
    text-align: right;
  }

  .field input[type='text'] {
    background: var(--color-bg-base);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .field input[type='text']:focus {
    border-color: var(--color-text-accent);
  }

  .field input[type='text']:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    color: var(--color-text-secondary);
  }

  .dir-row {
    display: flex;
    gap: 6px;
  }

  .browse {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    padding: 5px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }

  .browse:hover {
    background: var(--color-bg-hover);
  }
</style>
