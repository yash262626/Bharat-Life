// Data-driven shop definitions. New shops are added here; the ShopSystem and CityBuilder read them.
import { rupees } from '../economy/money';

export type ShopKind =
  | 'tea' | 'street_food' | 'kirana' | 'restaurant' | 'cafe' | 'clothing' | 'electronics' | 'pharmacy'
  | 'bank' | 'barber' | 'gym' | 'fuel' | 'garage' | 'showroom' | 'tickets' | 'fruit' | 'realestate' | 'hospital' | 'mall';

/** Physical form in the world. 'storefront' = open-front shop room; 'stall' = street stall/cart; 'counter' = handled by a landmark. */
export type ShopForm = 'storefront' | 'stall' | 'cart' | 'counter';

export interface ShopItem { itemId: string; price: number; qty?: number }
export interface ShopDef {
  id: string;
  name: string;
  nameHi: string;
  kind: ShopKind;
  form: ShopForm;
  /** Front-centre position on the footpath where the player interacts. */
  x: number;
  z: number;
  /** Direction the shop opens towards (the street). */
  facing: 'N' | 'S' | 'E' | 'W';
  width: number;
  depth: number;
  open: number; // hour
  close: number; // hour
  keeper: string; // shopkeeper NPC name
  greeting: string;
  items: ShopItem[];
  signStyle: number;
}

export const SHOPS: ShopDef[] = [
  {
    id: 'raju_chai', name: "Raju's Tea Stall", nameHi: 'राजू टी स्टॉल', kind: 'tea', form: 'stall', x: -62, z: -108.3, facing: 'S',
    width: 2.6, depth: 1.8, open: 5, close: 23, keeper: 'Raju bhai', greeting: 'Aao bhai, garam chai!', signStyle: 2,
    items: [{ itemId: 'cutting_chai', price: rupees(12) }, { itemId: 'masala_chai', price: rupees(20) }, { itemId: 'biscuits', price: rupees(10) }],
  },
  {
    id: 'ganesh_vadapav', name: 'Ganesh Vada Pav', nameHi: 'गणेश वडा पाव', kind: 'street_food', form: 'stall', x: 170, z: -38, facing: 'W',
    width: 2.8, depth: 2, open: 7, close: 23, keeper: 'Ganesh kaka', greeting: 'Vada pav ekdum garam hai!', signStyle: 5,
    items: [{ itemId: 'vada_pav', price: rupees(20) }, { itemId: 'samosa', price: rupees(25) }, { itemId: 'cutting_chai', price: rupees(12) }],
  },
  {
    id: 'shree_kirana', name: 'Shree Ganesh Kirana', nameHi: 'श्री गणेश किराना', kind: 'kirana', form: 'storefront', x: 26, z: -92.2, facing: 'N',
    width: 7, depth: 9, open: 7, close: 22.5, keeper: 'Mehul bhai', greeting: 'Haan ji, kya chahiye?', signStyle: 1,
    items: [
      { itemId: 'water_bottle', price: rupees(20) }, { itemId: 'biscuits', price: rupees(10) }, { itemId: 'bread', price: rupees(45) },
      { itemId: 'milk', price: rupees(32) }, { itemId: 'rice_5kg', price: rupees(380) }, { itemId: 'dal_1kg', price: rupees(165) },
      { itemId: 'phone_recharge', price: rupees(299) }, { itemId: 'umbrella', price: rupees(250) },
    ],
  },
  {
    id: 'annapurna', name: 'Hotel Annapurna', nameHi: 'हॉटेल अन्नपूर्णा', kind: 'restaurant', form: 'storefront', x: -80, z: -11.4, facing: 'S',
    width: 12, depth: 12, open: 7, close: 23.5, keeper: 'Shetty anna', greeting: 'Welcome! Thali ready hai.', signStyle: 9,
    items: [
      { itemId: 'thali', price: rupees(160) }, { itemId: 'pav_bhaji', price: rupees(120) }, { itemId: 'biryani', price: rupees(220) },
      { itemId: 'filter_coffee', price: rupees(35) }, { itemId: 'masala_chai', price: rupees(25) },
    ],
  },
  {
    id: 'kaafi_cafe', name: 'Kaafi Kadak Cafe', nameHi: 'काफ़ी कड़क कैफ़े', kind: 'cafe', form: 'storefront', x: 48, z: 11.4, facing: 'N',
    width: 10, depth: 10, open: 9, close: 24, keeper: 'Tanya', greeting: 'Hi! What can I get you?', signStyle: 7,
    items: [{ itemId: 'cold_coffee', price: rupees(140) }, { itemId: 'filter_coffee', price: rupees(90) }, { itemId: 'samosa', price: rupees(60) }],
  },
  {
    id: 'rangoli', name: 'Rangoli Garments', nameHi: 'रंगोली गारमेंट्स', kind: 'clothing', form: 'storefront', x: -142, z: -92.2, facing: 'N',
    width: 9, depth: 10, open: 10.5, close: 21.5, keeper: 'Farida aunty', greeting: 'Naya stock aaya hai, dekh lo!', signStyle: 6,
    items: [
      { itemId: 'tshirt', price: rupees(399) }, { itemId: 'shirt_formal', price: rupees(899) }, { itemId: 'kurta', price: rupees(749) },
      { itemId: 'jeans', price: rupees(1299) }, { itemId: 'sneakers', price: rupees(1799) },
    ],
  },
  {
    id: 'sai_mobile', name: 'Sai Mobile Gallery', nameHi: 'साई मोबाइल गैलरी', kind: 'electronics', form: 'storefront', x: -114, z: -92.2, facing: 'N',
    width: 6, depth: 8, open: 10, close: 21.5, keeper: 'Imran', greeting: 'Best price guarantee boss!', signStyle: 8,
    items: [
      { itemId: 'earphones', price: rupees(1499) }, { itemId: 'powerbank', price: rupees(999) }, { itemId: 'phone_recharge', price: rupees(299) },
      { itemId: 'smartphone_upgrade', price: rupees(14999) },
    ],
  },
  {
    id: 'jeevan_medical', name: 'Jeevan Medical', nameHi: 'जीवन मेडिकल', kind: 'pharmacy', form: 'storefront', x: -10.1, z: -54, facing: 'E',
    width: 7, depth: 8, open: 8, close: 23, keeper: 'Dr. Kulkarni', greeting: 'Prescription hai?', signStyle: 3,
    items: [{ itemId: 'medicine', price: rupees(35) }, { itemId: 'first_aid', price: rupees(450) }, { itemId: 'water_bottle', price: rupees(20) }],
  },
  {
    id: 'sagar_bank', name: 'Sagar Co-op Bank & ATM', nameHi: 'सागर को-ऑप बैंक', kind: 'bank', form: 'storefront', x: -48, z: 11.4, facing: 'N',
    width: 12, depth: 12, open: 0, close: 24, keeper: 'Bank officer', greeting: 'ATM is available 24x7.', signStyle: 8,
    items: [],
  },
  {
    id: 'style_point', name: 'Style Point Salon', nameHi: 'स्टाइल पॉइंट सैलून', kind: 'barber', form: 'storefront', x: -25, z: 101.4, facing: 'S',
    width: 6, depth: 8, open: 9, close: 21, keeper: 'Salim', greeting: 'Baal ya daadi, boss?', signStyle: 4,
    items: [{ itemId: 'haircut', price: rupees(150) }, { itemId: 'shave', price: rupees(60) }],
  },
  {
    id: 'iron_gym', name: 'Iron Temple Gym', nameHi: 'आयरन टेम्पल जिम', kind: 'gym', form: 'storefront', x: 10.1, z: 50, facing: 'W',
    width: 10, depth: 14, open: 5, close: 23, keeper: 'Coach Vikram', greeting: 'Chalo, aaj leg day!', signStyle: 7,
    items: [{ itemId: 'gym_day', price: rupees(150) }],
  },
  {
    id: 'phal_cart', name: 'Phal Wala', nameHi: 'फल वाला', kind: 'fruit', form: 'cart', x: -20, z: -94.3, facing: 'N',
    width: 2.2, depth: 1.2, open: 7, close: 21, keeper: 'Ramesh', greeting: 'Taaza aam, taaza kela!', signStyle: 3,
    items: [{ itemId: 'bananas', price: rupees(60) }, { itemId: 'mangoes', price: rupees(400) }],
  },
  {
    id: 'chowpatty_bhaji', name: 'Chowpatty Pav Bhaji', nameHi: 'चौपाटी पाव भाजी', kind: 'street_food', form: 'stall', x: -251, z: -30, facing: 'E',
    width: 3, depth: 2, open: 16, close: 24, keeper: 'Bablu', greeting: 'Butter maar ke, boss?', signStyle: 0,
    items: [{ itemId: 'pav_bhaji', price: rupees(110) }, { itemId: 'vada_pav', price: rupees(25) }, { itemId: 'cold_coffee', price: rupees(70) }],
  },
  {
    id: 'mandir_flowers', name: 'Phool Bhandar', nameHi: 'फूल भंडार', kind: 'fruit', form: 'cart', x: -26, z: -105.9, facing: 'S',
    width: 2, depth: 1.1, open: 5, close: 21, keeper: 'Kamla bai', greeting: 'Bappa ke liye phool le jao.', signStyle: 2,
    items: [{ itemId: 'flowers', price: rupees(40) }, { itemId: 'prasad', price: rupees(21) }],
  },
  {
    id: 'ghar_dekho', name: 'Ghar Dekho Realty', nameHi: 'घर देखो रियल्टी', kind: 'realestate', form: 'storefront', x: 118, z: -92.2, facing: 'N',
    width: 7, depth: 9, open: 10, close: 20, keeper: 'Pinto uncle', greeting: 'Room, flat, shop — sab milega!', signStyle: 1,
    items: [],
  },
  // Landmark-backed counters (geometry built by CityBuilder landmarks).
  {
    id: 'petrol', name: 'Sagar Fuels', nameHi: 'सागर फ़्यूल्स', kind: 'fuel', form: 'counter', x: -204, z: 26, facing: 'W',
    width: 0, depth: 0, open: 0, close: 24, keeper: 'Pump attendant', greeting: 'Kitne ka daalu? Zero dekh lo sir.', signStyle: 0, items: [],
  },
  {
    id: 'garage', name: 'Sharma Auto Works', nameHi: 'शर्मा ऑटो वर्क्स', kind: 'garage', form: 'counter', x: -134, z: 97, facing: 'S',
    width: 0, depth: 0, open: 8, close: 21, keeper: 'Sharma Mama', greeting: 'Aa gaya beta! Gaadi ka kya haal?', signStyle: 0, items: [],
  },
  {
    id: 'showroom', name: 'Rajhans Motors', nameHi: 'राजहंस मोटर्स', kind: 'showroom', form: 'counter', x: 80, z: -12, facing: 'S',
    width: 0, depth: 0, open: 10, close: 20, keeper: 'Ms. Kapoor', greeting: 'Welcome to Rajhans Motors. Test drive?', signStyle: 0, items: [],
  },
  {
    id: 'ticket_window', name: 'Booking Office', nameHi: 'टिकट घर', kind: 'tickets', form: 'counter', x: 175, z: -12, facing: 'S',
    width: 0, depth: 0, open: 4, close: 24, keeper: 'Booking clerk', greeting: 'Kahan ka ticket?', signStyle: 0, items: [],
  },
  {
    id: 'hospital_desk', name: 'Lifeline Hospital OPD', nameHi: 'लाइफ़लाइन अस्पताल', kind: 'hospital', form: 'counter', x: 117, z: 37, facing: 'N',
    width: 0, depth: 0, open: 0, close: 24, keeper: 'Reception', greeting: 'OPD fee ₹300. Please take a token.', signStyle: 0, items: [],
  },
];

export const shopById = (id: string) => SHOPS.find((s) => s.id === id);
