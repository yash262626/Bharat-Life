// Typed publish/subscribe bus decoupling gameplay systems (missions listen to shops, trains, etc.).

export interface GameEvents {
  'shop:purchase': { shopId: string; itemId: string; price: number };
  'zone:enter': { zoneId: string };
  'vehicle:enter': { vehicleId: string; type: string; owned: boolean };
  'vehicle:exit': { vehicleId: string };
  'vehicle:refuel': { vehicleId: string; litres: number; cost: number };
  'train:board': { station: string };
  'train:alight': { station: string; fromStation: string };
  'ticket:buy': { kind: string; price: number };
  'mission:start': { missionId: string };
  'mission:complete': { missionId: string; reward: number };
  'mission:fail': { missionId: string; reason: string };
  'property:rent': { propertyId: string };
  'property:buy': { propertyId: string };
  'vehicle:buy': { model: string };
  'job:hired': { careerId: string };
  'job:shift': { careerId: string; pay: number };
  'npc:talk': { npcId: string };
  'player:sleep': { hours: number };
  'delivery:pickup': { orderId: string };
  'delivery:dropoff': { orderId: string };
  'ride:complete': { fare: number };
  'notify': { title: string; body?: string; kind?: 'info' | 'money' | 'mission' | 'warn' };
  'money:changed': { cash: number; bank: number };
  'time:newday': { day: number };
  'interior:enter': { id: string };
  'interior:exit': { id: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] handler for ${String(type)} failed`, err);
      }
    }
  }
}
