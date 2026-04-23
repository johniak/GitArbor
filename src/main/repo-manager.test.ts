import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDatabase,
  addRecentRepo,
  getRecentRepos,
  clearRecentRepos,
  getFavouriteRepos,
  isFavouriteRepo,
  setFavourite,
  type AppDatabase,
} from './db';

describe('Repository DB', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  it('adds a repo and retrieves it', () => {
    addRecentRepo(db, '/home/user/projects/my-repo');
    const repos = getRecentRepos(db);

    expect(repos).toHaveLength(1);
    expect(repos[0].path).toBe('/home/user/projects/my-repo');
    expect(repos[0].name).toBe('my-repo');
  });

  it('opening same repo twice updates lastOpenedAt, keeps one entry', () => {
    addRecentRepo(db, '/home/user/projects/repo');

    // Wait a tick so timestamp differs
    const first = getRecentRepos(db)[0].lastOpenedAt;

    // Simulate time passing
    addRecentRepo(db, '/home/user/projects/repo');
    const repos = getRecentRepos(db);

    expect(repos).toHaveLength(1);
    expect(repos[0].lastOpenedAt).toBeGreaterThanOrEqual(first);
  });

  it('recent list is ordered by lastOpenedAt DESC', () => {
    addRecentRepo(db, '/repo/a');
    addRecentRepo(db, '/repo/b');
    addRecentRepo(db, '/repo/c');

    // Re-open /repo/a — should be first now
    addRecentRepo(db, '/repo/a');

    const repos = getRecentRepos(db);
    expect(repos[0].path).toBe('/repo/a');
  });

  it('limits to 5 recent repos', () => {
    for (let i = 0; i < 15; i++) {
      addRecentRepo(db, `/repo/${i}`);
    }

    const repos = getRecentRepos(db);
    expect(repos).toHaveLength(5);
  });

  it('clear removes non-favourite repos', () => {
    addRecentRepo(db, '/repo/a');
    addRecentRepo(db, '/repo/b');

    clearRecentRepos(db);
    const repos = getRecentRepos(db);

    expect(repos).toHaveLength(0);
  });

  it('extracts name from path', () => {
    addRecentRepo(db, '/Users/johniak/Projects/gitarbor');
    const repos = getRecentRepos(db);

    expect(repos[0].name).toBe('gitarbor');
  });
});

describe('Favourite repositories', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  it('setFavourite marks a known repo and getFavouriteRepos returns it', () => {
    addRecentRepo(db, '/repo/a');

    expect(getFavouriteRepos(db)).toHaveLength(0);
    setFavourite(db, '/repo/a', true);
    const favs = getFavouriteRepos(db);
    expect(favs).toHaveLength(1);
    expect(favs[0].path).toBe('/repo/a');
    expect(favs[0].isFavourite).toBe(1);
  });

  it('setFavourite(false) removes from favourites but keeps the row in recent', () => {
    addRecentRepo(db, '/repo/a');
    setFavourite(db, '/repo/a', true);
    setFavourite(db, '/repo/a', false);

    expect(getFavouriteRepos(db)).toHaveLength(0);
    expect(getRecentRepos(db)).toHaveLength(1);
  });

  it('isFavouriteRepo reports current state (unknown, non-fav, fav)', () => {
    expect(isFavouriteRepo(db, '/unknown')).toBe(false);

    addRecentRepo(db, '/repo/a');
    expect(isFavouriteRepo(db, '/repo/a')).toBe(false);

    setFavourite(db, '/repo/a', true);
    expect(isFavouriteRepo(db, '/repo/a')).toBe(true);
  });

  it('getFavouriteRepos is sorted by name ascending', () => {
    addRecentRepo(db, '/work/charlie');
    addRecentRepo(db, '/work/alpha');
    addRecentRepo(db, '/work/bravo');
    setFavourite(db, '/work/charlie', true);
    setFavourite(db, '/work/alpha', true);
    setFavourite(db, '/work/bravo', true);

    const favs = getFavouriteRepos(db);
    expect(favs.map((r) => r.name)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('clearRecentRepos preserves favourites', () => {
    addRecentRepo(db, '/repo/fav');
    addRecentRepo(db, '/repo/throwaway');
    setFavourite(db, '/repo/fav', true);

    clearRecentRepos(db);

    expect(getRecentRepos(db).map((r) => r.path)).toEqual(['/repo/fav']);
    expect(getFavouriteRepos(db).map((r) => r.path)).toEqual(['/repo/fav']);
  });

  it('re-opening a repo via addRecentRepo preserves its favourite flag', () => {
    addRecentRepo(db, '/repo/a');
    setFavourite(db, '/repo/a', true);

    addRecentRepo(db, '/repo/a'); // upsert

    expect(isFavouriteRepo(db, '/repo/a')).toBe(true);
  });
});
