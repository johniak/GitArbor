<script lang="ts">
  import type { GraphRow } from '../types';

  type Props = {
    row: GraphRow;
    height?: number;
    laneWidth?: number;
    maxLanes?: number;
    isHead?: boolean;
  };

  let {
    row,
    height = 24,
    laneWidth = 16,
    maxLanes,
    isHead = false,
  }: Props = $props();

  let svgLanes = $derived(maxLanes ?? row.laneCount);

  const DOT_RADIUS = 4;

  function cx(lane: number): number {
    return lane * laneWidth + laneWidth / 2;
  }

  function cy(): number {
    return height / 2;
  }

  // Separate segments: lines first, then dots on top (SVG paint order = draw order)
  let pipes = $derived(row.segments.filter((s) => s.type === 'pipe'));
  let curvesDown = $derived(
    row.segments.filter(
      (s) =>
        s.type === 'merge-left' ||
        s.type === 'merge-right' ||
        s.type === 'fork',
    ),
  );
  let curvesUp = $derived(row.segments.filter((s) => s.type === 'converge'));
  let dot = $derived(row.segments.find((s) => s.type === 'dot'));

  // Line above dot: only if this lane was expected from a commit above (not a new branch tip)
  let hasLineAbove = $derived(!row.isNewLane);
  // Line below dot: only if this commit has parents (not a root commit)
  let hasLineBelow = $derived(!row.laneEndsHere);
</script>

<svg
  class="graph-cell"
  width={svgLanes * laneWidth}
  {height}
  viewBox="0 0 {svgLanes * laneWidth} {height}"
>
  <!-- Layer 1: Vertical pipes (background) -->
  <!-- Lines extend 1px past viewBox to avoid 1px seams between per-row SVGs
       on Linux (Chromium subpixel AA at SVG edges). -->
  {#each pipes as seg}
    {#if seg.type === 'pipe'}
      <line
        x1={cx(seg.lane)}
        y1={-1}
        x2={cx(seg.lane)}
        y2={height + 1}
        stroke={seg.color}
        stroke-width={2}
      />
    {/if}
  {/each}

  <!-- Layer 2: Dot lane vertical line (split: above dot + below dot) -->
  {#if dot && dot.type === 'dot'}
    {#if hasLineAbove}
      <line
        x1={cx(dot.lane)}
        y1={-1}
        x2={cx(dot.lane)}
        y2={cy() - DOT_RADIUS}
        stroke={dot.color}
        stroke-width={2}
      />
    {/if}
    {#if hasLineBelow}
      <line
        x1={cx(dot.lane)}
        y1={cy() + DOT_RADIUS}
        x2={cx(dot.lane)}
        y2={height + 1}
        stroke={dot.color}
        stroke-width={2}
      />
    {/if}
  {/if}

  <!-- Layer 3a: Merge/fork curves going DOWN (for merge commits) -->
  {#each curvesDown as seg}
    <path
      d="M {cx(seg.fromLane)} {cy()} C {cx(seg.fromLane)} {height + 1}, {cx(
        seg.toLane,
      )} {cy()}, {cx(seg.toLane)} {height + 1}"
      fill="none"
      stroke={seg.color}
      stroke-width={2}
    />
  {/each}

  <!-- Layer 3b: Converge curves going UP (for branches joining at common ancestor) -->
  {#each curvesUp as seg}
    <path
      d="M {cx(seg.fromLane)} {cy()} C {cx(seg.fromLane)} {-1}, {cx(
        seg.toLane,
      )} {cy()}, {cx(seg.toLane)} {-1}"
      fill="none"
      stroke={seg.color}
      stroke-width={2}
    />
  {/each}

  <!-- Layer 4: Dot (on top of everything) -->
  {#if dot && dot.type === 'dot'}
    <circle
      cx={cx(dot.lane)}
      cy={cy()}
      r={isHead ? 6 : DOT_RADIUS}
      fill={dot.color}
      stroke={isHead ? 'var(--color-text-white)' : 'none'}
      stroke-width={isHead ? 1.5 : 0}
    />
  {/if}
</svg>

<style>
  .graph-cell {
    display: block;
    flex-shrink: 0;
    /* Let the 1px overflow on lines/paths render past the SVG viewport so
       adjacent per-row SVGs overlap and never show a subpixel seam
       (Chromium on Linux with fractional scaling). */
    overflow: visible;
    pointer-events: none;
  }
</style>
