<script lang="ts">
  type Props = {
    direction: 'horizontal' | 'vertical';
    onResize: (delta: number) => void;
  };

  let { direction, onResize }: Props = $props();

  let dragging = $state(false);
  let startPos = 0;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    startPos = direction === 'horizontal' ? e.clientX : e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPos;
    startPos = currentPos;
    onResize(delta);
  }

  function onPointerUp() {
    dragging = false;
  }
</script>

<div
  class="splitter splitter-{direction}"
  class:dragging
  role="separator"
  aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
></div>

<style>
  .splitter {
    flex-shrink: 0;
    background: var(--color-border);
    transition: background 0.15s;
  }

  .splitter:hover,
  .splitter.dragging {
    background: var(--color-text-accent);
  }

  .splitter-horizontal {
    width: var(--splitter-size);
    cursor: col-resize;
  }

  .splitter-vertical {
    height: var(--splitter-size);
    cursor: row-resize;
  }
</style>
