// Stackable item inventory. Item metadata lives in config/items.ts.

import { ITEMS } from '../config/items';

export class Inventory {
  items = new Map<string, number>();

  add(id: string, qty = 1) {
    if (!ITEMS[id]) throw new Error(`Unknown item ${id}`);
    this.items.set(id, (this.items.get(id) ?? 0) + qty);
  }

  remove(id: string, qty = 1): boolean {
    const have = this.items.get(id) ?? 0;
    if (have < qty) return false;
    if (have === qty) this.items.delete(id);
    else this.items.set(id, have - qty);
    return true;
  }

  count(id: string) { return this.items.get(id) ?? 0; }
  has(id: string) { return this.count(id) > 0; }

  list() {
    return [...this.items.entries()].map(([id, qty]) => ({ id, qty, def: ITEMS[id] }));
  }

  serialize(): Record<string, number> { return Object.fromEntries(this.items); }

  load(data: Record<string, number>) {
    this.items.clear();
    for (const [id, qty] of Object.entries(data)) {
      if (ITEMS[id] && Number.isInteger(qty) && qty > 0) this.items.set(id, qty);
    }
  }
}
