// Item catalogue. Data-driven so it can be exported to an Unreal DataTable later (see docs/UE5_MIGRATION.md).

export interface ItemDef {
  id: string;
  name: string;
  nameHi: string;
  /** Consumed immediately on purchase (food) vs stored in inventory. */
  consumable: boolean;
  hunger?: number; // restores hunger points (0-100 scale)
  energy?: number; // restores energy points
  icon: string;
}

export const ITEMS: Record<string, ItemDef> = {
  cutting_chai: { id: 'cutting_chai', name: 'Cutting Chai', nameHi: 'कटिंग चाय', consumable: true, hunger: 3, energy: 12, icon: '☕' },
  masala_chai: { id: 'masala_chai', name: 'Masala Chai', nameHi: 'मसाला चाय', consumable: true, hunger: 4, energy: 15, icon: '☕' },
  vada_pav: { id: 'vada_pav', name: 'Vada Pav', nameHi: 'वड़ा पाव', consumable: true, hunger: 22, energy: 4, icon: '🍔' },
  samosa: { id: 'samosa', name: 'Samosa (2 pc)', nameHi: 'समोसा', consumable: true, hunger: 18, energy: 3, icon: '🥟' },
  pav_bhaji: { id: 'pav_bhaji', name: 'Pav Bhaji', nameHi: 'पाव भाजी', consumable: true, hunger: 45, energy: 6, icon: '🍛' },
  thali: { id: 'thali', name: 'Veg Thali', nameHi: 'थाली', consumable: true, hunger: 70, energy: 10, icon: '🍱' },
  biryani: { id: 'biryani', name: 'Chicken Biryani', nameHi: 'बिरयानी', consumable: true, hunger: 75, energy: 8, icon: '🍛' },
  filter_coffee: { id: 'filter_coffee', name: 'Filter Coffee', nameHi: 'फ़िल्टर कॉफ़ी', consumable: true, hunger: 2, energy: 20, icon: '☕' },
  cold_coffee: { id: 'cold_coffee', name: 'Cold Coffee', nameHi: 'कोल्ड कॉफ़ी', consumable: true, hunger: 8, energy: 18, icon: '🥤' },
  water_bottle: { id: 'water_bottle', name: 'Water Bottle (1L)', nameHi: 'पानी की बोतल', consumable: false, icon: '💧' },
  biscuits: { id: 'biscuits', name: 'Glucose Biscuits', nameHi: 'बिस्कुट', consumable: false, hunger: 10, icon: '🍪' },
  bread: { id: 'bread', name: 'Bread Loaf', nameHi: 'ब्रेड', consumable: false, hunger: 20, icon: '🍞' },
  rice_5kg: { id: 'rice_5kg', name: 'Rice (5 kg)', nameHi: 'चावल', consumable: false, icon: '🍚' },
  dal_1kg: { id: 'dal_1kg', name: 'Toor Dal (1 kg)', nameHi: 'दाल', consumable: false, icon: '🫘' },
  milk: { id: 'milk', name: 'Milk (500 ml)', nameHi: 'दूध', consumable: false, hunger: 8, icon: '🥛' },
  bananas: { id: 'bananas', name: 'Bananas (dozen)', nameHi: 'केले', consumable: false, hunger: 15, icon: '🍌' },
  mangoes: { id: 'mangoes', name: 'Alphonso Mangoes (1 kg)', nameHi: 'आम', consumable: false, hunger: 20, icon: '🥭' },
  umbrella: { id: 'umbrella', name: 'Umbrella', nameHi: 'छाता', consumable: false, icon: '☂️' },
  phone_recharge: { id: 'phone_recharge', name: 'Mobile Recharge (28 days)', nameHi: 'रिचार्ज', consumable: false, icon: '📶' },
  helmet: { id: 'helmet', name: 'ISI Helmet', nameHi: 'हेलमेट', consumable: false, icon: '⛑️' },
  medicine: { id: 'medicine', name: 'Paracetamol Strip', nameHi: 'दवाई', consumable: false, icon: '💊' },
  first_aid: { id: 'first_aid', name: 'First Aid Kit', nameHi: 'प्राथमिक चिकित्सा', consumable: false, icon: '🩹' },
  rail_ticket: { id: 'rail_ticket', name: 'Local Train Ticket (2nd class)', nameHi: 'टिकट', consumable: false, icon: '🎫' },
  rail_ticket_fc: { id: 'rail_ticket_fc', name: 'Local Train Ticket (1st class)', nameHi: 'प्रथम श्रेणी टिकट', consumable: false, icon: '🎫' },
  rail_pass: { id: 'rail_pass', name: 'Monthly Season Pass', nameHi: 'मासिक पास', consumable: false, icon: '🪪' },
  parcel: { id: 'parcel', name: 'Delivery Parcel', nameHi: 'पार्सल', consumable: false, icon: '📦' },
  shirt_formal: { id: 'shirt_formal', name: 'Formal Shirt', nameHi: 'फ़ॉर्मल शर्ट', consumable: false, icon: '👔' },
  tshirt: { id: 'tshirt', name: 'Graphic T-shirt', nameHi: 'टी-शर्ट', consumable: false, icon: '👕' },
  kurta: { id: 'kurta', name: 'Cotton Kurta', nameHi: 'कुर्ता', consumable: false, icon: '👘' },
  jeans: { id: 'jeans', name: 'Denim Jeans', nameHi: 'जींस', consumable: false, icon: '👖' },
  sneakers: { id: 'sneakers', name: 'Sneakers', nameHi: 'जूते', consumable: false, icon: '👟' },
  earphones: { id: 'earphones', name: 'Wireless Earphones', nameHi: 'ईयरफ़ोन', consumable: false, icon: '🎧' },
  powerbank: { id: 'powerbank', name: 'Power Bank', nameHi: 'पावर बैंक', consumable: false, icon: '🔋' },
  smartphone_upgrade: { id: 'smartphone_upgrade', name: 'New Smartphone', nameHi: 'स्मार्टफ़ोन', consumable: false, icon: '📱' },
  haircut: { id: 'haircut', name: 'Haircut', nameHi: 'हेयरकट', consumable: true, icon: '💈' },
  shave: { id: 'shave', name: 'Shave', nameHi: 'शेव', consumable: true, icon: '🪒' },
  gym_day: { id: 'gym_day', name: 'Gym Day Pass', nameHi: 'जिम पास', consumable: true, energy: -20, icon: '🏋️' },
  movie_ticket: { id: 'movie_ticket', name: 'Movie Ticket', nameHi: 'मूवी टिकट', consumable: false, icon: '🎬' },
  flowers: { id: 'flowers', name: 'Marigold Garland', nameHi: 'गेंदे की माला', consumable: false, icon: '🌼' },
  prasad: { id: 'prasad', name: 'Prasad', nameHi: 'प्रसाद', consumable: true, hunger: 5, icon: '🍬' },
};
