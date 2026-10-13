// Global economy tuning. All values are adjustable game-balance numbers, NOT real market quotes.
import { rupees } from '../economy/money';

export const ECONOMY = {
  startingCash: rupees(1500),
  startingBank: rupees(3500),
  /** Petrol price per litre (configurable; region-appropriate placeholder). */
  petrolPerLitre: rupees(104.5),
  cngPerKg: rupees(76),
  /** Auto-rickshaw meter: minimum fare covers first 1.5 km, then per-km. */
  autoMinFare: rupees(26),
  autoPerKm: rupees(17),
  taxiMinFare: rupees(31),
  taxiPerKm: rupees(21),
  busFare: rupees(10),
  /** Ticket-less travel penalty. */
  ticketlessFine: rupees(250),
  /** Garage repair cost per damage point (0-100). */
  repairPerPoint: rupees(45),
  /** Hospital charges when the player collapses. */
  hospitalBill: rupees(1200),
  /** Delivery gig pay: base + per 100 m, plus a tip for on-time. */
  deliveryBase: rupees(35),
  deliveryPer100m: rupees(2.2),
  deliveryOnTimeTip: rupees(20),
  /** Passenger fare share when the player drives an auto for hire. */
  autoRentPerDay: rupees(350),
};

/** Local train fares by number of stations travelled (2nd class / 1st class). */
export function railFare(stationsTravelled: number, firstClass: boolean) {
  const base = stationsTravelled <= 2 ? 5 : stationsTravelled <= 4 ? 10 : 15;
  return rupees(firstClass ? base * 10 : base);
}
