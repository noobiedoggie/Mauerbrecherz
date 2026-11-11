import { Preferences } from '@capacitor/preferences';
import { LEVEL_COUNT } from '../config/levels';
import { TOOLS } from '../config/tools';
import { UPGRADES } from '../config/upgrades';
import type { UpgradeId } from '../config/upgrades';

/**
 * Save - coins, tools, unlocked walls and the damage on every wall.
 *
 * Stored as one JSON blob with Capacitor Preferences (SharedPreferences on
 * Android, localStorage in the browser).
 */

// Key kept from the first version so existing saves carry over.
const KEY = 'mauerbrecher.save.v1';

/** Progress on one wall. Survives getting caught, cleared when the wall falls. */
export interface LevelProgress {
  /** Remaining wall HP, or null when the wall is untouched. */
  hp: number | null;
  /** Seconds spent on this wall so far (all attempts). */
  time: number;
  /** Caught at least once on this wall. */
  spotted: boolean;
  /** Bit i is set when coin pickup i was collected. */
  coinsTaken: number;
  /** Best star count ever earned (0-3). */
  stars: number;
  /** The wall has been broken at least once. */
  done: boolean;
}

export interface SaveData {
  coins: number;
  /** Tool ids. */
  owned: number[];
  equipped: number;
  /** Highest wall the player may enter (1-based). */
  unlockedLevel: number;
  /** Wall shown on the main menu. */
  currentLevel: number;
  levels: Record<number, LevelProgress>;
  /** Character upgrade levels (0 = not bought). */
  upgrades: Record<UpgradeId, number>;
  /** The wall-1 tutorial was finished or skipped. */
  tutorialDone: boolean;
  sound: boolean;
  vibration: boolean;
}

export function freshProgress(): LevelProgress {
  return { hp: null, time: 0, spotted: false, coinsTaken: 0, stars: 0, done: false };
}

export function freshSave(): SaveData {
  return {
    coins: 0,
    owned: [TOOLS[0].id],
    equipped: TOOLS[0].id,
    unlockedLevel: 1,
    currentLevel: 1,
    levels: {},
    upgrades: freshUpgrades(),
    tutorialDone: false,
    sound: true,
    vibration: true,
  };
}

function freshUpgrades(): Record<UpgradeId, number> {
  const out = {} as Record<UpgradeId, number>;
  for (const u of UPGRADES) out[u.id] = 0;
  return out;
}

/** Make sure a loaded blob has every field and sane values. */
function sanitize(raw: Partial<SaveData> | null): SaveData {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const data: SaveData = { ...base, ...raw };
  data.coins = Math.max(0, Math.floor(Number(data.coins) || 0));
  data.owned = Array.isArray(data.owned) ? data.owned.filter((id) => TOOLS.some((t) => t.id === id)) : [];
  if (!data.owned.includes(TOOLS[0].id)) data.owned.unshift(TOOLS[0].id);
  if (!data.owned.includes(data.equipped)) data.equipped = TOOLS[0].id;
  data.unlockedLevel = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(Number(data.unlockedLevel) || 1)));
  data.currentLevel = Math.max(1, Math.min(data.unlockedLevel, Math.floor(Number(data.currentLevel) || 1)));
  data.levels = data.levels && typeof data.levels === 'object' ? data.levels : {};
  for (const key of Object.keys(data.levels)) {
    data.levels[Number(key)] = { ...freshProgress(), ...data.levels[Number(key)] };
  }
  const ups = freshUpgrades();
  for (const u of UPGRADES) {
    const v = Math.floor(Number((data.upgrades as Partial<Record<UpgradeId, number>> | undefined)?.[u.id]) || 0);
    ups[u.id] = Math.max(0, Math.min(u.prices.length, v));
  }
  data.upgrades = ups;
  // Players who already beat wall 1 have clearly learned the controls.
  data.tutorialDone = data.tutorialDone === true || !!data.levels[1]?.done;
  data.sound = data.sound !== false;
  data.vibration = data.vibration !== false;
  return data;
}

export class Save {
  data: SaveData = freshSave();
  private timer: number | null = null;

  async load(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: KEY });
      this.data = sanitize(value ? (JSON.parse(value) as Partial<SaveData>) : null);
    } catch {
      this.data = freshSave();
    }
  }

  /** Progress record for a wall (created on first use). */
  level(id: number): LevelProgress {
    if (!this.data.levels[id]) this.data.levels[id] = freshProgress();
    return this.data.levels[id];
  }

  /** Write soon. Many calls in a row (one per punch) become a single write. */
  queue(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 400);
  }

  /** Write now (level end, app going to the background). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await Preferences.set({ key: KEY, value: JSON.stringify(this.data) });
    } catch {
      // Storage full or unavailable: the game keeps running from memory.
    }
  }

  async reset(): Promise<void> {
    const { sound, vibration } = this.data;
    this.data = { ...freshSave(), sound, vibration };
    await this.flush();
  }
}
