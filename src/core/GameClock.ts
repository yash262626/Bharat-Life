// In-game calendar/time. Pure logic (no DOM), unit-testable.

export const MINUTES_PER_DAY = 24 * 60;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export class GameClock {
  /** Total in-game minutes since day 1, 00:00. */
  totalMinutes: number;
  /** In-game minutes advanced per real second. */
  timeScale: number;
  paused = false;
  private onNewDay: ((day: number) => void)[] = [];

  constructor(startDay = 1, startMinute = 7 * 60 + 30, timeScale = 1) {
    this.totalMinutes = (startDay - 1) * MINUTES_PER_DAY + startMinute;
    this.timeScale = timeScale;
  }

  get day() { return Math.floor(this.totalMinutes / MINUTES_PER_DAY) + 1; }
  get minuteOfDay() { return this.totalMinutes - (this.day - 1) * MINUTES_PER_DAY; }
  get hour() { return this.minuteOfDay / 60; }
  get weekday() { return WEEKDAYS[(this.day - 1) % 7]; }
  get isWeekend() { return (this.day - 1) % 7 >= 5; }

  newDay(fn: (day: number) => void) { this.onNewDay.push(fn); }

  advance(realSeconds: number) {
    if (this.paused) return;
    this.advanceMinutes(realSeconds * this.timeScale);
  }

  advanceMinutes(min: number) {
    const before = this.day;
    this.totalMinutes += min;
    const after = this.day;
    for (let d = before + 1; d <= after; d++) for (const fn of this.onNewDay) fn(d);
  }

  /** Skip forward to the next occurrence of hour h (used for sleeping / work shifts). */
  skipTo(hour: number) {
    const target = hour * 60;
    let delta = target - this.minuteOfDay;
    if (delta <= 0) delta += MINUTES_PER_DAY;
    this.advanceMinutes(delta);
    return delta;
  }

  format(): string {
    const m = Math.floor(this.minuteOfDay);
    const h = Math.floor(m / 60), mm = m % 60;
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  isOpen(openHour: number, closeHour: number) {
    const h = this.hour;
    return openHour <= closeHour ? h >= openHour && h < closeHour : h >= openHour || h < closeHour;
  }
}
