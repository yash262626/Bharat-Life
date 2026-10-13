// Mission definitions (data). The MissionManager interprets these; no mission logic is hardcoded
// in the gameplay loop. Coordinates refer to the Sagar Nagar layout.
import { rupees } from '../economy/money';
import type { GameEvents } from '../core/EventBus';

export type StepDef =
  | { kind: 'goto'; x: number; z: number; r: number; text: string; vehicle?: boolean }
  | { kind: 'event'; event: keyof GameEvents; match?: Record<string, unknown>; text: string; x?: number; z?: number }
  | { kind: 'say'; lines: [string, string][] }
  | { kind: 'action'; action: string; args?: Record<string, unknown> };

export interface MissionDef {
  id: string;
  title: string;
  titleHi: string;
  type: 'story' | 'side' | 'job';
  description: string;
  requires: string[];
  steps: StepDef[];
  reward: { cash?: number; bank?: number; label?: string };
  timeLimitSec?: number;
  /** Start automatically once requirements are met (story flow). */
  auto?: boolean;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'm_arrival', title: 'Naya Shehar', titleHi: 'नया शहर', type: 'story', auto: true, requires: [],
    description: 'You have just stepped off the local at Sagar Nagar with one bag and big dreams.',
    steps: [
      { kind: 'say', lines: [['You', 'Sagar Nagar... Mumbai. Finally.'], ['Phone (Mama ji)', 'Beta, pahunch gaye? Station ke bahar aao, pehle chai pi lo. Phir garage aana.']] },
      { kind: 'goto', x: 159, z: 0, r: 6, text: 'Walk out of Sagar Nagar station (through the booking hall)' },
    ],
    reward: { cash: 0 },
  },
  {
    id: 'm_chai', title: 'Pehli Chai', titleHi: 'पहली चाय', type: 'story', auto: true, requires: ['m_arrival'],
    description: 'Nothing starts in Mumbai without a cutting chai.',
    steps: [
      { kind: 'goto', x: -62, z: -106.5, r: 4, text: "Find Raju's Tea Stall on Bazaar Gali" },
      { kind: 'event', event: 'shop:purchase', match: { shopId: 'raju_chai' }, text: "Buy a chai at Raju's Tea Stall (E)", x: -62, z: -106.5 },
      { kind: 'say', lines: [['Raju bhai', 'Naya hai kya? Sharma garage Gokhale Road pe hai, seedha jao.']] },
    ],
    reward: { cash: 0 },
  },
  {
    id: 'm_scooter', title: "Mama ji's Scooter", titleHi: 'मामा जी का स्कूटर', type: 'story', auto: true, requires: ['m_chai'],
    description: 'Sharma Mama runs a garage and has an old scooter for you.',
    steps: [
      { kind: 'goto', x: -134, z: 96, r: 5, text: 'Go to Sharma Auto Works on Gokhale Road' },
      { kind: 'event', event: 'npc:talk', match: { npcId: 'sharma_mama' }, text: 'Walk into the garage and talk to Sharma Mama (E)', x: -134, z: 75 },
      { kind: 'action', action: 'giveScooter' },
      { kind: 'say', lines: [['Sharma Mama', 'Ye lo, purana Chetna hai, par dil se chalta hai. Petrol khatam hai — pehle Sagar Fuels jao.'], ['Sharma Mama', 'Helmet pehenna, Mumbai traffic mazaak nahi hai!']] },
      { kind: 'event', event: 'vehicle:enter', match: { type: 'chetak_scooter' }, text: 'Get on the scooter (F)' },
      { kind: 'event', event: 'vehicle:refuel', text: 'Ride to Sagar Fuels and refuel (E at a pump)', x: -204, z: 26 },
    ],
    reward: { cash: rupees(200), label: 'Mama ji ka shagun' },
  },
  {
    id: 'm_firstgig', title: 'Pehla Order', titleHi: 'पहला ऑर्डर', type: 'story', auto: true, requires: ['m_scooter'],
    description: 'Money is tight. DabbaDash pays riders per delivery — take your first order.',
    steps: [
      { kind: 'say', lines: [['DabbaDash', 'Welcome rider! New order: 2 x Veg Thali from Hotel Annapurna to Sea Breeze Towers.']] },
      { kind: 'goto', x: -80, z: -9.5, r: 5, text: 'Pick up the order at Hotel Annapurna (Tilak Marg)' },
      { kind: 'action', action: 'pickupParcel' },
      { kind: 'goto', x: -219.5, z: -212, r: 6, text: 'Deliver to Sea Breeze Towers (Sagar Setu Marg) before time runs out' },
      { kind: 'action', action: 'dropParcel' },
    ],
    reward: { bank: rupees(85), label: 'DabbaDash payout + tip' },
    timeLimitSec: 420,
  },
  {
    id: 'm_interview', title: 'Naukri ka Interview', titleHi: 'नौकरी का इंटरव्यू', type: 'story', auto: true, requires: ['m_firstgig'],
    description: 'Infinity Tower is hiring data-entry associates. Interviews 10 AM – 5 PM.',
    steps: [
      { kind: 'say', lines: [['Message (HR, Infinity Tower)', 'Walk-in interviews today, 10 AM to 5 PM, 3rd floor. Bring a smile!']] },
      { kind: 'event', event: 'job:hired', text: 'Go to Infinity Tower on Nehru Road (E at the entrance) and clear the interview', x: 12, z: -161 },
    ],
    reward: { cash: 0 },
  },
  {
    id: 'm_room', title: 'Apna Ghar', titleHi: 'अपना घर', type: 'story', auto: true, requires: ['m_firstgig'],
    description: 'Sleeping at the station is not a plan. Rent a room.',
    steps: [
      { kind: 'event', event: 'property:rent', text: 'Rent a room: phone (Tab) → Ghar Dekho, or visit Ghar Dekho Realty', x: 118, z: -92 },
      { kind: 'goto', x: -107, z: 118, r: 3, text: 'Go to your room at Shanti Niwas Chawl (Gokhale Road)' },
    ],
    reward: { cash: 0 },
  },
];

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);
