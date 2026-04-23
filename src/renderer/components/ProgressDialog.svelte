<script lang="ts">
  type Props = {
    message: string;
  };

  let { message }: Props = $props();
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="dialog">
    <p class="message">{message}</p>
    <div class="progress-bar">
      <div class="progress-bar-fill"></div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 20px;
    width: 360px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .message {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-primary);
    line-height: 1.5;
  }

  .progress-bar {
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar-fill {
    width: 40%;
    height: 100%;
    background: var(--color-text-accent);
    border-radius: 2px;
    animation: indeterminate 1.5s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(350%);
    }
  }
</style>
