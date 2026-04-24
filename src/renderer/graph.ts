import type {
  Commit,
  GraphRow,
  GraphSegment,
  GraphState,
  GraphLane,
} from './types';

/**
 * Lane colors — distinct, visible on dark background. Cycles when exhausted.
 */
const LANE_COLORS = [
  '#4a9eeb', // blue
  '#f97f5e', // coral / orange
  '#4fc98d', // emerald green
  '#f5c23e', // amber / gold
  '#5ec8c2', // teal
  '#a08ad3', // violet / purple
  '#3b82f6', // deep blue
  '#e879a9', // pink
  '#c4e860', // lime
  '#38bdf8', // sky blue
];

function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length];
}

/**
 * Create a fresh graph state (for the first page of commits).
 */
export function createGraphState(): GraphState {
  return { lanes: [] };
}

/**
 * Compute graph rows incrementally. Call with successive pages of commits.
 * Returns the rows for the given commits and the updated state for the next page.
 *
 * Algorithm (per commit, top-to-bottom = newest first):
 * 1. Find the lane expecting this commit's hash → that's its column.
 *    If none, allocate a new lane (first commit or new branch head).
 * 2. Draw vertical pipes for all other active lanes.
 * 3. Draw the commit dot on its lane.
 * 4. First parent inherits the current lane.
 * 5. Additional parents (merge): draw curve to existing lane, or fork a new lane.
 * 6. Compact trailing null lanes.
 */
export function computeGraphIncremental(
  commits: Commit[],
  state: GraphState,
): { rows: GraphRow[]; state: GraphState } {
  const lanes: (GraphLane | null)[] = [
    ...state.lanes.map((l) => (l ? { ...l } : null)),
  ];
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const segments: GraphSegment[] = [];
    const hash = commit.hash;

    // 1. Find lane expecting this commit
    let commitLane = lanes.findIndex((l) => l !== null && l.hash === hash);
    const isNewLane = commitLane === -1;

    if (isNewLane) {
      // New lane — find an empty slot or append
      commitLane = lanes.findIndex((l) => l === null);
      if (commitLane === -1) {
        commitLane = lanes.length;
        lanes.push(null);
      }
      lanes[commitLane] = { hash, color: laneColor(commitLane) };
    }

    const commitColor = lanes[commitLane]!.color;

    // 1.5 Close other lanes that also expected this commit (converging branches)
    // Draw curve UPWARD from commit dot to the closing lane (connects to pipe above)
    for (let i = 0; i < lanes.length; i++) {
      if (i !== commitLane && lanes[i] !== null && lanes[i]!.hash === hash) {
        segments.push({
          type: 'converge',
          fromLane: commitLane,
          toLane: i,
          color: lanes[i]!.color,
        });
        lanes[i] = null;
      }
    }

    // 2. Draw pipes for all remaining active lanes
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] !== null && i !== commitLane) {
        segments.push({ type: 'pipe', lane: i, color: lanes[i]!.color });
      }
    }

    // 3. Draw the commit dot
    segments.push({ type: 'dot', lane: commitLane, color: commitColor });

    // 4-5. Handle parents
    const parents = commit.parents;

    if (parents.length === 0) {
      // Root commit — lane ends
      lanes[commitLane] = null;
    } else {
      // First parent continues in the same lane
      lanes[commitLane] = { hash: parents[0], color: commitColor };

      // Additional parents (merge commits)
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p];

        // Check if parent is already expected in another lane
        const existingLane = lanes.findIndex(
          (l) => l !== null && l.hash === parentHash,
        );

        if (existingLane !== -1) {
          // Merge curve to existing lane
          const type = existingLane < commitLane ? 'merge-left' : 'merge-right';
          segments.push({
            type,
            fromLane: commitLane,
            toLane: existingLane,
            color: lanes[existingLane]!.color,
          });
        } else {
          // Fork: new lane for this parent
          let newLane = lanes.findIndex((l) => l === null);
          if (newLane === -1) {
            newLane = lanes.length;
            lanes.push(null);
          }
          const forkColor = laneColor(newLane);
          lanes[newLane] = { hash: parentHash, color: forkColor };
          segments.push({
            type: 'fork',
            fromLane: commitLane,
            toLane: newLane,
            color: forkColor,
          });
        }
      }
    }

    // 6. Compact trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }

    rows.push({
      segments,
      laneCount: Math.max(lanes.length, commitLane + 1),
      commitLane,
      commitColor,
      laneEndsHere: parents.length === 0,
      isNewLane,
    });
  }

  return {
    rows,
    state: { lanes: lanes.map((l) => (l ? { ...l } : null)) },
  };
}

/**
 * Convenience: compute graph for all commits at once.
 */
export function computeGraph(commits: Commit[]): GraphRow[] {
  const { rows } = computeGraphIncremental(commits, createGraphState());
  return rows;
}
