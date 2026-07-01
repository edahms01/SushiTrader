import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Modal,
  StatusBar,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Svg, Path, Polyline, Circle, Defs, Pattern, Rect, LinearGradient, Stop } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { ShipporiMinchoB1_700Bold } from '@expo-google-fonts/shippori-mincho-b1';
import {
  ZenKakuGothicNew_400Regular,
  ZenKakuGothicNew_700Bold,
  ZenKakuGothicNew_900Black,
} from '@expo-google-fonts/zen-kaku-gothic-new';

const CITIES = [
  { name: 'Edo', kanji: '江', jp: '江戸', emoji: '🏯', population: 1200000 },
  { name: 'Osaka', kanji: '坂', jp: '大坂', emoji: '⛩️', population: 900000 },
  { name: 'Kyoto', kanji: '京', jp: '京都', emoji: '🎋', population: 750000 },
  { name: 'Hokkaido', kanji: '北', jp: '北海道', emoji: '⛰️', population: 500000 },
  { name: 'Okinawa', kanji: '沖', jp: '沖縄', emoji: '🌊', population: 400000 },
  { name: 'Nagoya', kanji: '名', jp: '名古屋', emoji: '🏘️', population: 800000 },
  { name: 'Fukuoka', kanji: '福', jp: '福岡', emoji: '🌸', population: 600000 },
];

// Distance matrix in hours (realistic Japan distances, simplified)
const TRAVEL_DISTANCES = {
  '0-1': 6, '0-2': 8, '0-3': 16, '0-4': 18, '0-5': 7, '0-6': 14,
  '1-0': 8, '1-2': 3, '1-3': 18, '1-4': 20, '1-5': 7, '1-6': 12,
  '2-0': 8, '2-1': 3, '2-3': 16, '2-4': 22, '2-5': 5, '2-6': 14,
  '3-0': 16, '3-1': 18, '3-2': 16, '3-4': 24, '3-5': 18, '3-6': 20,
  '4-0': 18, '4-1': 20, '4-2': 22, '4-3': 24, '4-5': 20, '4-6': 16,
  '5-0': 7, '5-1': 7, '5-2': 5, '5-3': 18, '5-4': 20, '5-6': 12,
  '6-0': 14, '6-1': 12, '6-2': 14, '6-3': 20, '6-4': 16, '6-5': 12,
};

const getTravelTime = (fromIdx, toIdx) => {
  const key = `${fromIdx}-${toIdx}`;
  const baseTime = TRAVEL_DISTANCES[key] || 10;
  const variance = Math.floor(Math.random() * 4) - 2; // ±2 hours
  return Math.max(1, baseTime + variance);
};

const SUSHI_TYPES = [
  { name: 'Maguro', kanji: '鮪', en: 'Bluefin Tuna', emoji: '🐟', basePrice: 160, category: 'fish' },
  { name: 'Sake', kanji: '鮭', en: 'Salmon', emoji: '🐠', basePrice: 20, category: 'fish' },
  { name: 'Ebi', kanji: '蝦', en: 'Shrimp', emoji: '🦐', basePrice: 30, category: 'fish' },
  { name: 'Unagi', kanji: '鰻', en: 'Eel', emoji: '🐍', basePrice: 95, category: 'fish' },
  { name: 'Ikura', kanji: '卵', en: 'Salmon Roe', emoji: '🔴', basePrice: 85, category: 'fish' },
  { name: 'Tako', kanji: '蛸', en: 'Octopus', emoji: '🐙', basePrice: 32, category: 'fish' },
  { name: 'Rice', kanji: '米', en: 'Rice', emoji: '🍚', basePrice: 6, category: 'ingredient' },
  { name: 'Nori', kanji: '苔', en: 'Seaweed', emoji: '🟢', basePrice: 3, category: 'ingredient' },
];

const RESTAURANTS = [
  { id: 1, name: 'Small Stand',      kanji: '屋台', holdingKanji: '屋', cost: 5000,   capacity: 50,  dailyRevenue: 500   },
  { id: 2, name: 'Local Restaurant', kanji: '食堂', holdingKanji: '膳', cost: 15000,  capacity: 150, dailyRevenue: 1500  },
  { id: 3, name: 'Premium Sushi Bar',kanji: '鮨屋', holdingKanji: '鮨', cost: 40000,  capacity: 300, dailyRevenue: 4000  },
  { id: 4, name: 'Sushi Palace',     kanji: '御殿', holdingKanji: '殿', cost: 100000, capacity: 500, dailyRevenue: 10000 },
];

const REAL_MS_PER_GAME_HOUR = 3600000;
const GAME_HOURS_PER_DAY = 24;
const STORAGE_KEY = 'sushitrader:gamestate';

const PRICE_CONFIG = {
  volatilityBand: 0.20,
  floorRatio: 0.5,
  noisePeriodsHours: [41, 17, 7],
  anchorDriftBand: 0.15,
  anchorDriftPeriodsDays: [57, 23],
  timeOfDayAmplitude: 0.12,
  timeOfDayPeakHour: 18,
  arrivalDepth: 0.08,
  arrivalSigmaHours: 2.5,
};

const MARKET_DEPTH = {
  freeUnits: 5,        // selling up to 5 has NO bulk reduction
  impactSlope: 0.005,  // reduction added per unit sold beyond freeUnits
  maxImpact: 0.15,     // never reduce more than 15%
};

// SEAM: per-good depth override; empty = uniform (uses MARKET_DEPTH defaults).
const MARKET_DEPTH_BY_GOOD = {};

const ARRIVAL_HOURS = {
  Maguro: 6, Sake: 6, Ebi: 6, Unagi: 6, Ikura: 6, Tako: 6, Rice: 6, Nori: 6,
};

const MARKET_PERIODS = [
  { key: 'dawn',    label: 'Dawn',    startHour: 4,  endHour: 9  },
  { key: 'midday',  label: 'Midday',  startHour: 9,  endHour: 16 },
  { key: 'evening', label: 'Evening', startHour: 16, endHour: 20 },
  { key: 'night',   label: 'Night',   startHour: 20, endHour: 4  },
];

const REGIONAL_MODIFIERS = {
  0: { // Edo — capital, huge demand; cheap nori (Asakusa beds)
    Maguro: 1.25, Sake: 1.10, Ebi: 1.10, Unagi: 0.95, Ikura: 1.10, Tako: 1.10, Rice: 1.05, Nori: 0.80,
  },
  1: { // Osaka — merchant hub; signature cheap octopus (Akashi / takoyaki)
    Maguro: 1.15, Sake: 1.15, Ebi: 1.00, Unagi: 1.05, Ikura: 1.15, Tako: 0.70, Rice: 1.00, Nori: 0.95,
  },
  2: { // Kyoto — inland, no coast; sea fish dear, a selling market
    Maguro: 1.30, Sake: 1.25, Ebi: 1.20, Unagi: 1.10, Ikura: 1.25, Tako: 1.10, Rice: 1.00, Nori: 1.20,
  },
  3: { // Hokkaido — cold north; cheap salmon/ikura/shrimp; pricey eel/rice
    Maguro: 0.75, Sake: 0.60, Ebi: 0.85, Unagi: 1.35, Ikura: 0.60, Tako: 0.95, Rice: 1.20, Nori: 1.00,
  },
  4: { // Okinawa — tropical south, remote; northern goods expensive, local warm catch cheap
    Maguro: 1.20, Sake: 1.40, Ebi: 0.85, Unagi: 1.30, Ikura: 1.40, Tako: 1.00, Rice: 1.25, Nori: 1.05,
  },
  5: { // Nagoya — the eel city (Hamana); cheap rice (Nobi plain)
    Maguro: 1.05, Sake: 1.10, Ebi: 1.00, Unagi: 0.70, Ikura: 1.10, Tako: 1.00, Rice: 0.90, Nori: 0.95,
  },
  6: { // Fukuoka — Kyushu fishing port; good fish, cheap nori (Ariake) & eel (Yanagawa)
    Maguro: 0.95, Sake: 1.20, Ebi: 0.90, Unagi: 0.85, Ikura: 1.20, Tako: 0.90, Rice: 0.95, Nori: 0.80,
  },
};

const INITIAL_GAME_STATE = {
  cash: 10000,
  totalHours: 0,
  day: 1,
  cityIndex: 0,
  inventory: {},
  maxInventory: 30,
  restaurants: [],
  ownedUpgrades: [],
  traveling: null,
  lastActionTime: 0,
  spoilageNotification: null,
  dayTradingProfit: 0,
  daySpoilageLoss: 0,
  dayEateryRevenue: 0,
  dayPortsVisited: 0,
  lastDayLedger: null,
  peakPurse: 10000,
  lifetimePortsVisited: 0,
  pendingEateryRevenue: 0,
  stateVersion: 1,
};

const UPGRADES = [
  { id: 'bag1', name: 'Wicker Basket', kanji: '籠', description: '+10 cargo slots', cost: 500, inventoryBonus: 10 },
  { id: 'bag2', name: 'Ice Box', kanji: '箱', description: '+20 cargo slots', cost: 1200, inventoryBonus: 20 },
  { id: 'bag3', name: 'Merchant Cart', kanji: '車', description: '+40 cargo slots', cost: 3000, inventoryBonus: 40 },
];


// ── Price Engine (pure, module-level) ──────────────────────────────────────

const hashSeed = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};

const smoothNoise = (seedStr, t, periods) => {
  let sum = 0, ampTotal = 0;
  periods.forEach((p, i) => {
    const amp = 1 / (i + 1);
    const phase = hashSeed(`${seedStr}:${i}`) * Math.PI * 2;
    sum += amp * Math.sin((2 * Math.PI * t) / p + phase);
    ampTotal += amp;
  });
  return sum / ampTotal;
};

const getAnchor = (good, gameDay) => {
  const start = SUSHI_TYPES.find(s => s.name === good).basePrice;
  const drift = 1 + PRICE_CONFIG.anchorDriftBand
              * smoothNoise(`anchor:${good}`, gameDay, PRICE_CONFIG.anchorDriftPeriodsDays);
  return start * drift;
};

const getTimeOfDayFactor = (good, localHour) => {
  const base = 1 + PRICE_CONFIG.timeOfDayAmplitude
             * Math.cos((2 * Math.PI * (localHour - PRICE_CONFIG.timeOfDayPeakHour)) / 24);
  const arrival = ARRIVAL_HOURS[good];
  let diff = Math.abs(localHour - arrival);
  diff = Math.min(diff, 24 - diff);
  const dip = -PRICE_CONFIG.arrivalDepth
            * Math.exp(-(diff * diff) / (2 * PRICE_CONFIG.arrivalSigmaHours ** 2));
  return base + dip;
};

const getMarketPeriod = (localHour) => {
  return MARKET_PERIODS.find(p =>
    p.startHour < p.endHour
      ? localHour >= p.startHour && localHour < p.endHour
      : localHour >= p.startHour || localHour < p.endHour
  ) || MARKET_PERIODS[1];
};

const DETERMINISTIC_EVENTS = [
  { name: 'Good Catch',        kanji: '漁', emoji: '🎣', type: 'negative', description: 'Abundant supply',    categoryEffects: { fish: 0.75, ingredient: 1.0  } },
  { name: 'Storm',             kanji: '嵐', emoji: '🌪️', type: 'positive', description: 'Boats grounded',    categoryEffects: { fish: 1.40, ingredient: 1.0  } },
  { name: 'Festival',          kanji: '祭', emoji: '🎊', type: 'positive', description: 'Broad demand spike', categoryEffects: { fish: 1.30, ingredient: 1.15 } },
  { name: 'Daimyo Visit',      kanji: '殿', emoji: '👑', type: 'positive', description: 'Nobles visiting',    categoryEffects: { fish: 1.35, ingredient: 1.10 } },
  { name: 'Tsunami Warning',   kanji: '波', emoji: '🌊', type: 'negative', description: 'Sea warning',        categoryEffects: { fish: 1.50, ingredient: 1.05 } },
  { name: 'Imperial Visit',    kanji: '帝', emoji: '⛩️', type: 'positive', description: 'Emperor coming!',   categoryEffects: { fish: 1.60, ingredient: 1.20 } },
  { name: 'Quiet Market',      kanji: '静', emoji: '🍵', type: 'neutral',  description: 'Slow trading day',   categoryEffects: { fish: 1.0,  ingredient: 1.0  } },
];

const NEUTRAL_EVENT = DETERMINISTIC_EVENTS[DETERMINISTIC_EVENTS.length - 1];

const getCityEvent = (cityIndex, gameDay) => {
  const seed = hashSeed(`event:${cityIndex}:${gameDay}`);
  // ~25% chance of a non-neutral event
  if (seed > 0.25) return NEUTRAL_EVENT;
  const nonNeutral = DETERMINISTIC_EVENTS.slice(0, -1);
  const idx = Math.floor(hashSeed(`eventIdx:${cityIndex}:${gameDay}`) * nonNeutral.length);
  return nonNeutral[idx];
};

const getPrice = (good, cityIndex, gameHour, localHour) => {
  const gameDay = Math.floor(gameHour / 24);
  const anchor = getAnchor(good, gameDay);
  const regional = REGIONAL_MODIFIERS[cityIndex]?.[good] ?? 1.0;
  const tod = getTimeOfDayFactor(good, localHour);
  const event = getCityEvent(cityIndex, gameDay);
  const category = SUSHI_TYPES.find(s => s.name === good).category;
  const eventMult = event.categoryEffects?.[category] ?? 1.0;
  const wobble = 1 + PRICE_CONFIG.volatilityBand
               * smoothNoise(`px:${good}:${cityIndex}`, gameHour, PRICE_CONFIG.noisePeriodsHours);
  const raw = anchor * regional * tod * eventMult * wobble;
  const floor = PRICE_CONFIG.floorRatio * anchor * regional;
  return Math.max(1, Math.round(Math.max(raw, floor)));
};

// Q=1 → multiplier 1.0 (no impact); larger Q walks down the demand curve to a floor.
// Written so buy-side can reuse with inverted sign (1 + impact) if added later.
const depthMultiplier = (good, qty) => {
  const cfg = MARKET_DEPTH_BY_GOOD[good] || MARKET_DEPTH;
  const impact = Math.min(cfg.maxImpact, cfg.impactSlope * Math.max(0, qty - cfg.freeUnits));
  return 1 - impact;
};

// ──────────────────────────────────────────────────────────────────────────────

const SPOILAGE_STATES = {
  fresh: { maxHours: 24, multiplier: 1.0, color: '#10b981', emoji: '🟢', label: 'Fresh' },
  aging: { maxHours: 48, multiplier: 0.8, color: '#f59e0b', emoji: '🟡', label: 'Aging' },
  urgent: { maxHours: 72, multiplier: 0.5, color: '#ef4444', emoji: '🔴', label: 'Urgent' },
  spoiled: { multiplier: 0.0, color: '#6b7280', emoji: '⚫', label: 'Spoiled' },
};

export default function SushiTrader() {
  const [game, setGame] = useState({ ...INITIAL_GAME_STATE, lastActionTime: Date.now() });
  const [hydrated, setHydrated] = useState(false);

  const [devLocalHourOverride, setDevLocalHourOverride] = useState(null);

  const localHour = devLocalHourOverride !== null ? devLocalHourOverride : new Date().getHours();

  const prices = useMemo(() => {
    const p = {};
    SUSHI_TYPES.forEach(s => {
      p[s.name] = getPrice(s.name, game.cityIndex, game.totalHours, localHour);
    });
    return p;
  }, [game.cityIndex, game.totalHours, localHour]);

  const priceHistory = useMemo(() => {
    const h = {};
    SUSHI_TYPES.forEach(s => {
      const pts = [];
      for (let offset = 6; offset >= 0; offset--) {
        const gh = Math.max(0, game.totalHours - offset);
        pts.push(getPrice(s.name, game.cityIndex, gh, localHour));
      }
      h[s.name] = pts;
    });
    return h;
  }, [game.cityIndex, game.totalHours, localHour]);

  const cityEvents = useMemo(() => {
    const ev = {};
    const gameDay = Math.floor(game.totalHours / 24);
    CITIES.forEach((_, idx) => {
      ev[idx] = getCityEvent(idx, gameDay);
    });
    return ev;
  }, [game.totalHours]);

  const [newsIndex, setNewsIndex] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [activeScreen, setActiveScreen] = useState('market');
  const [travelConfirm, setTravelConfirm] = useState(null); // { destinationIdx, hours }
  const [selectedPriceSushi, setSelectedPriceSushi] = useState(SUSHI_TYPES[0].name);
  const [showRestaurants, setShowRestaurants] = useState(false);
  const [showDaySummary, setShowDaySummary] = useState(false);
  const [travelProgress, setTravelProgress] = useState(0);
  const [showArrival, setShowArrival] = useState(false);
  const [buyModal, setBuyModal] = useState(null);
  const [buyQty, setBuyQty] = useState(1);
  const [sellModal, setSellModal] = useState(null);
  const [sellQty, setSellQty] = useState(1);
  const [showTitle, setShowTitle] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [showEateries, setShowEateries] = useState(false);
  const showDevTools = __DEV__;

  const [fontsLoaded] = useFonts({
    ShipporiMinchoB1_700Bold,
    ZenKakuGothicNew_400Regular,
    ZenKakuGothicNew_700Bold,
    ZenKakuGothicNew_900Black,
  });

  useEffect(() => {
    let cancelled = false;
    const hydrateGame = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) {
          if (!cancelled) {
            setGame({ ...INITIAL_GAME_STATE, lastActionTime: Date.now() });
          }
          return;
        }

        const parsed = JSON.parse(stored);
        if (parsed?.stateVersion === INITIAL_GAME_STATE.stateVersion) {
          if (!cancelled) {
            setGame({ ...INITIAL_GAME_STATE, ...parsed, lastActionTime: parsed.lastActionTime || Date.now() });
          }
        } else if (!cancelled) {
          setGame({ ...INITIAL_GAME_STATE, lastActionTime: Date.now() });
        }
      } catch (error) {
        if (!cancelled) {
          setGame({ ...INITIAL_GAME_STATE, lastActionTime: Date.now() });
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    };

    hydrateGame();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(game)).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [hydrated, game]);

  // Update game time on app focus/action
  useEffect(() => {
    if (!hydrated) return;
    if (game.traveling) {
      // App restarted during a voyage — show a brief splash then land
      const timer = setTimeout(() => completeTravel(), 1500);
      return () => clearTimeout(timer);
    }
    updateGameTime();
  }, [hydrated, game.traveling]);

  useEffect(() => {
    if (!hydrated) return;
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && hydrated && !game.traveling) {
        updateGameTime();
      }
    });
    return () => sub.remove();
  }, [hydrated, game.traveling]);

  // Animate progress bar over the real splash duration
  useEffect(() => {
    if (!game.traveling) {
      setTravelProgress(0);
      return;
    }
    const { startedAtMs, splashMs } = game.traveling;
    const interval = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startedAtMs) / splashMs) * 100);
      setTravelProgress(pct);
    }, 80);
    return () => clearInterval(interval);
  }, [game.traveling]);

  useEffect(() => {
    if (game.lastDayLedger) {
      setShowDaySummary(true);
    }
  }, [game.lastDayLedger]);

  const computeEateryRevenue = (restaurants) =>
    restaurants.reduce((sum, restaurant) => {
      const tier = RESTAURANTS.find(t => t.id === restaurant.tierId);
      return sum + (tier ? tier.dailyRevenue * supplyFactor(restaurant) : 0);
    }, 0);

  const supplyFactor = (restaurant) => 1.0;

  const updateGameTime = () => {
    setGame(prev => {
      // Travel window is owned by completeTravel — don't advance real time during it
      if (prev.traveling) return prev;

      const now = Date.now();
      const elapsedMs = now - prev.lastActionTime;
      const elapsedHours = Math.max(0, Math.floor(elapsedMs / REAL_MS_PER_GAME_HOUR));

      if (elapsedHours === 0) return prev;

      const nextTotalHours = prev.totalHours + elapsedHours;
      const spoilage = {};
      let totalSpoiled = 0;
      let lostValue = 0;
      const newInventory = {};

      Object.entries(prev.inventory).forEach(([sushi, batches]) => {
        if (isIngredient(sushi)) {
          newInventory[sushi] = batches;
          return;
        }

        newInventory[sushi] = [];
        let spoiledQty = 0;

        batches.forEach(batch => {
          const prevState = getSpoilageStateForHours(batch.acquiredAtHour, prev.totalHours);
          const nextState = getSpoilageStateForHours(batch.acquiredAtHour, nextTotalHours);

          if (prevState !== 'spoiled' && nextState === 'spoiled') {
            spoiledQty += batch.qty;
            totalSpoiled += batch.qty;
            lostValue += batch.qty * (batch.pricePaid || 0);
          } else {
            newInventory[sushi].push(batch);
          }
        });

        if (spoiledQty > 0) spoilage[sushi] = spoiledQty;
        if (newInventory[sushi].length === 0) delete newInventory[sushi];
      });

      let newGame = {
        ...prev,
        totalHours: nextTotalHours,
        day: Math.floor(nextTotalHours / GAME_HOURS_PER_DAY) + 1,
        lastActionTime: now,
        inventory: newInventory,
        daySpoilageLoss: prev.daySpoilageLoss + lostValue,
      };

      if (totalSpoiled > 0) {
        newGame.spoilageNotification = { spoilage, totalSpoiled, lostValue };
      }

      // Day rollover
      if (newGame.day > prev.day) {
        const eateryRevenue = computeEateryRevenue(newGame.restaurants);
        newGame.pendingEateryRevenue = (newGame.pendingEateryRevenue || 0) + eateryRevenue;
        newGame.lastDayLedger = {
          day: prev.day,
          tradingProfit: newGame.dayTradingProfit,
          spoilageLoss: newGame.daySpoilageLoss,
          eateryRevenue,
          portsVisited: newGame.dayPortsVisited,
          net: newGame.dayTradingProfit + eateryRevenue - newGame.daySpoilageLoss,
          purseEnd: newGame.cash,
        };
        newGame.dayTradingProfit = 0;
        newGame.daySpoilageLoss = 0;
        newGame.dayEateryRevenue = 0;
        newGame.dayPortsVisited = 0;
      }

      return newGame;
    });
  };

  const ageInventory = (inventory, hoursElapsed) => {
    const aged = {};
    Object.entries(inventory).forEach(([sushi, batches]) => {
      aged[sushi] = batches.map(batch => ({
        ...batch,
        // acquiredAtHour stays the same, we calculate age from totalHours
      }));
    });
    return aged;
  };

  // Completes a voyage: jumps totalHours by travelDuration, applies spoilage and day rollover.
  // Called by a short real-time timer so the player only waits seconds, not hours.
  const completeTravel = () => {
    setGame(prev => {
      if (!prev.traveling) return prev;

      const { travelDuration, destination } = prev.traveling;
      const arrivalHour = prev.totalHours + travelDuration;
      const newDay = Math.floor(arrivalHour / GAME_HOURS_PER_DAY) + 1;

      // Spoilage: evaluate each batch against the theoretical arrival hour
      const spoilage = {};
      let totalSpoiled = 0;
      let lostValue = 0;
      const newInventory = {};

      Object.entries(prev.inventory).forEach(([sushi, batches]) => {
        if (isIngredient(sushi)) {
          newInventory[sushi] = batches;
          return;
        }
        newInventory[sushi] = [];
        let spoiledQty = 0;

        batches.forEach(batch => {
          const ageAtArrival = arrivalHour - batch.acquiredAtHour;
          if (ageAtArrival >= SPOILAGE_STATES.urgent.maxHours) {
            spoiledQty += batch.qty;
            totalSpoiled += batch.qty;
            lostValue += batch.qty * (batch.pricePaid || 0);
          } else {
            newInventory[sushi].push(batch);
          }
        });

        if (spoiledQty > 0) spoilage[sushi] = spoiledQty;
        if (newInventory[sushi].length === 0) delete newInventory[sushi];
      });

      let newGame = {
        ...prev,
        totalHours: arrivalHour,
        day: newDay,
        cityIndex: destination,
        traveling: null,
        lastActionTime: Date.now(),
        dayPortsVisited: prev.dayPortsVisited + 1,
        lifetimePortsVisited: (prev.lifetimePortsVisited || 0) + 1,
        inventory: newInventory,
        daySpoilageLoss: prev.daySpoilageLoss + lostValue,
      };

      if (totalSpoiled > 0) {
        newGame.spoilageNotification = { spoilage, totalSpoiled, lostValue };
      }

      if (newDay > prev.day) {
        const eateryRevenue = computeEateryRevenue(newGame.restaurants);
        newGame.pendingEateryRevenue = (newGame.pendingEateryRevenue || 0) + eateryRevenue;
        newGame.lastDayLedger = {
          day: prev.day,
          tradingProfit: newGame.dayTradingProfit,
          spoilageLoss: newGame.daySpoilageLoss,
          eateryRevenue,
          portsVisited: newGame.dayPortsVisited,
          net: newGame.dayTradingProfit + eateryRevenue - newGame.daySpoilageLoss,
          purseEnd: newGame.cash,
        };
        newGame.dayTradingProfit = 0;
        newGame.daySpoilageLoss = 0;
        newGame.dayEateryRevenue = 0;
        newGame.dayPortsVisited = 0;
      }

      return newGame;
    });
    setShowArrival(true);
  };

  const getSpoilageStateForHours = (acquiredAtHour, totalHours) => {
    const ageHours = totalHours - acquiredAtHour;
    if (ageHours < SPOILAGE_STATES.fresh.maxHours) return 'fresh';
    if (ageHours < SPOILAGE_STATES.aging.maxHours) return 'aging';
    if (ageHours < SPOILAGE_STATES.urgent.maxHours) return 'urgent';
    return 'spoiled';
  };

  const getSpoilageState = (acquiredAtHour) => getSpoilageStateForHours(acquiredAtHour, game.totalHours);

  const getSpoilageMultiplier = (state) => {
    const entry = SPOILAGE_STATES[state];
    return entry ? entry.multiplier : SPOILAGE_STATES.fresh.multiplier;
  };

  const getBatches = (name) => game.inventory[name] || [];

  const getAvgCost = (name) => {
    const batches = getBatches(name);
    const totalQty = batches.reduce((s, b) => s + b.qty, 0);
    if (totalQty === 0) return 0;
    const totalCost = batches.reduce((s, b) => s + b.qty * (b.pricePaid || 0), 0);
    return totalCost / totalQty;
  };

  const getCostBasis = (name) =>
    getBatches(name).reduce((s, b) => s + b.qty * (b.pricePaid || 0), 0);

  const getRealizableValue = (name) => {
    const ingredient = isIngredient(name);
    return getBatches(name).reduce((s, b) => {
      const mult = ingredient ? 1.0 : getSpoilageMultiplier(getSpoilageState(b.acquiredAtHour));
      return s + b.qty * Math.floor((prices[name] || 0) * mult);
    }, 0);
  };

  const getUnrealizedPL = (name) => getRealizableValue(name) - getCostBasis(name);

  const isIngredient = (sushiName) =>
    SUSHI_TYPES.find(s => s.name === sushiName)?.category === 'ingredient';

  const getDailyEateryRevenue = () => computeEateryRevenue(game.restaurants);

  const pushToast = (type, title, body = '') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, type, title, body }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2500);
  };

  const collectEateryRevenue = () => {
    const amount = game.pendingEateryRevenue;
    if (amount <= 0) return;
    setGame(prev => ({
      ...prev,
      cash: prev.cash + prev.pendingEateryRevenue,
      peakPurse: Math.max(prev.peakPurse || 0, prev.cash + prev.pendingEateryRevenue),
      pendingEateryRevenue: 0,
      lastActionTime: Date.now(),
    }));
    pushToast('success', 'Revenue collected', `+${amount} mon`);
  };

  const resetGame = () => {
    setGame({ ...INITIAL_GAME_STATE, lastActionTime: Date.now() });
    setActiveScreen('market');
    setShowTitle(false);
    setToasts([]);
    setShowArrival(false);
    setTravelConfirm(null);
    setShowDaySummary(false);
    setShowEateries(false);
  };

  const advanceGameTimeForDev = (hours) => {
    const now = Date.now();
    setGame(prev => ({
      ...prev,
      lastActionTime: now - hours * REAL_MS_PER_GAME_HOUR,
    }));
    setTimeout(() => updateGameTime(), 0);
  };

  const inspectGameStateForDev = () => {
    const stateText = [
      `cash: ${game.cash}`,
      `day: ${game.day}`,
      `totalHours: ${game.totalHours}`,
      `inventory: ${Object.entries(game.inventory).map(([name, batches]) => {
        const totalQty = (batches || []).reduce((sum, batch) => sum + batch.qty, 0);
        return `${name}(${totalQty})`;
      }).join(', ') || 'none'}`,
    ].join('\n');
    Alert.alert('Game state', stateText);
  };

  const handleDevAdvance = () => {
    Alert.prompt(
      'Advance time',
      'Enter an hour count',
      (text) => {
        const hours = parseInt(text, 10);
        if (!Number.isNaN(hours) && hours > 0) {
          advanceGameTimeForDev(hours);
        }
      },
      'plain-text',
      '24'
    );
  };

  const isBankrupt = (() => {
    if (game.cash > 0) return false;
    const canSell = SUSHI_TYPES.some(s => {
      const batches = game.inventory[s.name] || [];
      return batches.some(b =>
        isIngredient(s.name) || getSpoilageMultiplier(getSpoilageState(b.acquiredAtHour)) > 0
      );
    });
    return !canSell;
  })();

  const getHoursRemaining = (acquiredAtHour) => {
    const ageHours = game.totalHours - acquiredAtHour;
    const state = getSpoilageState(acquiredAtHour);
    
    if (state === 'fresh') {
      return Math.max(0, SPOILAGE_STATES.fresh.maxHours - ageHours);
    } else if (state === 'aging') {
      return Math.max(0, SPOILAGE_STATES.aging.maxHours - ageHours);
    } else if (state === 'urgent') {
      return Math.max(0, SPOILAGE_STATES.urgent.maxHours - ageHours);
    }
    return 0;
  };

  useEffect(() => {
    const otherCitiesNews = getOtherCitiesNews();
    if (otherCitiesNews.length === 0) return;

    const timer = setInterval(() => {
      setNewsIndex(prev => (prev + 1) % otherCitiesNews.length);
    }, 3000);

    return () => clearInterval(timer);
  }, [cityEvents, game.cityIndex]);

  const getOtherCitiesNews = () => {
    return CITIES
      .map((city, idx) => ({ city, idx, event: cityEvents[idx] }))
      .filter(item => item.idx !== game.cityIndex && item.event && item.event.type !== 'neutral');
  };

  const getTotalInventory = () => {
    let total = 0;
    Object.values(game.inventory).forEach(batches => {
      if (Array.isArray(batches)) {
        batches.forEach(batch => total += batch.qty);
      }
    });
    return total;
  };

  const buy = (sushiName, qty) => {
    if (game.traveling) {
      pushToast('warning', 'At sea', 'Cannot trade while traveling');
      return;
    }

    const cost = prices[sushiName] * qty;
    if (game.cash >= cost && getTotalInventory() + qty <= game.maxInventory) {
      updateGameTime();
      setGame(prev => {
        const newInventory = { ...prev.inventory };
        if (!newInventory[sushiName]) {
          newInventory[sushiName] = [];
        }

        const currentBatch = newInventory[sushiName].find(
          batch => batch.acquiredAtHour === prev.totalHours
        );

        if (currentBatch) {
          currentBatch.qty += qty;
        } else {
          newInventory[sushiName].push({
            qty: qty,
            acquiredAtHour: prev.totalHours,
            pricePaid: prices[sushiName],
          });
        }

        return {
          ...prev,
          cash: prev.cash - cost,
          inventory: newInventory,
          lastActionTime: Date.now(),
        };
      });
    } else if (game.cash < prices[sushiName] * qty) {
      pushToast('error', 'Not enough cash', `Need ${prices[sushiName] * qty} mon`);
    } else {
      pushToast('warning', `Hold is full · ${getTotalInventory()}/${game.maxInventory}`, 'No room in cargo');
    }
  };

  const sell = (sushiName, qty) => {
    if (game.traveling) {
      pushToast('warning', 'At sea', 'Cannot trade while traveling');
      return;
    }

    const batches = game.inventory[sushiName];
    if (!batches || batches.length === 0) {
      pushToast('error', 'No stock', `You have no ${sushiName}`);
      return;
    }

    const totalOwned = batches.reduce((sum, batch) => sum + batch.qty, 0);
    if (totalOwned < qty) {
      pushToast('error', 'Not enough stock', `Only ${totalOwned} on hand`);
      return;
    }

    updateGameTime();
    setGame(prev => {
      const newInventory = { ...prev.inventory };
      const itemBatches = [...newInventory[sushiName]];
      
      itemBatches.sort((a, b) => a.acquiredAtHour - b.acquiredAtHour);
      
      let remaining = qty;
      let earned = 0;
      let costOfSold = 0;

      const ingredient = isIngredient(sushiName);
      const depthMult = depthMultiplier(sushiName, qty);
      for (let i = 0; i < itemBatches.length && remaining > 0; i++) {
        const batch = itemBatches[i];
        const state = getSpoilageState(batch.acquiredAtHour);
        const multiplier = ingredient ? 1.0 : getSpoilageMultiplier(state);

        if (multiplier === 0) continue;

        const sellQty = Math.min(remaining, batch.qty);
        const pricePerUnit = Math.max(1, Math.floor(prices[sushiName] * multiplier * depthMult));
        earned += sellQty * pricePerUnit;
        costOfSold += sellQty * (batch.pricePaid || 0);

        batch.qty -= sellQty;
        remaining -= sellQty;
      }

      newInventory[sushiName] = itemBatches.filter(batch => batch.qty > 0);
      if (newInventory[sushiName].length === 0) {
        delete newInventory[sushiName];
      }

      const newCash = prev.cash + earned;
      return {
        ...prev,
        cash: newCash,
        peakPurse: Math.max(prev.peakPurse || 0, newCash),
        inventory: newInventory,
        dayTradingProfit: prev.dayTradingProfit + (earned - costOfSold),
        lastActionTime: Date.now(),
      };
    });
  };

  const discardSpoiled = (sushiName) => {
    setGame(prev => {
      const newInventory = { ...prev.inventory };
      const itemBatches = newInventory[sushiName];

      if (!itemBatches) return prev;

      let lostValue = 0;
      newInventory[sushiName] = itemBatches.filter(batch => {
        const state = getSpoilageState(batch.acquiredAtHour);
        if (state === 'spoiled') {
          lostValue += batch.qty * (batch.pricePaid || 0);
          return false;
        }
        return true;
      });

      if (newInventory[sushiName].length === 0) {
        delete newInventory[sushiName];
      }

      return {
        ...prev,
        inventory: newInventory,
        daySpoilageLoss: prev.daySpoilageLoss + lostValue,
      };
    });

    pushToast('success', 'Discarded', 'Spoiled crates removed');
  };

  const buyRestaurant = (restaurant) => {
    if (game.cash >= restaurant.cost) {
      setGame(prev => ({
        ...prev,
        cash: prev.cash - restaurant.cost,
        restaurants: [...prev.restaurants, { tierId: restaurant.id, cityIndex: game.cityIndex }],
        lastActionTime: Date.now(),
      }));
      pushToast('success', `${restaurant.name} opened`, CITIES[game.cityIndex].name);
      setShowRestaurants(false);
    } else {
      pushToast('error', 'Insufficient funds', `Need ${restaurant.cost} mon`);
    }
  };

  const buyUpgrade = (upgrade) => {
    if (game.ownedUpgrades.includes(upgrade.id)) {
      pushToast('warning', 'Already owned', upgrade.name);
      return;
    }
    if (game.cash >= upgrade.cost) {
      setGame(prev => ({
        ...prev,
        cash: prev.cash - upgrade.cost,
        maxInventory: prev.maxInventory + upgrade.inventoryBonus,
        ownedUpgrades: [...prev.ownedUpgrades, upgrade.id],
        lastActionTime: Date.now(),
      }));
      pushToast('success', 'Purchased', upgrade.name);
      setShowShop(false);
    } else {
      pushToast('error', 'Insufficient funds', `Need ${upgrade.cost} mon`);
    }
  };

  const startTravel = (destinationIdx, precomputedHours) => {
    updateGameTime();
    const travelTime = precomputedHours || getTravelTime(game.cityIndex, destinationIdx);
    const splashMs = 3000 + Math.floor(Math.random() * 2000); // 3–5 seconds real time

    setGame(prev => ({
      ...prev,
      traveling: {
        destination: destinationIdx,
        departureHour: prev.totalHours,
        travelDuration: travelTime,
        startedAtMs: Date.now(),
        splashMs,
      },
      lastActionTime: Date.now(),
    }));

    setTravelProgress(0);
    setShowMap(false);

    setTimeout(() => completeTravel(), splashMs);
  };

  const computeTravelSpoilage = (travelHours) => {
    const warnings = [];
    SUSHI_TYPES.forEach(sushi => {
      if (isIngredient(sushi.name)) return;
      const batches = getBatches(sushi.name);
      if (batches.length === 0) return;
      let willSpoil = 0, turnsUrgent = 0, turnsAging = 0;
      batches.forEach(batch => {
        const currentState = getSpoilageState(batch.acquiredAtHour);
        if (currentState === 'spoiled') return;
        const futureAge = (game.totalHours + travelHours) - batch.acquiredAtHour;
        let futureState;
        if (futureAge < SPOILAGE_STATES.fresh.maxHours) futureState = 'fresh';
        else if (futureAge < SPOILAGE_STATES.aging.maxHours) futureState = 'aging';
        else if (futureAge < SPOILAGE_STATES.urgent.maxHours) futureState = 'urgent';
        else futureState = 'spoiled';
        if (currentState !== futureState) {
          if (futureState === 'spoiled') willSpoil += batch.qty;
          else if (futureState === 'urgent') turnsUrgent += batch.qty;
          else if (futureState === 'aging') turnsAging += batch.qty;
        }
      });
      const totalQty = batches.reduce((s, b) => s + b.qty, 0);
      if (willSpoil > 0 || turnsUrgent > 0 || turnsAging > 0) {
        warnings.push({ sushi, totalQty, willSpoil, turnsUrgent, turnsAging });
      }
    });
    return warnings;
  };

  const openBuySheet = (sushi, initialQty) => {
    setBuyModal(sushi);
    setBuyQty(initialQty);
  };

  const openSellSheet = (sushi, initialQty) => {
    setSellModal(sushi);
    setSellQty(initialQty);
  };

  const computeSellPreview = (sushiName, qty) => {
    const batches = [...(game.inventory[sushiName] || [])]
      .sort((a, b) => a.acquiredAtHour - b.acquiredAtHour);
    const ingredient = isIngredient(sushiName);
    const depthMult = depthMultiplier(sushiName, qty);
    let remaining = qty;
    const rows = [];
    batches.forEach(batch => {
      if (remaining <= 0) return;
      const state = ingredient ? 'fresh' : getSpoilageState(batch.acquiredAtHour);
      const mult = ingredient ? 1.0 : getSpoilageMultiplier(state);
      if (mult === 0) return;
      const sellQty = Math.min(remaining, batch.qty);
      const effectivePrice = Math.max(1, Math.floor((prices[sushiName] || 0) * mult * depthMult));
      rows.push({ qty: sellQty, state, mult, depthMult, effectivePrice, subtotal: sellQty * effectivePrice });
      remaining -= sellQty;
    });
    return rows;
  };

  const currentCity = CITIES[game.cityIndex];
  const inventoryCount = getTotalInventory();
  const currentEvent = cityEvents[game.cityIndex];
  const otherCitiesNews = getOtherCitiesNews();
  const currentNews = otherCitiesNews.length > 0 ? otherCitiesNews[newsIndex % otherCitiesNews.length] : null;

  const SparkLine = ({ data, trendColor }) => {
    if (!data || data.length < 2) return <View style={{ width: 78, height: 30 }} />;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const VW = 120, VH = 34, W = 78, H = 30;
    const pts = data.map((v, i) => {
      const x = ((i / (data.length - 1)) * VW).toFixed(1);
      const y = (VH - 2 - ((v - min) / range) * (VH - 6)).toFixed(1);
      return `${x},${y}`;
    });
    const lastPt = pts[pts.length - 1].split(',');
    return (
      <Svg width={W} height={H} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none">
        <Polyline points={pts.join(' ')} fill="none" stroke={trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={lastPt[0]} cy={lastPt[1]} r="2.6" fill={trendColor} />
      </Svg>
    );
  };

  const FishItem = ({ sushi }) => {
    const batches = game.inventory[sushi.name] || [];
    const price = prices[sushi.name] || sushi.basePrice;
    const totalQty = batches.reduce((s, b) => s + b.qty, 0);
    const history = priceHistory[sushi.name] || [];
    const hasSpoiled = batches.some(b => getSpoilageState(b.acquiredAtHour) === 'spoiled');

    const prevPrice = history.length >= 2 ? history[history.length - 2] : sushi.basePrice;
    const pctChange = Math.round(Math.abs((price - prevPrice) / (prevPrice || 1)) * 100);
    const trendColor = price > prevPrice ? '#2f7d72' : price < prevPrice ? '#9b2226' : '#9aa39e';
    const trendArrow = price > prevPrice ? '↗' : price < prevPrice ? '↘' : '→';

    return (
      <View style={styles.fishCard}>
        <View style={styles.fishCardRow}>
          <View style={styles.fishBadge}>
            <Text style={styles.fishBadgeText}>{sushi.kanji}</Text>
          </View>

          <View style={styles.fishNameCol}>
            <Text style={styles.fishNameEn}>{sushi.name}</Text>
            <Text style={styles.fishNameJp}>{sushi.en}</Text>
          </View>

          <SparkLine data={history} trendColor={trendColor} />

          <View style={styles.fishPriceCol}>
            <View style={styles.fishPriceRow}>
              <Text style={[styles.fishPrice, { color: trendColor }]}>{price}</Text>
              <Text style={styles.fishPriceMon}> mon</Text>
            </View>
            <Text style={[styles.fishTrend, { color: trendColor }]}>
              {trendArrow} {pctChange}%
            </Text>
            <Text style={[styles.fishHold, totalQty > 0 ? styles.fishHoldActive : null]}>
              hold {totalQty}
            </Text>
          </View>
        </View>

        <View style={styles.fishDivider} />

        <View style={styles.fishActions}>
          <TouchableOpacity onPress={() => openBuySheet(sushi, 1)}>
            <Text style={styles.fishBuyLink}>Buy 1</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openBuySheet(sushi, 5)}>
            <Text style={styles.fishBuyLink}>Buy 5</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openSellSheet(sushi, 1)} disabled={totalQty === 0}>
            <Text style={[styles.fishSellLink, totalQty === 0 ? styles.fishLinkDisabled : null]}>Sell 1</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openSellSheet(sushi, totalQty)} disabled={totalQty === 0}>
            <Text style={[styles.fishSellAll, totalQty === 0 ? styles.fishLinkDisabled : null]}>Sell all</Text>
          </TouchableOpacity>
        </View>

        {hasSpoiled && (
          <TouchableOpacity style={styles.discardSpoiledLink} onPress={() => discardSpoiled(sushi.name)}>
            <Text style={styles.discardSpoiledText}>Discard spoiled</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const IngredientItem = ({ sushi }) => {
    const batches = game.inventory[sushi.name] || [];
    const price = prices[sushi.name] || sushi.basePrice;
    const totalQty = batches.reduce((s, b) => s + b.qty, 0);
    const history = priceHistory[sushi.name] || [];
    const prevPrice = history.length >= 2 ? history[history.length - 2] : sushi.basePrice;
    const pctChange = Math.round(Math.abs((price - prevPrice) / (prevPrice || 1)) * 100);
    const trendColor = price > prevPrice ? '#2f7d72' : price < prevPrice ? '#9b2226' : '#9aa39e';
    const trendArrow = price > prevPrice ? '↗' : price < prevPrice ? '↘' : '→';
    return (
      <View style={styles.ingredientCard}>
        <View style={styles.ingredientCardRow}>
          <View style={styles.ingredientBadge}>
            <Text style={styles.ingredientBadgeKanji}>{sushi.kanji}</Text>
          </View>
          <View style={styles.ingredientNameCol}>
            <Text style={styles.ingredientName}>{sushi.name}</Text>
            <Text style={styles.ingredientSub}>{sushi.en}</Text>
          </View>
          <SparkLine data={history} trendColor={trendColor} />
          <View style={styles.ingredientPriceCol}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, justifyContent: 'flex-end' }}>
              <Text style={[styles.ingredientPrice, { color: trendColor }]}>{price}</Text>
              <Text style={styles.ingredientPriceMon}>mon</Text>
            </View>
            <Text style={[styles.ingredientTrend, { color: trendColor }]}>{trendArrow} {pctChange}%</Text>
            <Text style={styles.ingredientHold}>hold {totalQty}</Text>
          </View>
        </View>
        <View style={styles.ingredientActions}>
          <TouchableOpacity onPress={() => openBuySheet(sushi, 1)}>
            <Text style={styles.ingredientBuy}>Buy 1</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openBuySheet(sushi, 10)}>
            <Text style={styles.ingredientBuy}>Buy 10</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openSellSheet(sushi, 1)} disabled={totalQty === 0}>
            <Text style={[styles.ingredientSell, totalQty === 0 && styles.ingredientSellFaded]}>Sell 1</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openSellSheet(sushi, totalQty)} disabled={totalQty === 0}>
            <Text style={[styles.ingredientSellAll, totalQty === 0 && styles.ingredientSellFaded]}>Sell all</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!fontsLoaded) return null;

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingScreen}>
          <Text style={styles.loadingTitle}>SUSHI TRADER</Text>
          <Text style={styles.loadingText}>Restoring your voyage…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Title Screen (F18)
  if (showTitle) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
        <SafeAreaView style={styles.titleContainer}>
          {/* Seigaiha bg */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 402 858" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <Pattern id="sg_title" width={60} height={30} patternUnits="userSpaceOnUse">
                <Path d="M0,30 A30,30 0 0,1 60,30 M-30,30 A30,30 0 0,1 30,30 M30,30 A30,30 0 0,1 90,30" fill="none" stroke="#e0c081" strokeWidth="1.4" />
              </Pattern>
            </Defs>
            <Rect width="402" height="858" fill="url(#sg_title)" opacity="0.07" />
          </Svg>

          <View style={styles.titleInner}>
            {/* Brand — centered, flex:1 */}
            <View style={styles.titleBrandWrap}>
              <View style={styles.titleLogoCircle}>
                <Text style={styles.titleLogoKanji}>鮨</Text>
              </View>
              <Text style={styles.titleBrandJp}>鮨商</Text>
              <Text style={styles.titleBrandEn}>SUSHI TRADER</Text>
              <Text style={styles.titleTagline}>{'Sail the ports of old Japan.\nBuy low, sell fresh, build an empire.'}</Text>
            </View>

            {/* Actions — pinned to bottom */}
            <View style={styles.titleActions}>
              <TouchableOpacity
                style={styles.titleContinueBtn}
                onPress={() => setShowTitle(false)}
              >
                <View style={styles.titleContinueInner}>
                  <View>
                    <Text style={styles.titleContinueLabel}>CONTINUE VOYAGE</Text>
                    <Text style={styles.titleContinueMeta}>
                      Day {game.day} · {CITIES[game.cityIndex].name} · {game.cash.toLocaleString()} mon
                    </Text>
                  </View>
                  <Text style={styles.titleContinueArrow}>›</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.titleNewGameBtn} onPress={resetGame}>
                <Text style={styles.titleNewGameText}>
                  <Text style={styles.titleNewGameKanji}>始</Text>{' New Game'}
                </Text>
              </TouchableOpacity>

              <View style={styles.titleLinks}>
                <Text style={styles.titleLinkText}>How to play</Text>
                <Text style={styles.titleLinkText}>Settings</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Traveling Screen
  if (game.traveling) {
    const destinationCity = CITIES[game.traveling.destination];
    const pct = Math.round(travelProgress);
    const hoursRemaining = Math.ceil(game.traveling.travelDuration * (1 - travelProgress / 100));

    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
        <SafeAreaView style={styles.splashContainer}>
          {/* Seigaiha wave pattern */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 402 858" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <Pattern id="sg" width={60} height={30} patternUnits="userSpaceOnUse">
                <Path d="M0,30 A30,30 0 0,1 60,30 M-30,30 A30,30 0 0,1 30,30 M30,30 A30,30 0 0,1 90,30" fill="none" stroke="#e0c081" strokeWidth="1.4" />
              </Pattern>
            </Defs>
            <Rect width="402" height="858" fill="url(#sg)" opacity="0.06" />
          </Svg>

          <View style={styles.splashContent}>
            {/* Big kanji */}
            <Text style={styles.splashKanji}>旅</Text>
            <Text style={styles.splashLabel}>EN ROUTE</Text>

            {/* Route */}
            <View style={styles.splashRoute}>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.splashCityJp}>{currentCity.jp}</Text>
                <Text style={styles.splashCityEn}>{currentCity.name}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={styles.splashDotGold} />
                <Svg width={34} height={2}>
                  <Defs>
                    <LinearGradient id="lg1" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor="#e0c081" stopOpacity="1" />
                      <Stop offset="1" stopColor="#e0c081" stopOpacity="0.1" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="34" height="2" fill="url(#lg1)" rx="1" />
                </Svg>
                <Text style={styles.splashBoat}>舟</Text>
                <Svg width={34} height={2}>
                  <Defs>
                    <LinearGradient id="lg2" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor="#e0c081" stopOpacity="0.1" />
                      <Stop offset="1" stopColor="#9aac9c" stopOpacity="1" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="34" height="2" fill="url(#lg2)" rx="1" />
                </Svg>
                <View style={styles.splashDotMuted} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.splashCityJp}>{destinationCity.jp}</Text>
                <Text style={styles.splashCityEn}>{destinationCity.name}</Text>
              </View>
            </View>

            {/* Progress */}
            <View style={styles.splashProgressWrap}>
              <View style={styles.splashProgressTrack}>
                <View style={[styles.splashProgressFill, { width: `${pct}%` }]} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={styles.splashPct}>{pct}%</Text>
                <Text style={styles.splashRemaining}>{hoursRemaining} hour{hoursRemaining !== 1 ? 's' : ''} remaining</Text>
              </View>
            </View>

            {/* Aging note */}
            <View style={styles.splashNote}>
              <Text style={styles.splashNoteKanji}>鮮</Text>
              <Text style={styles.splashNoteText}>Your catch ages with every hour at sea. Sell on arrival.</Text>
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // ── Arrival Screen (F7) ──
  if (showArrival) {
    const arrCity = CITIES[game.cityIndex];
    const arrEvent = cityEvents[game.cityIndex];
    const arrHour = game.totalHours % 24;
    const popStr = arrCity.population.toLocaleString();
    const arrEventIsActive = arrEvent && arrEvent.type !== 'neutral';
    const isPositive = arrEventIsActive && arrEvent.type === 'positive';
    const fishEffect = arrEvent?.categoryEffects?.fish ?? 1.0;
    const pctChange = arrEventIsActive
      ? fishEffect > 1
        ? `Fish prices up ${Math.round((fishEffect - 1) * 100)}%`
        : `Fish prices down ${Math.round((1 - fishEffect) * 100)}%`
      : null;
    const tipText = isPositive
      ? 'Sell now — prices are elevated. Don\'t miss the window.'
      : 'A buyer\'s market — stock up before you sail on.';

    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
        <SafeAreaView style={styles.splashContainer}>
          {/* Seigaiha wave pattern */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 402 858" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <Pattern id="sg3" width={60} height={30} patternUnits="userSpaceOnUse">
                <Path d="M0,30 A30,30 0 0,1 60,30 M-30,30 A30,30 0 0,1 30,30 M30,30 A30,30 0 0,1 90,30" fill="none" stroke="#e0c081" strokeWidth="1.4" />
              </Pattern>
            </Defs>
            <Rect width="402" height="858" fill="url(#sg3)" opacity="0.06" />
          </Svg>

          <View style={styles.arrivalContent}>
            <Text style={styles.arrivalSuperLabel}>YOU'VE MADE PORT</Text>
            <Text style={styles.arrivalCityJp}>{arrCity.jp}</Text>
            <Text style={styles.arrivalCityEn}>{arrCity.name}</Text>
            <Text style={styles.arrivalMeta}>Day {game.day} · Hour {arrHour} · pop. {popStr}</Text>

            <View style={styles.arrivalDivider} />

            {/* Event card */}
            {arrEventIsActive && (
              <View style={styles.arrivalCard}>
                <View style={styles.arrivalCardTop}>
                  <View style={[styles.arrivalBadge, isPositive ? styles.arrivalBadgePos : styles.arrivalBadgeNeg]}>
                    <Text style={styles.arrivalBadgeKanji}>{arrEvent.kanji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.arrivalEventTitle}>{arrEvent.name} at the docks</Text>
                    <Text style={styles.arrivalEventSub}>{pctChange} — {arrEvent.description}</Text>
                  </View>
                </View>
                <View style={styles.arrivalCardFooter}>
                  <Text style={styles.arrivalTipLabel}>TIP</Text>
                  <Text style={styles.arrivalTipText}>{tipText}</Text>
                </View>
              </View>
            )}

            {/* CTA */}
            <TouchableOpacity style={styles.arrivalCTA} onPress={() => setShowArrival(false)}>
              <Text style={styles.arrivalCTAText}><Text style={styles.arrivalCTAKanji}>市</Text> Enter the market ›</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // ── Travel Screen ──
  if (activeScreen === 'travel') {
    const arrivalHour = (h, hrs) => {
      const total = h + hrs;
      return `Day ${game.day + Math.floor((h % 24 + hrs) / 24)}, Hour ${total % 24}`;
    };

    return (
      <Modal visible animationType="slide" transparent={false} onRequestClose={() => setActiveScreen('market')}>
        <SafeAreaView style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Header */}
            <View style={styles.innerHeaderWrap}>
              <View style={styles.innerHeader}>
                <TouchableOpacity style={styles.innerBackBtn} onPress={() => setActiveScreen('market')}>
                  <Text style={styles.innerBackText}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.innerKanji}>旅</Text>
                  <Text style={styles.innerSubtitle}>SET SAIL</Text>
                </View>
                <View style={styles.innerBackBtn} />
              </View>
              <View style={styles.headerSep} />
            </View>

            <View style={styles.screenBody}>

              {/* FROM row */}
              <View style={styles.travelFromRow}>
                <Text style={styles.travelFromLabel}>FROM</Text>
                <Text style={styles.travelFromCity}>{currentCity.name} {currentCity.jp}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#e6ddca' }} />
                <Text style={styles.travelFromMeta}>Cargo {inventoryCount} / {game.maxInventory} · {game.cash.toLocaleString()} mon</Text>
              </View>

              {/* Port list */}
              {CITIES.map((city, idx) => {
                if (idx === game.cityIndex) return null;
                const baseHours = TRAVEL_DISTANCES[`${game.cityIndex}-${idx}`] || 10;
                const event = cityEvents[idx];
                const evPositive = event && event.type === 'positive';
                return (
                  <TouchableOpacity
                    key={city.name}
                    style={styles.portCard}
                    onPress={() => {
                      const hours = getTravelTime(game.cityIndex, idx);
                      setTravelConfirm({ destinationIdx: idx, hours });
                    }}
                  >
                    <View style={styles.portBadge}>
                      <Text style={styles.portBadgeText}>{city.kanji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.portName}>
                        {city.name}{' '}
                        <Text style={styles.portJp}>{city.jp}</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 }}>
                        <Text style={styles.portPop}>pop. {(city.population / 1000).toFixed(0)}k</Text>
                        {event && event.type !== 'neutral' && (
                          <View style={[styles.portEventBadge, { backgroundColor: evPositive ? 'rgba(187,148,87,0.14)' : 'rgba(155,34,38,0.10)' }]}>
                            <Text style={[styles.portEventKanji, { color: evPositive ? '#bb9457' : '#9b2226' }]}>{event.kanji}</Text>
                            <Text style={[styles.portEventName, { color: evPositive ? '#bb9457' : '#9b2226' }]}>{event.name}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                        <Text style={styles.portHours}>{baseHours}</Text>
                        <Text style={styles.portHoursUnit}>h</Text>
                      </View>
                      <Text style={styles.portSail}>Sail ›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <View style={{ height: 24 }} />
            </View>
          </ScrollView>
        </SafeAreaView>

        {/* Travel Confirm Sheet */}
        {travelConfirm && (() => {
          const dest = CITIES[travelConfirm.destinationIdx];
          const hours = travelConfirm.hours;
          const arrival = arrivalHour(game.totalHours, hours);
          const spoilageWarnings = computeTravelSpoilage(hours);
          const anySpoils = spoilageWarnings.some(w => w.willSpoil > 0);

          return (
            <Modal visible transparent animationType="slide">
              <View style={styles.bsOverlay}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setTravelConfirm(null)} activeOpacity={1} />
                <View style={styles.bsSheet}>
                  <View style={styles.bsHandle} />

                  {/* Route display */}
                  <View style={styles.tcRoute}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.tcCityJp}>{currentCity.jp}</Text>
                      <Text style={styles.tcCityEn}>{currentCity.name}</Text>
                    </View>
                    <View style={{ alignItems: 'center', paddingBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={styles.tcDotOrigin} />
                        <View style={styles.tcLine} />
                        <Text style={styles.tcBoat}>舟</Text>
                        <View style={styles.tcLine} />
                        <View style={styles.tcDotDest} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.tcCityJp}>{dest.jp}</Text>
                      <Text style={styles.tcCityEn}>{dest.name}</Text>
                    </View>
                  </View>
                  <Text style={styles.tcMeta}>{hours} hours at sea · arrive {arrival}</Text>

                  {/* Spoilage risk card */}
                  {inventoryCount > 0 && (
                    <View style={styles.tcSpoilCard}>
                      <View style={styles.tcSpoilHeader}>
                        <Text style={styles.tcSpoilKanji}>鮮</Text>
                        <Text style={styles.tcSpoilTitle}>Your cargo ages {hours}h en route</Text>
                      </View>
                      {spoilageWarnings.map((w, i) => {
                        const isLast = i === spoilageWarnings.length - 1;
                        const outcomeText = w.willSpoil > 0
                          ? `${w.willSpoil} will spoil`
                          : w.turnsUrgent > 0
                            ? `${w.turnsUrgent} turns Urgent`
                            : `${w.turnsAging} turns Aging`;
                        const outcomeColor = w.willSpoil > 0 ? '#9b2226' : '#bb9457';
                        return (
                          <View key={w.sushi.name} style={[styles.tcSpoilRow, !isLast && styles.tcSpoilRowBorder]}>
                            <View style={styles.tcSpoilBadge}>
                              <Text style={styles.tcSpoilBadgeText}>{w.sushi.kanji}</Text>
                            </View>
                            <Text style={styles.tcSpoilName}>{w.sushi.name} ×{w.totalQty}</Text>
                            <Text style={[styles.tcSpoilOutcome, { color: outcomeColor }]}>{outcomeText}</Text>
                          </View>
                        );
                      })}
                      {spoilageWarnings.length === 0 && (
                        <View style={styles.tcSpoilRow}>
                          <Text style={[styles.tcSpoilName, { color: '#2f7d72' }]}>All cargo will survive the voyage ✓</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Warning box */}
                  {anySpoils && (
                    <View style={styles.tcWarnBox}>
                      <Text style={styles.tcWarnKanji}>注</Text>
                      <Text style={styles.tcWarnText}>
                        Sell your spoiling cargo before you sail, or lose value at sea.
                      </Text>
                    </View>
                  )}

                  {/* Buttons */}
                  <View style={styles.tcButtons}>
                    <TouchableOpacity style={styles.tcCancel} onPress={() => setTravelConfirm(null)}>
                      <Text style={styles.tcCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.tcConfirm}
                      onPress={() => {
                        setTravelConfirm(null);
                        setActiveScreen('market');
                        startTravel(travelConfirm.destinationIdx, travelConfirm.hours);
                      }}
                    >
                      <Text style={styles.tcConfirmText}>
                        <Text style={{ fontFamily: 'ShipporiMinchoB1_700Bold' }}>帆</Text>
                        {' '}Set sail ›
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          );
        })()}
      </Modal>
    );
  }

  // ── The Hold Screen ──
  if (activeScreen === 'hold') {
    const heldItems = SUSHI_TYPES.filter(s => (game.inventory[s.name] || []).reduce((t, b) => t + b.qty, 0) > 0);
    const stateColor = (s) => {
      if (s === 'fresh') return '#2f7d72';
      if (s === 'aging') return '#bb9457';
      if (s === 'urgent') return '#9b2226';
      return '#8a8d86';
    };
    const stateBg = (s) => {
      if (s === 'fresh') return 'rgba(47,125,114,0.08)';
      if (s === 'aging') return 'rgba(187,148,87,0.08)';
      if (s === 'urgent') return 'rgba(155,34,38,0.07)';
      return 'rgba(138,141,134,0.08)';
    };
    const stateBd = (s) => {
      if (s === 'fresh') return 'rgba(47,125,114,0.28)';
      if (s === 'aging') return 'rgba(187,148,87,0.30)';
      if (s === 'urgent') return 'rgba(155,34,38,0.28)';
      return 'rgba(138,141,134,0.28)';
    };
    const stateLabel = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const fillPct = Math.min(1, inventoryCount / game.maxInventory);

    return (
      <Modal visible animationType="slide" transparent={false} onRequestClose={() => setActiveScreen('market')}>
        <SafeAreaView style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>

            {/* ── Hold Inner Header ── */}
            <View style={styles.innerHeaderWrap}>
              <View style={styles.innerHeader}>
                <TouchableOpacity style={styles.innerBackBtn} onPress={() => setActiveScreen('market')}>
                  <Text style={styles.innerBackText}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.innerKanji}>蔵</Text>
                  <Text style={styles.innerSubtitle}>THE HOLD</Text>
                </View>
                <View style={styles.innerBackBtn} />
              </View>
              <View style={styles.headerSep} />
            </View>

            <View style={styles.screenBody}>

              {/* ── Capacity Gauge ── */}
              <View style={styles.holdGaugeCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={styles.holdGaugeLabel}>CARGO CAPACITY</Text>
                  <Text style={styles.holdGaugeCount}>
                    <Text style={styles.holdGaugeNum}>{inventoryCount}</Text>
                    <Text style={styles.holdGaugeSub}> / {game.maxInventory} crates</Text>
                  </Text>
                </View>
                <View style={styles.holdGaugeBar}>
                  <View style={[styles.holdGaugeFill, { width: `${Math.round(fillPct * 100)}%` }]} />
                </View>
                <Text style={styles.holdGaugeHint}>Goods age each hour. Sell before the catch turns.</Text>
              </View>

              {/* ── Section Head ── */}
              <View style={styles.sectionHead}>
                <Text style={styles.sectionKanji}>積荷</Text>
                <Text style={styles.sectionHeadTitle}>Held Stock</Text>
                <View style={styles.sectionLine} />
              </View>

              {/* ── Hold Cards ── */}
              {heldItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontFamily: 'ShipporiMinchoB1_700Bold', fontSize: 28, color: '#c8c0b0' }}>空</Text>
                  <Text style={{ fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 13, color: '#9aa39e', marginTop: 8 }}>Hold is empty</Text>
                </View>
              ) : heldItems.map(sushi => {
                const batches = getBatches(sushi.name).sort((a, b) => a.acquiredAtHour - b.acquiredAtHour);
                const totalQty = batches.reduce((s, b) => s + b.qty, 0);
                const realizableValue = getRealizableValue(sushi.name);
                const costBasis = getCostBasis(sushi.name);
                const pl = getUnrealizedPL(sushi.name);
                const plColor = pl >= 0 ? '#2f7d72' : '#9b2226';
                const plSign = pl >= 0 ? '+' : '';
                const ingredientGood = isIngredient(sushi.name);
                const hasSpoiled = !ingredientGood && batches.some(b => getSpoilageState(b.acquiredAtHour) === 'spoiled');

                return (
                  <View key={sushi.name} style={styles.holdCard}>
                    {/* Top row */}
                    <View style={styles.holdCardTop}>
                      <View style={styles.holdBadge}>
                        <Text style={styles.holdBadgeText}>{sushi.kanji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.holdName}>
                          {sushi.name} <Text style={styles.holdQty}>×{totalQty}</Text>
                        </Text>
                        <Text style={styles.holdMarketPrice}>market {prices[sushi.name] || sushi.basePrice} mon</Text>
                      </View>
                      <View style={styles.holdValueCol}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, justifyContent: 'flex-end' }}>
                          <Text style={styles.holdValue}>{realizableValue}</Text>
                          <Text style={styles.holdValueMon}>mon</Text>
                        </View>
                        <Text style={styles.holdPaid}>est. value · paid {costBasis} mon</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, justifyContent: 'flex-end', marginTop: 3 }}>
                          <Text style={[styles.holdPL, { color: plColor }]}>{plSign}{pl}</Text>
                          <Text style={[styles.holdPLLabel, { color: plColor }]}>if sold now</Text>
                        </View>
                      </View>
                    </View>

                    {/* Batch chips */}
                    <View style={styles.holdChips}>
                      {batches.map((batch, i) => {
                        const state = ingredientGood ? 'fresh' : getSpoilageState(batch.acquiredAtHour);
                        const ink = stateColor(state);
                        const bg = stateBg(state);
                        const bd = stateBd(state);
                        const leftText = ingredientGood
                          ? 'no spoilage'
                          : state === 'spoiled' ? 'spoiled' : `${getHoursRemaining(batch.acquiredAtHour)}h left`;
                        return (
                          <View key={i} style={[styles.holdChip, { backgroundColor: bg, borderColor: bd }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <View style={[styles.holdChipDot, { backgroundColor: ink }]} />
                              <Text style={[styles.holdChipLabel, { color: ink }]}>{stateLabel(state)}</Text>
                            </View>
                            <Text style={styles.holdChipSub}>×{batch.qty} · {leftText}</Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Actions */}
                    <View style={styles.holdActions}>
                      <TouchableOpacity onPress={() => { setActiveScreen('market'); openSellSheet(sushi, 1); }}>
                        <Text style={styles.holdSellLink}>Sell 1</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setActiveScreen('market'); openSellSheet(sushi, totalQty); }}>
                        <Text style={styles.holdSellLink}>Sell all</Text>
                      </TouchableOpacity>
                      <View style={{ flex: 1 }} />
                      {hasSpoiled && (
                        <TouchableOpacity onPress={() => discardSpoiled(sushi.name)}>
                          <Text style={styles.holdDiscardLink}>Discard spoiled</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* ── Legend ── */}
              <View style={styles.holdLegend}>
                {[
                  { state: 'fresh', label: 'Fresh' },
                  { state: 'aging', label: 'Aging −20%' },
                  { state: 'urgent', label: 'Urgent −50%' },
                  { state: 'spoiled', label: 'Spoiled' },
                ].map(({ state, label }) => (
                  <View key={state} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stateColor(state) }} />
                    <Text style={styles.holdLegendText}>{label}</Text>
                  </View>
                ))}
              </View>

            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Price Board Screen (F14) ──
  if (activeScreen === 'priceboard') {
    const selSushi = SUSHI_TYPES.find(s => s.name === selectedPriceSushi) || SUSHI_TYPES[0];
    const avgCost = Math.round(getAvgCost(selSushi.name));

    const rankedCities = CITIES
      .map((city, idx) => ({
        city, idx,
        price: getPrice(selSushi.name, idx, game.totalHours, localHour),
        event: cityEvents[idx],
      }))
      .sort((a, b) => b.price - a.price);

    const bestCity = rankedCities.find(r => r.idx !== game.cityIndex);

    return (
      <Modal visible animationType="slide" transparent={false} onRequestClose={() => setActiveScreen('market')}>
        <SafeAreaView style={styles.pbContainer}>
          <View style={styles.innerHeaderWrap}>
            <View style={styles.innerHeader}>
              <TouchableOpacity style={styles.innerBackBtn} onPress={() => setActiveScreen('market')}>
                <Text style={styles.innerBackText}>‹</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.innerKanji}>相場</Text>
                <Text style={styles.innerSubtitle}>PRICE BOARD</Text>
              </View>
              <View style={styles.innerBackBtn} />
            </View>
            <View style={styles.headerSep} />
          </View>

          <ScrollView contentContainerStyle={styles.pbBody} showsVerticalScrollIndicator={false}>
            {/* Commodity chip selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pbChipScroll} contentContainerStyle={{ gap: 7, paddingRight: 16 }}>
              {SUSHI_TYPES.map(s => {
                const active = s.name === selectedPriceSushi;
                return (
                  <TouchableOpacity key={s.name} style={[styles.pbChip, active ? styles.pbChipActive : styles.pbChipInactive]} onPress={() => setSelectedPriceSushi(s.name)}>
                    <Text style={[styles.pbChipKanji, active ? styles.pbChipKanjiActive : styles.pbChipKanjiInactive]}>{s.kanji}</Text>
                    <Text style={[styles.pbChipName, active ? styles.pbChipNameActive : styles.pbChipNameInactive]}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Best callout */}
            {bestCity && (
              <View style={styles.pbBest}>
                <Text style={styles.pbBestKanji}>高</Text>
                <Text style={styles.pbBestText} numberOfLines={1}>
                  <Text style={styles.pbBestHighlight}>Best sale in {bestCity.city.name} {bestCity.city.jp}</Text>
                  <Text style={styles.pbBestSub}> — {bestCity.price} mon{avgCost > 0 ? `, +${bestCity.price - avgCost} over your cost` : ''}</Text>
                </Text>
              </View>
            )}

            {/* Column header */}
            <View style={styles.pbColHeader}>
              <Text style={styles.pbColLeft}>your avg cost {avgCost > 0 ? `${avgCost} mon` : '—'}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#e6ddca', marginHorizontal: 8 }} />
              <Text style={styles.pbColRight}>PRICE · PROFIT/CRATE · SAIL</Text>
            </View>

            {/* City rows */}
            {rankedCities.map(({ city, idx, price, event }, rank) => {
              const isHere = idx === game.cityIndex;
              const isBest = !isHere && rank === rankedCities.findIndex(r => r.idx !== game.cityIndex);
              const delta = avgCost > 0 ? price - avgCost : null;
              const deltaColor = delta === null ? '#9aa39e' : delta >= 0 ? '#2f7d72' : '#9b2226';
              const travelHrs = isHere ? null : getTravelTime(game.cityIndex, idx);
              const evActive = event && event.type !== 'neutral';
              const evPositive = evActive && event.type === 'positive';
              return (
                <View key={idx} style={[styles.pbRow, isBest && styles.pbRowBest, isHere && styles.pbRowHere]}>
                  <View style={styles.pbCityBadge}>
                    <Text style={styles.pbCityBadgeKanji}>{city.kanji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pbCityName}>
                      {city.name}{' '}
                      <Text style={styles.pbCityJp}>{city.jp}</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {isHere ? (
                        <View style={styles.pbHereBadge}>
                          <Text style={styles.pbHereBadgeText}>YOU ARE HERE</Text>
                        </View>
                      ) : evActive ? (
                        <Text style={[styles.pbEventTag, { color: evPositive ? '#bb9457' : '#9b2226' }]}>{event.name}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.pbPrice}>{price}</Text>
                    {delta !== null && (
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 2 }}>
                        <Text style={[styles.pbDelta, { color: deltaColor }]}>{delta >= 0 ? `+${delta}` : `${delta}`}</Text>
                        <Text style={[styles.pbDeltaLabel, { color: deltaColor }]}>/crate</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.pbSailCol}>
                    {isHere ? (
                      <Text style={styles.pbSailDash}>—</Text>
                    ) : (
                      <>
                        <Text style={styles.pbSailHrs}>{travelHrs}</Text>
                        <Text style={styles.pbSailUnit}>h</Text>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // Bankrupt Screen (F12) — shown when cash=0 and nothing sellable
  if (isBankrupt) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
        <SafeAreaView style={styles.bankruptContainer}>
          {/* Seigaiha — crimson stroke, 5% opacity */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 402 858" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <Pattern id="sg_bankrupt" width={60} height={30} patternUnits="userSpaceOnUse">
                <Path d="M0,30 A30,30 0 0,1 60,30 M-30,30 A30,30 0 0,1 30,30 M30,30 A30,30 0 0,1 90,30" fill="none" stroke="#9b2226" strokeWidth="1.4" />
              </Pattern>
            </Defs>
            <Rect width="402" height="858" fill="url(#sg_bankrupt)" opacity="0.05" />
          </Svg>

          <View style={styles.bankruptInner}>
            <Text style={styles.bankruptKanji}>破産</Text>
            <Text style={styles.bankruptTitle}>BANKRUPT</Text>
            <Text style={styles.bankruptBody}>
              The coffers are empty and the creditors have come. The house of Sushi Trader is closed.
            </Text>

            {/* Stats table */}
            <View style={styles.bankruptGrid}>
              <View style={styles.bankruptRow}>
                <View style={[styles.bankruptCell, styles.bankruptCellRight]}>
                  <Text style={styles.bankruptStatVal}>{game.day}</Text>
                  <Text style={styles.bankruptStatLbl}>days traded</Text>
                </View>
                <View style={styles.bankruptCell}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                    <Text style={[styles.bankruptStatVal, { color: '#e0c081' }]}>{(game.peakPurse || 0).toLocaleString()}</Text>
                    <Text style={styles.bankruptStatMon}>mon</Text>
                  </View>
                  <Text style={styles.bankruptStatLbl}>peak purse</Text>
                </View>
              </View>
              <View style={[styles.bankruptRow, styles.bankruptRowTop]}>
                <View style={[styles.bankruptCell, styles.bankruptCellRight]}>
                  <Text style={styles.bankruptStatVal}>{game.restaurants.length}</Text>
                  <Text style={styles.bankruptStatLbl}>eateries built</Text>
                </View>
                <View style={styles.bankruptCell}>
                  <Text style={styles.bankruptStatVal}>{game.lifetimePortsVisited || 0}</Text>
                  <Text style={styles.bankruptStatLbl}>ports visited</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.bankruptCTA} onPress={resetGame}>
              <Text style={styles.bankruptCTAText}>
                <Text style={styles.bankruptCTAKanji}>再起</Text>{'  Start anew'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <Text style={styles.logoKanji}>鮨商</Text>
            <Text style={styles.logoSub}>SUSHI TRADER</Text>
            <View style={styles.headerSep} />
          </View>

          <View style={styles.screenBody}>

            {/* ── Stat Bar ── */}
            <View style={styles.statBar}>
              <View style={[styles.statCell, { flex: 1.3 }]}>
                <Text style={styles.statLabel}>CASH</Text>
                <View style={styles.statValueRow}>
                  <Text style={styles.statNumber}>{game.cash.toLocaleString()}</Text>
                  <Text style={styles.statUnit}> mon</Text>
                </View>
              </View>
              <View style={styles.statSep} />
              <TouchableOpacity style={styles.statCell} onPress={() => setActiveScreen('hold')}>
                <Text style={styles.statLabel}>CARGO</Text>
                <Text style={styles.statNumber}>
                  {inventoryCount}<Text style={styles.statMuted}>/{game.maxInventory}</Text>
                </Text>
              </TouchableOpacity>
              <View style={styles.statSep} />
              <TouchableOpacity style={[styles.statCell, { flex: 0.85 }]} onPress={() => setShowEateries(true)}>
                <Text style={styles.statLabel}>EATERIES</Text>
                <Text style={styles.statNumber}>{game.restaurants.length}</Text>
              </TouchableOpacity>
            </View>

            {/* ── City Card ── */}
            <View style={styles.cityCard}>
              <Text style={[styles.statLabel, { marginBottom: 3 }]}>CURRENT LOCATION</Text>
              <View style={styles.cityTopRow}>
                <View style={styles.cityLeft}>
                  <View style={styles.cityKanjiBadge}>
                    <Text style={styles.cityKanjiText}>{currentCity.kanji}</Text>
                  </View>
                  <View style={styles.cityNameBlock}>
                    <Text style={styles.cityNameText}>
                      {currentCity.name}{' '}
                      <Text style={styles.cityJpText}>{currentCity.jp}</Text>
                    </Text>
                    <Text style={styles.cityMetaText}>Day {game.day} · Hour {game.totalHours % GAME_HOURS_PER_DAY}</Text>
                  </View>
                </View>
                {currentEvent && currentEvent.type !== 'neutral' ? (
                  <View style={styles.cityEventBadge}>
                    <Text style={styles.cityEventKanji}>{currentEvent.kanji}</Text>
                    <View>
                      <Text style={styles.cityEventName}>{currentEvent.name}</Text>
                      <Text style={styles.cityEventDir}>Prices {currentEvent.type === 'positive' ? '↑' : '↓'}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
              {currentNews ? (
                <>
                  <View style={styles.cityNewsSep} />
                  <View style={styles.cityNewsRow}>
                    <Text style={styles.cityNewsLabel}>NEWS</Text>
                    <Text style={styles.cityNewsText} numberOfLines={1}>
                      {currentNews.city.name} {currentNews.city.jp} — {currentNews.event.emoji} {currentNews.event.name}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            {/* ── Nav Buttons ── */}
            <View style={styles.navRow}>
              <TouchableOpacity
                style={[styles.navPrimary, game.traveling ? styles.navDisabled : null]}
                onPress={() => setActiveScreen('travel')}
                disabled={!!game.traveling}
              >
                <Text style={styles.navPrimaryText}>旅  Travel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navSecondary}
                onPress={() => setActiveScreen('priceboard')}
              >
                <Text style={styles.navSecondaryText}>相場  Prices</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navSecondary, game.traveling ? styles.navDisabled : null]}
                onPress={() => setShowShop(true)}
                disabled={!!game.traveling}
              >
                <Text style={styles.navSecondaryText}>店  Supplies</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navSecondary, game.traveling ? styles.navDisabled : null]}
                onPress={() => setShowRestaurants(true)}
                disabled={!!game.traveling}
              >
                <Text style={styles.navSecondaryText}>拡  Invest</Text>
              </TouchableOpacity>
            </View>

            {showDevTools && (
              <View style={styles.devToolsRow}>
                <TouchableOpacity style={styles.devToolButton} onPress={handleDevAdvance}>
                  <Text style={styles.devToolButtonText}>Dev +hours</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.devToolButton} onPress={inspectGameStateForDev}>
                  <Text style={styles.devToolButtonText}>Inspect</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.devToolButton}
                  onPress={() => {
                    Alert.prompt(
                      'Set local hour',
                      '0–23 (blank to use real clock)',
                      (text) => {
                        if (text === '' || text === null) {
                          setDevLocalHourOverride(null);
                        } else {
                          const h = parseInt(text, 10);
                          if (!Number.isNaN(h) && h >= 0 && h <= 23) setDevLocalHourOverride(h);
                        }
                      },
                      'plain-text',
                      devLocalHourOverride !== null ? String(devLocalHourOverride) : ''
                    );
                  }}
                >
                  <Text style={styles.devToolButtonText}>
                    {devLocalHourOverride !== null ? `Hour:${devLocalHourOverride}` : 'Set hour'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.devToolButton} onPress={resetGame}>
                  <Text style={styles.devToolButtonText}>Reset</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Fresh Catch ── */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionKanji}>鮮魚</Text>
              <Text style={styles.sectionHeadTitle}>Fresh Catch</Text>
              <View style={styles.sectionLine} />
            </View>
            {SUSHI_TYPES.filter(item => item.category === 'fish').map(sushi => (
              <FishItem key={sushi.name} sushi={sushi} />
            ))}

            {/* ── Pantry ── */}
            <View style={[styles.sectionHead, { marginTop: 24 }]}>
              <Text style={styles.sectionKanji}>乾物</Text>
              <Text style={styles.sectionHeadTitle}>Pantry</Text>
              <View style={styles.sectionNeverSpoils}>
                <Text style={styles.sectionNeverSpoilsText}>never spoils</Text>
              </View>
              <View style={styles.sectionLine} />
            </View>
            {SUSHI_TYPES.filter(item => item.category === 'ingredient').map(sushi => (
              <IngredientItem key={sushi.name} sushi={sushi} />
            ))}

            <Text style={styles.pantryFooter}>
              Staples hold their value — safe ballast on long voyages.
            </Text>

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>

        {/* (Travel screen moved to activeScreen === 'travel') */}

        {/* Expand/Restaurants Modal */}
        {/* Expand Modal (F4) */}
        <Modal visible={showRestaurants} animationType="slide" transparent={false}>
          <>
            <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
            <SafeAreaView style={styles.expandContainer}>
              <View style={styles.innerHeaderWrap}>
                <View style={styles.innerHeader}>
                  <TouchableOpacity style={styles.innerBackBtn} onPress={() => setShowRestaurants(false)}>
                    <Text style={styles.innerBackText}>‹</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.innerKanji}>拡</Text>
                    <Text style={styles.innerSubtitle}>EXPAND</Text>
                  </View>
                  <View style={styles.innerBackBtn} />
                </View>
                <View style={styles.headerSep} />
              </View>
              <ScrollView contentContainerStyle={styles.expandBody}>
                {/* City bar */}
                <View style={styles.expandCityBar}>
                  <Text style={styles.expandCityIn}>IN</Text>
                  <Text style={styles.expandCityName}>{currentCity.name} {currentCity.jp}</Text>
                  <View style={styles.expandCityLine} />
                  <Text style={styles.expandCityOwned}>{game.restaurants.filter(r => CITIES.indexOf(CITIES[game.cityIndex]) === game.cityIndex).length} eateries owned</Text>
                </View>
                {/* Restaurant cards */}
                {RESTAURANTS.map(restaurant => {
                  const canAfford = game.cash >= restaurant.cost;
                  const alreadyOwned = game.restaurants.some(r => r.tierId === restaurant.id && r.cityIndex === game.cityIndex);
                  return (
                    <View key={restaurant.id} style={styles.expandCard}>
                      <View style={styles.expandCardTop}>
                        <View style={styles.expandBadge}>
                          <Text style={styles.expandBadgeKanji}>{restaurant.kanji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expandCardName}>{restaurant.name}</Text>
                          <Text style={styles.expandCardSub}>Seats {restaurant.capacity} · {restaurant.dailyRevenue} mon/day</Text>
                        </View>
                      </View>
                      <View style={styles.expandCardFooter}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                          <Text style={[styles.expandCost, canAfford ? styles.expandCostAfford : styles.expandCostNoAfford]}>
                            {restaurant.cost.toLocaleString()}
                          </Text>
                          <Text style={styles.expandCostMon}>mon</Text>
                        </View>
                        {alreadyOwned ? (
                          <View style={styles.expandBtnOwned}>
                            <Text style={styles.expandBtnOwnedText}>Already owned</Text>
                          </View>
                        ) : canAfford ? (
                          <TouchableOpacity style={styles.expandBtnBuy} onPress={() => buyRestaurant(restaurant)}>
                            <Text style={styles.expandBtnBuyText}>Open here</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.expandBtnCant}>
                            <Text style={styles.expandBtnCantText}>Can't afford</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </SafeAreaView>
          </>
        </Modal>

        {/* Day Summary Modal */}
        <Modal visible={showDaySummary} animationType="slide" transparent={false}>
          {game.lastDayLedger && (() => {
            const l = game.lastDayLedger;
            const netPositive = l.net >= 0;
            const netColor = netPositive ? '#2f7d72' : '#9b2226';
            const netSign = netPositive ? '+' : '−';
            const netAbs = Math.abs(l.net).toLocaleString();
            return (
              <>
                <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
                <SafeAreaView style={styles.daySummaryContainer}>
                  {/* Header */}
                  <View style={styles.innerHeaderWrap}>
                    <View style={styles.innerHeader}>
                      <View style={styles.innerBackBtn} />
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={styles.innerKanji}>日報</Text>
                        <Text style={styles.innerSubtitle}>DAY {l.day} · CLOSED</Text>
                      </View>
                      <TouchableOpacity style={styles.innerBackBtn} onPress={() => setShowDaySummary(false)}>
                        <Text style={styles.innerBackText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.headerSep} />
                  </View>

                  <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.dsBody}>
                    {/* Net headline */}
                    <View style={styles.dsNetWrap}>
                      <Text style={styles.dsNetLabel}>NET FOR THE DAY</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, justifyContent: 'center', marginTop: 6 }}>
                        <Text style={[styles.dsNetValue, { color: netColor }]}>{netSign}{netAbs}</Text>
                        <Text style={[styles.dsNetUnit, { color: netColor }]}>mon</Text>
                      </View>
                    </View>

                    {/* Ledger card */}
                    <View style={styles.dsLedger}>
                      <View style={[styles.dsRow, styles.dsRowDash]}>
                        <View style={styles.dsRowLeft}>
                          <Text style={styles.dsRowKanji}>商</Text>
                          <Text style={styles.dsRowLabel}>Trading profit</Text>
                        </View>
                        <Text style={[styles.dsRowValue, l.tradingProfit > 0 ? styles.dsGain : styles.dsMuted]}>
                          {l.tradingProfit > 0 ? '+' : ''}{l.tradingProfit.toLocaleString()}
                        </Text>
                      </View>
                      <View style={[styles.dsRow, styles.dsRowDash]}>
                        <View style={styles.dsRowLeft}>
                          <Text style={styles.dsRowKanji}>店</Text>
                          <Text style={styles.dsRowLabel}>
                            Eatery revenue{' '}
                            <Text style={styles.dsMuted}>· {game.restaurants.length} eateries</Text>
                          </Text>
                        </View>
                        <Text style={[styles.dsRowValue, l.eateryRevenue > 0 ? styles.dsGain : styles.dsMuted]}>
                          +{l.eateryRevenue.toLocaleString()}
                        </Text>
                      </View>
                      <View style={[styles.dsRow, styles.dsRowDash]}>
                        <View style={styles.dsRowLeft}>
                          <Text style={styles.dsRowKanji}>腐</Text>
                          <Text style={styles.dsRowLabel}>Spoilage losses</Text>
                        </View>
                        <Text style={[styles.dsRowValue, l.spoilageLoss > 0 ? styles.dsLoss : styles.dsMuted]}>
                          {l.spoilageLoss > 0 ? `−${l.spoilageLoss.toLocaleString()}` : '0'}
                        </Text>
                      </View>
                      <View style={styles.dsRow}>
                        <View style={styles.dsRowLeft}>
                          <Text style={styles.dsRowKanji}>旅</Text>
                          <Text style={styles.dsRowLabel}>
                            Voyages{' '}
                            <Text style={styles.dsMuted}>· {l.portsVisited} leg{l.portsVisited !== 1 ? 's' : ''}</Text>
                          </Text>
                        </View>
                        <Text style={styles.dsRowValueNeutral}>{l.portsVisited} port{l.portsVisited !== 1 ? 's' : ''}</Text>
                      </View>
                    </View>

                    {/* Purse tile */}
                    <View style={styles.dsPurseTile}>
                      <View>
                        <Text style={styles.dsPurseLabel}>PURSE AT DAY'S END</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 3 }}>
                          <Text style={styles.dsPurseValue}>{l.purseEnd.toLocaleString()}</Text>
                          <Text style={styles.dsPurseMon}>mon</Text>
                        </View>
                      </View>
                      <Text style={styles.dsPurseKanji}>〆</Text>
                    </View>

                    {/* CTA */}
                    <TouchableOpacity style={styles.dsBeginButton} onPress={() => setShowDaySummary(false)}>
                      <Text style={styles.dsBeginText}>Begin Day {l.day + 1} ›</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </SafeAreaView>
              </>
            );
          })()}
        </Modal>

        {/* Provisions Modal (F5) */}
        <Modal visible={showShop} animationType="slide" transparent={false}>
          <>
            <StatusBar barStyle="light-content" backgroundColor="#1c2b29" />
            <SafeAreaView style={styles.expandContainer}>
              <View style={styles.innerHeaderWrap}>
                <View style={styles.innerHeader}>
                  <TouchableOpacity style={styles.innerBackBtn} onPress={() => setShowShop(false)}>
                    <Text style={styles.innerBackText}>‹</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.innerKanji}>店</Text>
                    <Text style={styles.innerSubtitle}>PROVISIONS</Text>
                  </View>
                  <View style={styles.innerBackBtn} />
                </View>
                <View style={styles.headerSep} />
              </View>
              <ScrollView contentContainerStyle={styles.expandBody}>
                {/* Purse tile */}
                <View style={styles.provPurseTile}>
                  <View>
                    <Text style={styles.provPurseLabel}>PURSE</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 3 }}>
                      <Text style={styles.provPurseValue}>{game.cash.toLocaleString()}</Text>
                      <Text style={styles.provPurseMon}>mon</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.provPurseLabel}>CARGO</Text>
                    <Text style={[styles.provPurseValue, { marginTop: 3 }]}>
                      {inventoryCount}<Text style={styles.provCargoMax}>/{game.maxInventory}</Text>
                    </Text>
                  </View>
                </View>
                {/* Section header */}
                <View style={styles.provSectionRow}>
                  <Text style={styles.provSectionKanji}>行李</Text>
                  <Text style={styles.provSectionLabel}>Cargo Upgrades</Text>
                  <View style={styles.expandCityLine} />
                </View>
                {/* Upgrade cards */}
                {UPGRADES.map(upgrade => {
                  const owned = game.ownedUpgrades.includes(upgrade.id);
                  const canAfford = game.cash >= upgrade.cost;
                  return (
                    <TouchableOpacity
                      key={upgrade.id}
                      style={[styles.provCard, owned && styles.provCardOwned]}
                      onPress={() => !owned && buyUpgrade(upgrade)}
                      activeOpacity={owned ? 1 : 0.7}
                    >
                      <View style={styles.provCardInner}>
                        <View style={styles.provBadge}>
                          <Text style={styles.provBadgeKanji}>{upgrade.kanji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.provCardName}>{upgrade.name}</Text>
                          <Text style={styles.provCardSub}>{upgrade.description}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          {owned ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={styles.provOwned}>✓ Owned</Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                              <Text style={[styles.provCost, canAfford ? styles.expandCostAfford : styles.expandCostNoAfford]}>
                                {upgrade.cost.toLocaleString()}
                              </Text>
                              <Text style={styles.expandCostMon}>mon</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <Text style={styles.provFootnote}>Bigger holds carry more catch between ports.</Text>
              </ScrollView>
            </SafeAreaView>
          </>
        </Modal>
        {/* Buy Stepper Sheet */}
        {buyModal && (() => {
          const sushi = buyModal;
          const price = prices[sushi.name] || sushi.basePrice;
          const totalCost = price * buyQty;
          const cargoAfter = inventoryCount + buyQty;
          const canAfford = game.cash >= totalCost;
          const hasCargo = cargoAfter <= game.maxInventory;
          const canBuy = canAfford && hasCargo && buyQty > 0;
          const maxAffordable = Math.min(
            Math.floor(game.cash / price),
            game.maxInventory - inventoryCount
          );
          const fillHold = game.maxInventory - inventoryCount;
          const trendColor = price > sushi.basePrice ? '#2f7d72' : price < sushi.basePrice ? '#9b2226' : '#9aa39e';
          const trendArrow = price > sushi.basePrice ? '↗' : price < sushi.basePrice ? '↘' : '→';
          return (
            <Modal visible transparent animationType="slide">
              <View style={styles.bsOverlay}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setBuyModal(null)} activeOpacity={1} />
                <View style={styles.bsSheet}>
                  <View style={styles.bsHandle} />

                  {/* Fish info */}
                  <View style={styles.bsFishRow}>
                    <View style={styles.bsFishBadge}>
                      <Text style={styles.bsFishKanji}>{sushi.kanji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bsFishName}>
                        {sushi.name}{' '}
                        <Text style={styles.bsFishSub}>{sushi.en}</Text>
                      </Text>
                      <Text style={styles.bsFishMeta}>
                        market price {price} mon · trending{' '}
                        <Text style={{ color: trendColor }}>{trendArrow}</Text>
                      </Text>
                    </View>
                  </View>

                  {/* Stepper */}
                  <View style={styles.bsStepper}>
                    <TouchableOpacity
                      style={styles.bsStepMinus}
                      onPress={() => setBuyQty(q => Math.max(1, q - 1))}
                    >
                      <Text style={styles.bsStepMinusText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.bsQtyBlock}>
                      <Text style={styles.bsQtyNum}>{buyQty}</Text>
                      <Text style={styles.bsQtyLabel}>crates</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.bsStepPlus}
                      onPress={() => setBuyQty(q => q + 1)}
                    >
                      <Text style={styles.bsStepPlusText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Quick pills */}
                  <View style={styles.bsPills}>
                    <TouchableOpacity
                      style={styles.bsPill}
                      onPress={() => setBuyQty(Math.max(1, maxAffordable))}
                    >
                      <Text style={styles.bsPillPrimary}>Max affordable</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.bsPill}
                      onPress={() => setBuyQty(Math.max(1, fillHold))}
                    >
                      <Text style={styles.bsPillMuted}>Fill hold</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Summary */}
                  <View style={styles.bsSummary}>
                    <View style={styles.bsSummaryRow}>
                      <Text style={styles.bsSummaryLabel}>Unit price</Text>
                      <Text style={styles.bsSummaryValue}>{price} mon</Text>
                    </View>
                    <View style={[styles.bsSummaryRow, styles.bsSummaryBorder]}>
                      <Text style={styles.bsSummaryLabel}>Cargo after</Text>
                      <Text style={[styles.bsSummaryValue, !hasCargo && styles.bsWarn]}>
                        {inventoryCount} → {cargoAfter} / {game.maxInventory}
                      </Text>
                    </View>
                    <View style={[styles.bsSummaryRow, styles.bsSummaryBorder, { paddingTop: 11 }]}>
                      <Text style={styles.bsSummaryTotalLabel}>Total cost</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Text style={[styles.bsSummaryTotal, !canAfford && styles.bsWarn]}>
                          {totalCost.toLocaleString()}
                        </Text>
                        <Text style={styles.bsSummaryMon}>mon</Text>
                      </View>
                    </View>
                  </View>

                  {/* Confirm */}
                  <TouchableOpacity
                    style={[styles.bsConfirm, !canBuy && styles.bsConfirmDisabled]}
                    onPress={() => { if (canBuy) { buy(sushi.name, buyQty); setBuyModal(null); } }}
                    disabled={!canBuy}
                  >
                    <Text style={styles.bsConfirmText}>
                      Buy {buyQty} · {totalCost.toLocaleString()} mon
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          );
        })()}

        {sellModal && (() => {
          const sushi = sellModal;
          const price = prices[sushi.name] || sushi.basePrice;
          const totalQty = (game.inventory[sushi.name] || []).reduce((s, b) => s + b.qty, 0);
          const cappedQty = Math.max(1, Math.min(sellQty, totalQty));
          const preview = computeSellPreview(sushi.name, cappedQty);
          const totalProceeds = preview.reduce((s, r) => s + r.subtotal, 0);
          const cargoAfter = inventoryCount - cappedQty;
          const canSell = cappedQty > 0 && preview.length > 0;
          const dm = depthMultiplier(sushi.name, cappedQty);
          const depthPct = Math.round((1 - dm) * 100);
          const adjPrice = Math.round(price * dm);

          const stateColor = (s) => {
            if (s === 'fresh') return '#2f7d72';
            if (s === 'aging') return '#bb9457';
            if (s === 'urgent') return '#9b2226';
            return '#9aa39e';
          };
          const stateName = (s) => s.charAt(0).toUpperCase() + s.slice(1);

          return (
            <Modal visible transparent animationType="slide">
              <View style={styles.bsOverlay}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setSellModal(null)} activeOpacity={1} />
                <View style={styles.bsSheet}>
                  <View style={styles.bsHandle} />

                  {/* Fish info */}
                  <View style={styles.bsFishRow}>
                    <View style={[styles.bsFishBadge, { justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={styles.bsFishKanji}>{sushi.kanji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bsFishName}>
                        Sell {sushi.name}{' '}
                        <Text style={styles.bsFishSub}>you hold {totalQty}</Text>
                      </Text>
                      <Text style={styles.bsFishMeta}>market price {price} mon · oldest crates sell first</Text>
                    </View>
                  </View>

                  {/* Stepper */}
                  <View style={styles.ssStepper}>
                    <TouchableOpacity
                      style={styles.bsStepMinus}
                      onPress={() => setSellQty(q => Math.max(1, q - 1))}
                    >
                      <Text style={styles.bsStepMinusText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.bsQtyBlock}>
                      <Text style={styles.bsQtyNum}>{cappedQty}</Text>
                      <Text style={styles.bsQtyLabel}>of {totalQty} held</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.bsStepPlus}
                      onPress={() => setSellQty(q => q + 1)}
                    >
                      <Text style={styles.bsStepPlusText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {depthPct > 0 && (
                    <Text style={styles.ssDepthNote}>
                      Bulk sale · avg {adjPrice} mon/unit (−{depthPct}%)
                    </Text>
                  )}

                  {/* Batch breakdown */}
                  <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 14 }}>
                    <View style={styles.ssFifoCol}>
                      <View style={styles.ssFifoLabelRow}>
                        <Text style={styles.ssFifoText}>SELLS{'\n'}FIRST</Text>
                        <Svg width={18} height={9} viewBox="0 0 18 9">
                          <Path d="M0 4.5 L13 4.5" stroke="#bb9457" strokeWidth="2" strokeLinecap="round" />
                          <Path d="M18 4.5 L11 0.5 L11 8.5 Z" fill="#bb9457" />
                        </Svg>
                      </View>
                    </View>
                    <View style={styles.ssBatchCard}>
                      {preview.length === 0 ? (
                        <View style={styles.ssBatchRow}>
                          <Text style={[styles.ssBatchDesc, { color: '#9aa39e' }]}>Nothing sellable</Text>
                        </View>
                      ) : preview.map((row, i) => (
                        <View key={i} style={[styles.ssBatchRow, i > 0 && styles.ssBatchRowBorder]}>
                          <View style={[styles.ssBatchDot, { backgroundColor: stateColor(row.state) }]} />
                          <Text style={styles.ssBatchDesc}>
                            {row.qty} × <Text style={{ fontWeight: '700' }}>{stateName(row.state)}</Text>
                            {row.qty > 1 ? ` @ ${row.effectivePrice} each` : ` @ ${row.effectivePrice}`}
                            {row.mult < 1 ? <Text style={{ color: '#9aa39e' }}>{` (−${Math.round((1 - row.mult) * 100)}%)`}</Text> : null}
                            {i === 0 ? <Text style={styles.ssBatchOldest}> · oldest</Text> : null}
                            {i === preview.length - 1 && preview.length > 1 ? <Text style={styles.ssBatchNewest}> · newest</Text> : null}
                          </Text>
                          <Text style={[styles.ssBatchSubtotal, { color: stateColor(row.state) }]}>+{row.subtotal}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Summary row */}
                  <View style={styles.ssSummaryRow}>
                    <Text style={styles.ssSummaryLeft}>Cargo after · {inventoryCount} → {cargoAfter} / {game.maxInventory}</Text>
                    <View style={styles.ssSummaryRight}>
                      <Text style={styles.ssProceedsLabel}>Proceeds</Text>
                      <Text style={styles.ssProceedsValue}>+{totalProceeds}</Text>
                      <Text style={styles.ssProceedsMon}>mon</Text>
                    </View>
                  </View>

                  {/* Confirm */}
                  <TouchableOpacity
                    style={[styles.ssConfirm, !canSell && styles.ssConfirmDisabled]}
                    onPress={() => { if (canSell) { sell(sushi.name, cappedQty); setSellModal(null); } }}
                  >
                    <Text style={styles.ssConfirmText}>Sell {cappedQty} · +{totalProceeds} mon</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          );
        })()}

        {/* Spoilage Report Sheet (F8) */}
        {game.spoilageNotification && (() => {
          const { spoilage, totalSpoiled, lostValue } = game.spoilageNotification;
          const spoiledItems = Object.entries(spoilage)
            .map(([name, qty]) => {
              const sushi = SUSHI_TYPES.find(s => s.name === name);
              const loss = lostValue > 0
                ? Math.round((qty / totalSpoiled) * lostValue)
                : 0;
              return { name, qty, sushi, loss };
            });
          const dismiss = () => setGame(prev => ({ ...prev, spoilageNotification: null }));
          return (
            <Modal visible transparent animationType="slide">
              <View style={styles.bsOverlay}>
                <View style={styles.spSheet}>
                  <View style={styles.bsPill} />

                  {/* Header */}
                  <View style={styles.spHeader}>
                    <View style={styles.spBadge}>
                      <Text style={styles.spBadgeKanji}>腐</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.spTitle}>Spoilage at Sea</Text>
                      <Text style={styles.spSubtitle}>Some of your catch turned during the voyage</Text>
                    </View>
                  </View>

                  {/* Item list */}
                  <View style={styles.spList}>
                    {spoiledItems.map((item, i) => {
                      const isLast = i === spoiledItems.length - 1;
                      return (
                        <View key={item.name} style={[styles.spRow, !isLast && styles.spRowBorder]}>
                          <View style={styles.spDot} />
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.spItemName}>{item.name}</Text>
                            {item.sushi && <Text style={styles.spItemKanji}>{item.sushi.kanji}</Text>}
                            <Text style={styles.spItemQty}>×{item.qty}</Text>
                          </View>
                          <Text style={styles.spItemLoss}>−{item.loss} mon</Text>
                        </View>
                      );
                    })}
                  </View>

                  {/* Summary */}
                  <View style={styles.spSummary}>
                    <Text style={styles.spSummaryLeft}>Total spoiled · {totalSpoiled} crate{totalSpoiled !== 1 ? 's' : ''}</Text>
                    <Text style={styles.spSummaryRight}>
                      −{lostValue} <Text style={styles.spSummaryUnit}>mon</Text>
                    </Text>
                  </View>

                  {/* Buttons */}
                  <View style={styles.spButtons}>
                    <TouchableOpacity style={styles.spDump} onPress={dismiss}>
                      <Text style={styles.spDumpText}>Dump the spoiled catch</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.spKeep} onPress={dismiss}>
                      <Text style={styles.spKeepText}>Keep</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          );
        })()}

        {/* ── Eateries Modal (F17) ── */}
        <Modal visible={showEateries} animationType="slide" transparent={false}>
          <SafeAreaView style={styles.eateriesContainer}>
            <View style={styles.innerHeaderWrap}>
              <View style={styles.innerHeader}>
                <TouchableOpacity style={styles.innerBackBtn} onPress={() => setShowEateries(false)}>
                  <Text style={styles.innerBackText}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.innerKanji}>店舗</Text>
                  <Text style={styles.innerSubtitle}>HOLDINGS</Text>
                </View>
                <View style={styles.innerBackBtn} />
              </View>
              <View style={styles.headerSep} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.eateriesBody}>
              {/* Revenue summary tile */}
              <View style={styles.eateriesRevTile}>
                <View style={styles.eateriesRevTop}>
                  <View>
                    <Text style={styles.eateriesRevLabel}>DAILY REVENUE</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 3 }}>
                      <Text style={styles.eateriesRevAmount}>{getDailyEateryRevenue().toLocaleString()}</Text>
                      <Text style={styles.eateriesRevMon}>mon/day</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.eateriesRevLabel}>EATERIES</Text>
                    <Text style={styles.eateriesRevCount}>{game.restaurants.length}</Text>
                    <Text style={styles.eateriesRevCities}>
                      {[...new Set(game.restaurants.map(r => r.cityIndex))].length} cities
                    </Text>
                  </View>
                </View>

                {/* Collect row — always shown */}
                <View style={styles.eateriesCollectRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.eateriesCollectDot} />
                    <Text style={styles.eateriesCollectReadyText}>
                      {game.pendingEateryRevenue > 0
                        ? `${game.pendingEateryRevenue.toLocaleString()} mon ready to collect`
                        : 'No revenue pending'}
                    </Text>
                  </View>
                  {game.pendingEateryRevenue > 0 && (
                    <TouchableOpacity style={styles.eateriesCollectBtn} onPress={collectEateryRevenue}>
                      <Text style={styles.eateriesCollectBtnText}>Collect</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Eatery cards by city */}
              {game.restaurants.length === 0 ? (
                <View style={styles.eateriesEmpty}>
                  <Text style={styles.eateriesEmptyText}>No eateries yet. Open one via Expand.</Text>
                </View>
              ) : (
                CITIES.map((city, cityIdx) => {
                  const cityEateries = game.restaurants.filter(r => r.cityIndex === cityIdx);
                  if (cityEateries.length === 0) return null;
                  return (
                    <View key={cityIdx}>
                      {/* City header row */}
                      <View style={styles.eaterieCityRow}>
                        <Text style={styles.eaterieCityJp}>{city.jp}</Text>
                        <Text style={styles.eaterieCityEn}>{city.name}</Text>
                        <Text style={styles.eaterieCityCount}>
                          · {cityEateries.length} {cityEateries.length === 1 ? 'eatery' : 'eateries'}
                        </Text>
                        <View style={styles.eaterieCityLine} />
                      </View>

                      {cityEateries.map((r, i) => {
                        const tier = RESTAURANTS.find(t => t.id === r.tierId);
                        if (!tier) return null;
                        const isLast = i === cityEateries.length - 1;
                        return (
                          <View key={i} style={[styles.eateryCard, !isLast && { marginBottom: 10 }]}>
                            <View style={styles.eateryBadge}>
                              <Text style={styles.eateryBadgeKanji}>{tier.holdingKanji}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.eateryName}>{tier.name}</Text>
                              <Text style={styles.eateryMeta}>Seats {tier.capacity} · {tier.dailyRevenue.toLocaleString()} mon/day</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <View style={styles.eateryOpenRow}>
                                <View style={styles.eateryOpenDot} />
                                <Text style={styles.eateryOpenText}>Open</Text>
                              </View>
                              <Text style={styles.eateryUpgrade}>Upgrade ›</Text>
                            </View>
                          </View>
                        );
                      })}

                      {/* Open another CTA */}
                      <TouchableOpacity
                        style={styles.eateriesOpenCTA}
                        onPress={() => { setShowEateries(false); setActiveScreen('expand'); }}
                      >
                        <Text style={styles.eateriesOpenCTAText}>
                          <Text style={styles.eateriesOpenCTAKanji}>拡</Text>
                          {'  Open an eatery in this city ›'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

      </SafeAreaView>

      {/* ── Toast Overlay (F19) ── */}
      {toasts.length > 0 && (
        <View style={styles.toastStack} pointerEvents="none">
          {toasts.map(toast => {
            const accentColor =
              toast.type === 'error' ? '#9b2226' :
              toast.type === 'warning' ? '#bb9457' : '#2f7d72';
            const iconBg =
              toast.type === 'error' ? 'rgba(155,34,38,0.22)' :
              toast.type === 'warning' ? 'rgba(187,148,87,0.22)' : 'rgba(47,125,114,0.24)';
            const iconColor =
              toast.type === 'error' ? '#ef9a9a' :
              toast.type === 'warning' ? '#e0c081' : '#7fc8b9';
            const icon =
              toast.type === 'error' ? '✕' :
              toast.type === 'warning' ? '満' : '✓';
            const iconFont = toast.type === 'warning'
              ? 'ShipporiMinchoB1_700Bold'
              : 'ZenKakuGothicNew_700Bold';
            return (
              <View key={toast.id} style={styles.toast}>
                <View style={[styles.toastAccent, { backgroundColor: accentColor }]} />
                <View style={[styles.toastIconCircle, { backgroundColor: iconBg }]}>
                  <Text style={[styles.toastIconText, { color: iconColor, fontFamily: iconFont }]}>{icon}</Text>
                </View>
                <View style={styles.toastBody}>
                  <Text style={styles.toastTitle}>{toast.title}</Text>
                  {!!toast.body && <Text style={styles.toastSub}>{toast.body}</Text>}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // ── Global ──
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },

  // ── Header ──
  header: {
    backgroundColor: '#1c2b29',
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerSep: {
    height: 3,
    backgroundColor: '#9b2226',
    alignSelf: 'stretch',
    marginTop: 10,
  },
  logoKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 27,
    color: '#f6f4ef',
    lineHeight: 32,
  },
  logoSub: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 5,
    color: '#bb9457',
    marginTop: 5,
  },

  // ── Screen body (below zigzag) ──
  screenBody: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },

  // ── Stat bar ──
  statBar: {
    flexDirection: 'row',
    backgroundColor: '#22322f',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: 'rgba(40,61,59,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  statCell: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  statSep: {
    width: 1,
    backgroundColor: 'rgba(246,244,239,0.12)',
    marginVertical: 11,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 3,
  },
  statLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#9aac9c',
  },
  statNumber: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 23,
    color: '#f6f4ef',
  },
  statUnit: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#e0c081',
    marginBottom: 1,
  },
  statMuted: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 13,
    color: '#9aac9c',
  },

  // ── City card ──
  cityCard: {
    backgroundColor: '#22322f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderLeftWidth: 4,
    borderLeftColor: '#9b2226',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 12,
    shadowColor: 'rgba(40,61,59,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  cityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
  },
  cityKanjiBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(246,244,239,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.30)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cityKanjiText: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 19,
    color: '#e0c081',
  },
  cityNameBlock: {
    flex: 1,
  },
  cityNameText: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
    color: '#f6f4ef',
    lineHeight: 22,
  },
  cityJpText: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 13,
    color: '#9aac9c',
  },
  cityMetaText: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aac9c',
    marginTop: 4,
  },
  cityEventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(187,148,87,0.16)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cityEventKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 14,
    color: '#e0c081',
  },
  cityEventName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#f0e6d2',
    lineHeight: 14,
  },
  cityEventDir: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#e0c081',
    marginTop: 2,
  },
  cityNewsSep: {
    height: 1,
    backgroundColor: 'rgba(246,244,239,0.12)',
    marginTop: 11,
    marginBottom: 11,
  },
  cityNewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cityNewsLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#bb9457',
  },
  cityNewsText: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#c8d0c8',
    flex: 1,
  },

  // ── Nav buttons ──
  navRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  navPrimary: {
    flex: 1,
    backgroundColor: '#9b2226',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    shadowColor: '#7a1a1d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  navPrimaryText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#fff',
  },
  navSecondary: {
    flex: 1,
    backgroundColor: '#22322f',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    shadowColor: '#16221f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  navSecondaryText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#e0c081',
  },
  navDisabled: {
    opacity: 0.4,
  },

  // ── Section headers ──
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 17,
    color: '#283d3b',
  },
  sectionHeadTitle: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#7c8682',
  },
  sectionNeverSpoils: {
    backgroundColor: 'rgba(47,125,114,0.08)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sectionNeverSpoilsText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    color: '#2f7d72',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e6ddca',
  },

  // ── Fish cards ──
  fishCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e6ddca',
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 10,
    marginBottom: 8,
    shadowColor: '#283d3b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  fishCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fishBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f6f4ef',
    borderWidth: 1.5,
    borderColor: '#cdb78a',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  fishBadgeText: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
    color: '#283d3b',
  },
  fishNameCol: {
    width: 96,
    flexShrink: 0,
  },
  fishNameEn: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#283d3b',
    lineHeight: 17,
  },
  fishNameJp: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
    marginTop: 2,
  },
  fishPriceCol: {
    alignItems: 'flex-end',
  },
  fishPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  fishPrice: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
  },
  fishPriceMon: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    color: '#9aa39e',
    marginBottom: 1,
  },
  fishTrend: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  fishHold: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
    marginTop: 2,
  },
  fishHoldActive: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    color: '#2f7d72',
  },
  fishDivider: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#e6ddca',
    marginVertical: 10,
  },
  fishActions: {
    flexDirection: 'row',
    gap: 20,
  },
  fishBuyLink: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#2f7d72',
  },
  fishSellLink: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#9b2226',
  },
  fishSellAll: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: 'rgba(155,34,38,0.6)',
  },
  fishLinkDisabled: {
    color: '#c3bcab',
  },
  discardSpoiledLink: {
    marginTop: 6,
    alignItems: 'center',
  },
  discardSpoiledText: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
    textDecorationLine: 'underline',
  },

  // ── Ingredient / Pantry cards (F16) ──
  ingredientCard: {
    backgroundColor: '#faf8f3',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e6ddca',
    padding: 12,
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  ingredientCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  ingredientBadge: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: '#efeadf',
    borderWidth: 1,
    borderColor: '#ddd3bf',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ingredientBadgeKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
    color: '#6f7a6b',
    lineHeight: 20,
  },
  ingredientNameCol: {
    flexShrink: 0,
    width: 96,
  },
  ingredientName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#283d3b',
    lineHeight: 16,
  },
  ingredientSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
    marginTop: 2,
  },
  ingredientPriceCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  ingredientPrice: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 17,
    color: '#283d3b',
    lineHeight: 19,
  },
  ingredientPriceMon: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 9,
    color: '#9aa39e',
  },
  ingredientTrend: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    marginTop: 1,
    textAlign: 'right',
  },
  ingredientHold: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
    marginTop: 1,
  },
  ingredientActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: '#e6ddca',
    borderStyle: 'dashed',
  },
  ingredientBuy: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#2f7d72',
  },
  ingredientSell: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#9b2226',
  },
  ingredientSellAll: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: 'rgba(155,34,38,0.6)',
  },
  ingredientSellFaded: {
    opacity: 0.5,
  },
  pantryFooter: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10.5,
    color: '#9aa39e',
    textAlign: 'center',
    marginTop: 6,
  },

  // ── Buy Stepper Sheet ──
  bsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(28,43,41,0.62)',
    justifyContent: 'flex-end',
  },
  bsSheet: {
    backgroundColor: '#f6f4ef',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 26,
    paddingTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.35,
    shadowRadius: 50,
    elevation: 20,
  },
  bsHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d9d1c2',
    alignSelf: 'center',
    marginBottom: 18,
  },
  bsFishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bsFishBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f6f4ef',
    borderWidth: 1.5,
    borderColor: '#cdb78a',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bsFishKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 23,
    color: '#283d3b',
  },
  bsFishName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 17,
    color: '#283d3b',
  },
  bsFishSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12,
    color: '#9aa39e',
  },
  bsFishMeta: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
    marginTop: 2,
  },
  bsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    marginTop: 26,
    marginBottom: 8,
  },
  bsStepMinus: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bsStepMinusText: {
    fontSize: 28,
    color: '#283d3b',
    lineHeight: 32,
  },
  bsQtyBlock: {
    minWidth: 96,
    alignItems: 'center',
  },
  bsQtyNum: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 46,
    color: '#283d3b',
    lineHeight: 46,
  },
  bsQtyLabel: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
    marginTop: 2,
  },
  bsStepPlus: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#22322f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bsStepPlusText: {
    fontSize: 28,
    color: '#e0c081',
    lineHeight: 32,
  },
  bsPills: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 22,
  },
  bsPill: {
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  bsPillPrimary: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#9b2226',
  },
  bsPillMuted: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#7c8682',
  },
  bsSummary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  bsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 9,
  },
  bsSummaryBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f0e9da',
  },
  bsSummaryLabel: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12.5,
    color: '#7c8682',
  },
  bsSummaryValue: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#283d3b',
  },
  bsSummaryTotalLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#283d3b',
  },
  bsSummaryTotal: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
    color: '#9b2226',
  },
  bsSummaryMon: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
  },
  bsWarn: {
    color: '#9b2226',
  },
  bsConfirm: {
    backgroundColor: '#2f7d72',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#1f5a4c',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  bsConfirmDisabled: {
    backgroundColor: '#c8c0b8',
    shadowColor: '#aaa',
  },
  bsConfirmText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#fff',
  },

  // ── Traveling screen (unchanged visually, updated later) ──
  travelingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1c2b29',
    padding: 20,
  },
  travelingTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 15,
  },
  travelingRoute: {
    fontSize: 18,
    color: '#e0f2f1',
    marginBottom: 30,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 20,
  },
  progressBar: {
    height: 12,
    backgroundColor: 'rgba(246,244,239,0.1)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e0c081',
  },
  progressText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  travelingTime: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e0c081',
    marginBottom: 10,
  },
  travelingSubtext: {
    fontSize: 14,
    color: '#9aac9c',
    fontStyle: 'italic',
  },

  // ── Spoilage alert (temporary, replaced in F8 step) ──
  spoilageAlert: {
    backgroundColor: '#fff3cd',
    borderLeftWidth: 5,
    borderLeftColor: '#9b2226',
    padding: 12,
    margin: 10,
    borderRadius: 8,
  },
  spoilageAlertTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 8,
  },
  spoilageAlertText: {
    fontSize: 14,
    color: '#856404',
    marginVertical: 2,
  },
  spoilageAlertSummary: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#721c24',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f5c6cb',
  },

  // ── Modals (unchanged, rebuilt in later steps) ──
  modalOverlay: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  closeX: {
    fontSize: 24,
    color: '#999',
    fontWeight: '300',
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  cityOption: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  currentCityOption: {
    borderColor: '#3b82f6',
    backgroundColor: '#1a2847',
  },
  cityEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  cityOptionInfo: {
    flex: 1,
  },
  cityName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  cityPopulation: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  checkmark: {
    fontSize: 20,
    color: '#3b82f6',
    fontWeight: '700',
  },
  restaurantOption: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  restaurantOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  restaurantOptionEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  restaurantOptionName: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  restaurantOptionDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  restaurantOptionPrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  canAfford: {
    color: '#10b981',
  },
  cantAfford: {
    color: '#999',
  },
  upgradeCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeCardOwned: {
    backgroundColor: '#1a3a2a',
    opacity: 0.6,
  },
  upgradeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  upgradeEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  upgradeName: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  upgradeDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  ownedLabel: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '700',
    marginTop: 4,
  },
  upgradePrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  plRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  plLabel: {
    fontSize: 10,
    color: '#999',
  },
  plValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  plGain: {
    color: '#10b981',
  },
  plLoss: {
    color: '#ef4444',
  },
  // Day Summary (F11)
  daySummaryContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  dsBody: {
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  dsNetWrap: {
    alignItems: 'center',
    marginBottom: 22,
  },
  dsNetLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    letterSpacing: 1.1,
    color: '#7c8682',
  },
  dsNetValue: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 42,
    lineHeight: 44,
  },
  dsNetUnit: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
  },
  dsGain: {
    color: '#2f7d72',
  },
  dsLoss: {
    color: '#9b2226',
  },
  dsMuted: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 13,
    color: '#9aa39e',
  },
  dsLedger: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 14,
  },
  dsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  dsRowDash: {
    borderBottomWidth: 1,
    borderBottomColor: '#e6ddca',
    borderStyle: 'dashed',
  },
  dsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  dsRowKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#283d3b',
  },
  dsRowLabel: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 13,
    color: '#283d3b',
  },
  dsRowValue: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13.5,
  },
  dsRowValueNeutral: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13.5,
    color: '#283d3b',
  },
  dsPurseTile: {
    backgroundColor: '#22322f',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  dsPurseLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#9aac9c',
  },
  dsPurseValue: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 24,
    color: '#f6f4ef',
  },
  dsPurseMon: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#e0c081',
  },
  dsPurseKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 30,
    color: 'rgba(224,192,129,0.5)',
  },
  dsBeginButton: {
    backgroundColor: '#9b2226',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#7a1a1d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  dsBeginText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#fff',
  },

  // Traveling Splash (F6)
  splashContainer: {
    flex: 1,
    backgroundColor: '#1c2b29',
  },
  splashContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  splashKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 72,
    color: '#e0c081',
    lineHeight: 72,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  splashLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    letterSpacing: 4.4,
    color: '#bb9457',
    marginTop: 14,
  },
  splashRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 40,
  },
  splashCityJp: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
    color: '#f6f4ef',
    lineHeight: 20,
  },
  splashCityEn: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aac9c',
    marginTop: 5,
    textAlign: 'center',
  },
  splashDotGold: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e0c081',
  },
  splashLineLeft: {
    width: 34,
    height: 1.5,
    backgroundColor: '#e0c081',
    opacity: 0.6,
    borderRadius: 1,
  },
  splashBoat: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#e0c081',
  },
  splashLineRight: {
    width: 34,
    height: 1.5,
    backgroundColor: '#9aac9c',
    opacity: 0.6,
    borderRadius: 1,
  },
  splashDotMuted: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9aac9c',
  },
  splashProgressWrap: {
    width: '100%',
    marginTop: 44,
  },
  splashProgressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(246,244,239,0.10)',
    overflow: 'hidden',
  },
  splashProgressFill: {
    height: '100%',
    backgroundColor: '#e0c081',
    borderRadius: 5,
  },
  splashPct: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#e0c081',
  },
  splashRemaining: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aac9c',
  },
  splashNote: {
    marginTop: 36,
    backgroundColor: 'rgba(155,34,38,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.30)',
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  splashNoteKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
    color: '#e0c081',
  },
  splashNoteText: {
    flex: 1,
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11.5,
    color: '#e8ddc8',
    lineHeight: 16,
  },

  // Arrival Screen (F7)
  arrivalContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  arrivalSuperLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    letterSpacing: 4.4,
    color: '#bb9457',
  },
  arrivalCityJp: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 64,
    color: '#f6f4ef',
    lineHeight: 68,
    marginTop: 18,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  arrivalCityEn: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 22,
    color: '#e0c081',
    marginTop: 8,
  },
  arrivalMeta: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12,
    color: '#9aac9c',
    marginTop: 10,
  },
  arrivalDivider: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(187,148,87,0.4)',
    marginVertical: 30,
  },
  arrivalCard: {
    width: '100%',
    backgroundColor: 'rgba(246,244,239,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 16,
    padding: 15,
  },
  arrivalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  arrivalBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  arrivalBadgePos: {
    backgroundColor: 'rgba(187,148,87,0.12)',
    borderColor: 'rgba(187,148,87,0.30)',
  },
  arrivalBadgeNeg: {
    backgroundColor: 'rgba(155,34,38,0.20)',
    borderColor: 'rgba(187,148,87,0.30)',
  },
  arrivalBadgeKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 19,
    color: '#e0c081',
  },
  arrivalEventTitle: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#f6f4ef',
  },
  arrivalEventSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aac9c',
    marginTop: 3,
  },
  arrivalCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(246,244,239,0.10)',
  },
  arrivalTipLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#bb9457',
  },
  arrivalTipText: {
    flex: 1,
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#c8d0c8',
  },
  arrivalCTA: {
    width: '100%',
    marginTop: 18,
    backgroundColor: '#9b2226',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#7a1a1d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  arrivalCTAText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  arrivalCTAKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
  },

  // Travel Screen
  travelFromRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  travelFromLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#7c8682',
  },
  travelFromCity: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#283d3b',
  },
  travelFromMeta: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
  },
  portCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    padding: 13,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  portBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f6f4ef',
    borderWidth: 1.5,
    borderColor: '#cdb78a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portBadgeText: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 19,
    color: '#283d3b',
  },
  portName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 15,
    color: '#283d3b',
    lineHeight: 17,
  },
  portJp: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 12,
    color: '#9aa39e',
  },
  portPop: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10.5,
    color: '#9aa39e',
  },
  portEventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  portEventKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 11,
  },
  portEventName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
  },
  portHours: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 19,
    color: '#283d3b',
  },
  portHoursUnit: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
  },
  portSail: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#9b2226',
    marginTop: 3,
  },

  // Travel Confirm Sheet
  tcRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 6,
  },
  tcCityJp: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
    color: '#283d3b',
    lineHeight: 22,
  },
  tcCityEn: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
    marginTop: 4,
  },
  tcDotOrigin: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9b2226',
  },
  tcLine: {
    width: 30,
    height: 1.5,
    backgroundColor: '#cdb78a',
  },
  tcBoat: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 13,
    color: '#bb9457',
  },
  tcDotDest: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#283d3b',
  },
  tcMeta: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12,
    color: '#7c8682',
    textAlign: 'center',
    marginBottom: 16,
  },
  tcSpoilCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  tcSpoilHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f0e9da',
  },
  tcSpoilKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#bb9457',
  },
  tcSpoilTitle: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    color: '#283d3b',
  },
  tcSpoilRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  tcSpoilRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0e9da',
  },
  tcSpoilBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f6f4ef',
    borderWidth: 1,
    borderColor: '#cdb78a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tcSpoilBadgeText: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 14,
    color: '#283d3b',
  },
  tcSpoilName: {
    flex: 1,
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12.5,
    color: '#283d3b',
  },
  tcSpoilOutcome: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11.5,
  },
  tcWarnBox: {
    backgroundColor: 'rgba(155,34,38,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(155,34,38,0.18)',
    borderRadius: 12,
    padding: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 18,
  },
  tcWarnKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 16,
    color: '#9b2226',
  },
  tcWarnText: {
    flex: 1,
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11.5,
    color: '#7c2024',
    lineHeight: 16,
  },
  tcButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  tcCancel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  tcCancelText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#7c8682',
  },
  tcConfirm: {
    flex: 1,
    backgroundColor: '#9b2226',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#7a1a1d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  tcConfirmText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#fff',
  },

  // Inner screen header (Hold, Travel, etc.)
  innerHeaderWrap: {
    backgroundColor: '#1c2b29',
    paddingBottom: 16,
  },
  innerHeader: {
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  innerBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerBackText: {
    color: '#e0c081',
    fontSize: 20,
    lineHeight: 22,
    marginTop: -1,
  },
  innerKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 27,
    color: '#f6f4ef',
    lineHeight: 32,
  },
  innerSubtitle: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 5,
    color: '#bb9457',
    marginTop: 5,
  },

  // The Hold
  holdGaugeCard: {
    backgroundColor: '#22322f',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  holdGaugeLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#9aac9c',
  },
  holdGaugeCount: {
    fontSize: 12,
    color: '#9aac9c',
  },
  holdGaugeNum: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
    color: '#f6f4ef',
  },
  holdGaugeSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12,
    color: '#9aac9c',
  },
  holdGaugeBar: {
    marginTop: 10,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(246,244,239,0.10)',
    overflow: 'hidden',
  },
  holdGaugeFill: {
    height: '100%',
    backgroundColor: '#2f7d72',
    borderRadius: 4,
  },
  holdGaugeHint: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10.5,
    color: '#9aac9c',
    marginTop: 8,
  },
  holdCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    padding: 12,
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  holdCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  holdBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f6f4ef',
    borderWidth: 1.5,
    borderColor: '#cdb78a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdBadgeText: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
    color: '#283d3b',
  },
  holdName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#283d3b',
    lineHeight: 16,
  },
  holdQty: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
  },
  holdMarketPrice: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
    marginTop: 2,
  },
  holdValueCol: {
    alignItems: 'flex-end',
  },
  holdValue: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 16,
    color: '#283d3b',
  },
  holdValueMon: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 9,
    color: '#9aa39e',
  },
  holdPaid: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
    marginTop: 1,
  },
  holdPL: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
  },
  holdPLLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 9,
    opacity: 0.7,
  },
  holdChips: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 11,
  },
  holdChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 7,
    paddingHorizontal: 8,
  },
  holdChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  holdChipLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10.5,
  },
  holdChipSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#7c8682',
    marginTop: 4,
  },
  holdActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e6ddca',
    borderStyle: 'dashed',
  },
  holdSellLink: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#283d3b',
  },
  holdDiscardLink: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#7c8682',
  },
  holdLegend: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
    paddingBottom: 20,
  },
  holdLegendText: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#7c8682',
  },

  // Price Board (F14)
  pbContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  pbBody: {
    paddingTop: 14,
    paddingLeft: 16,
    paddingBottom: 40,
  },
  pbChipScroll: {
    marginBottom: 14,
  },
  pbChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  pbChipActive: {
    backgroundColor: '#22322f',
    borderColor: 'rgba(187,148,87,0.30)',
  },
  pbChipInactive: {
    backgroundColor: '#fff',
    borderColor: '#e6ddca',
  },
  pbChipKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 13,
  },
  pbChipKanjiActive: { color: '#e0c081' },
  pbChipKanjiInactive: { color: '#9aa39e' },
  pbChipName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
  },
  pbChipNameActive: { color: '#f6f4ef' },
  pbChipNameInactive: { color: '#7c8682' },
  pbBest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(47,125,114,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(47,125,114,0.28)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    marginRight: 16,
  },
  pbBestKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
    color: '#2f7d72',
  },
  pbBestText: {
    flex: 1,
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12,
  },
  pbBestHighlight: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#283d3b',
  },
  pbBestSub: {
    color: '#7c8682',
  },
  pbColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingRight: 16,
    paddingHorizontal: 2,
  },
  pbColLeft: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10.5,
    color: '#9aa39e',
  },
  pbColRight: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 0.6,
    color: '#9aa39e',
  },
  pbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 12,
    paddingVertical: 11,
    paddingLeft: 13,
    marginBottom: 8,
    marginRight: 16,
  },
  pbRowBest: {
    backgroundColor: 'rgba(47,125,114,0.05)',
    borderColor: 'rgba(47,125,114,0.28)',
  },
  pbRowHere: {
    backgroundColor: '#f9f7f2',
    borderColor: '#e6ddca',
  },
  pbCityBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f6f4ef',
    borderWidth: 1.5,
    borderColor: '#cdb78a',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pbCityBadgeKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 16,
    color: '#283d3b',
  },
  pbCityName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#283d3b',
    lineHeight: 16,
  },
  pbCityJp: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 11,
    color: '#9aa39e',
  },
  pbEventTag: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
  },
  pbHereBadge: {
    backgroundColor: 'rgba(155,34,38,0.08)',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  pbHereBadgeText: {
    fontFamily: 'ZenKakuGothicNew_900Black',
    fontSize: 9,
    letterSpacing: 0.6,
    color: '#9b2226',
  },
  pbPrice: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
    color: '#283d3b',
    lineHeight: 20,
  },
  pbDelta: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
  },
  pbDeltaLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 9,
    opacity: 0.7,
  },
  pbSailCol: {
    width: 42,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: '#ece3cf',
    paddingLeft: 11,
    flexShrink: 0,
  },
  pbSailHrs: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#9b2226',
  },
  pbSailUnit: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 9,
    color: '#9aa39e',
  },
  pbSailDash: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
  },

  // Expand (F4) + Provisions (F5)
  expandContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  expandBody: {
    padding: 16,
    paddingBottom: 40,
  },
  expandCityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  expandCityIn: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#7c8682',
  },
  expandCityName: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#283d3b',
  },
  expandCityLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e6ddca',
  },
  expandCityOwned: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
  },
  expandCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    padding: 14,
    marginBottom: 11,
  },
  expandCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expandBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#22322f',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expandBadgeKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
    color: '#e0c081',
  },
  expandCardName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 15,
    color: '#283d3b',
    lineHeight: 18,
  },
  expandCardSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
    marginTop: 3,
  },
  expandCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: '#e6ddca',
    borderStyle: 'dashed',
  },
  expandCost: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
  },
  expandCostAfford: {
    color: '#283d3b',
  },
  expandCostNoAfford: {
    color: '#c3bcab',
  },
  expandCostMon: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aa39e',
  },
  expandBtnBuy: {
    backgroundColor: '#2f7d72',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  expandBtnBuyText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#fff',
  },
  expandBtnOwned: {
    backgroundColor: 'rgba(47,125,114,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(47,125,114,0.30)',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  expandBtnOwnedText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#2f7d72',
  },
  expandBtnCant: {
    backgroundColor: '#f6f4ef',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  expandBtnCantText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12.5,
    color: '#c3bcab',
  },
  // Provisions
  provPurseTile: {
    backgroundColor: '#22322f',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  provPurseLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#9aac9c',
  },
  provPurseValue: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 22,
    color: '#f6f4ef',
  },
  provPurseMon: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#e0c081',
  },
  provCargoMax: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 12,
    color: '#9aac9c',
  },
  provSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  provSectionKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 16,
    color: '#283d3b',
  },
  provSectionLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    color: '#7c8682',
  },
  provCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    padding: 14,
    marginBottom: 11,
  },
  provCardOwned: {
    backgroundColor: '#f9f7f2',
  },
  provCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  provBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f6f4ef',
    borderWidth: 1.5,
    borderColor: '#cdb78a',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  provBadgeKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 19,
    color: '#283d3b',
  },
  provCardName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 15,
    color: '#283d3b',
    lineHeight: 18,
  },
  provCardSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
    marginTop: 3,
  },
  provCost: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 17,
  },
  provOwned: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    color: '#2f7d72',
  },
  provFootnote: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10.5,
    color: '#9aa39e',
    textAlign: 'center',
    marginTop: 6,
  },

  // Spoilage Report Sheet (F8)
  spSheet: {
    backgroundColor: '#f6f4ef',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.35,
    shadowRadius: 50,
    elevation: 20,
  },
  spHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  spBadge: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(155,34,38,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(155,34,38,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  spBadgeKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 22,
    color: '#9b2226',
  },
  spTitle: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 19,
    color: '#283d3b',
  },
  spSubtitle: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11.5,
    color: '#7c8682',
    marginTop: 2,
  },
  spList: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e6ddca',
  },
  spRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 2,
  },
  spRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0e9da',
  },
  spDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#8a8d86',
    flexShrink: 0,
  },
  spItemName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#283d3b',
  },
  spItemKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 12,
    color: '#9aa39e',
  },
  spItemQty: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 12,
    color: '#9aa39e',
  },
  spItemLoss: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#9b2226',
  },
  spSummary: {
    marginTop: 14,
    backgroundColor: 'rgba(155,34,38,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(155,34,38,0.18)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spSummaryLeft: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    color: '#9b2226',
  },
  spSummaryRight: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 18,
    color: '#9b2226',
  },
  spSummaryUnit: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9b2226',
  },
  spButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  spDump: {
    flex: 1,
    backgroundColor: '#9b2226',
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#7a1a1d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  spDumpText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#fff',
  },
  spKeep: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  spKeepText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#7c8682',
  },

  // Sell Sheet
  ssStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    marginTop: 22,
    marginBottom: 10,
  },
  ssFifoCol: {
    width: 62,
    paddingTop: 4,
  },
  ssFifoLabelRow: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ssFifoText: {
    fontSize: 9,
    fontFamily: 'ZenKakuGothicNew_700Bold',
    letterSpacing: 0.5,
    color: '#bb9457',
    lineHeight: 12,
  },
  ssBatchCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6ddca',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginLeft: -8,
  },
  ssBatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  ssBatchRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f0e9da',
  },
  ssBatchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ssBatchDesc: {
    flex: 1,
    fontSize: 12.5,
    color: '#283d3b',
  },
  ssBatchSubtotal: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  ssBatchOldest: {
    fontSize: 10,
    fontWeight: '700',
    color: '#bb9457',
  },
  ssBatchNewest: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9aa39e',
  },
  ssDepthNote: {
    fontSize: 11.5,
    color: '#bb9457',
    textAlign: 'center',
    marginBottom: 10,
  },
  ssSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  ssSummaryLeft: {
    fontSize: 12,
    color: '#9aa39e',
  },
  ssSummaryRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  ssProceedsLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#283d3b',
  },
  ssProceedsValue: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 22,
    color: '#2f7d72',
  },
  ssProceedsMon: {
    fontSize: 11,
    color: '#9aa39e',
  },
  ssConfirm: {
    marginTop: 14,
    backgroundColor: '#9b2226',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#7a1a1d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  ssConfirmDisabled: {
    opacity: 0.4,
  },
  ssConfirmText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#fff',
  },

  // ── Title Screen (F18) ──
  titleContainer: {
    flex: 1,
    backgroundColor: '#1c2b29',
  },
  titleInner: {
    flex: 1,
    paddingHorizontal: 34,
    justifyContent: 'space-between',
    paddingBottom: 30,
  },
  titleBrandWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  titleLogoCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#9b2226',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: '#9b2226',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 10,
  },
  titleLogoKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 26,
    color: '#f6f4ef',
    lineHeight: 28,
  },
  titleBrandJp: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 60,
    color: '#f6f4ef',
    lineHeight: 60,
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 24,
  },
  titleBrandEn: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    letterSpacing: 6,
    color: '#bb9457',
    marginTop: 16,
    paddingLeft: 6,
  },
  titleTagline: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 13,
    color: '#9aac9c',
    marginTop: 18,
    textAlign: 'center',
    lineHeight: 20,
  },
  titleActions: {
    gap: 12,
  },
  titleContinueBtn: {
    backgroundColor: 'rgba(246,244,239,0.06)',
    borderRadius: 16,
    padding: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.30)',
    marginBottom: 0,
  },
  titleContinueInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContinueLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#bb9457',
  },
  titleContinueMeta: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 13,
    color: '#e8ddc8',
    marginTop: 4,
  },
  titleContinueArrow: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 26,
    color: '#e0c081',
    lineHeight: 28,
  },
  titleNewGameBtn: {
    backgroundColor: '#9b2226',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    shadowColor: '#7a1a1d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  titleNewGameKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  titleNewGameText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  titleLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 26,
  },
  titleLinkText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    color: '#9aac9c',
  },

  // ── Bankrupt Screen (F12) ──
  bankruptContainer: {
    flex: 1,
    backgroundColor: '#1c2b29',
  },
  bankruptInner: {
    flex: 1,
    paddingHorizontal: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankruptKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 74,
    color: '#9b2226',
    lineHeight: 74,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 24,
  },
  bankruptTitle: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    letterSpacing: 4,
    color: '#bb9457',
    marginTop: 16,
  },
  bankruptBody: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 13,
    color: '#9aac9c',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 14,
  },
  bankruptGrid: {
    width: '100%',
    marginTop: 34,
    backgroundColor: 'rgba(246,244,239,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.24)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  bankruptRow: {
    flexDirection: 'row',
  },
  bankruptRowTop: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(246,244,239,0.10)',
  },
  bankruptCell: {
    flex: 1,
    padding: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  bankruptCellRight: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(246,244,239,0.10)',
  },
  bankruptStatVal: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 26,
    color: '#f6f4ef',
    lineHeight: 28,
  },
  bankruptStatLbl: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 10,
    color: '#9aac9c',
    marginTop: 4,
  },
  bankruptStatMon: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aac9c',
  },
  bankruptCTA: {
    width: '100%',
    marginTop: 22,
    backgroundColor: '#bb9457',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#8f6f3c',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  bankruptCTAKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 14,
    color: '#1c2b29',
  },
  bankruptCTAText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 14,
    color: '#1c2b29',
  },

  // ── Your Eateries (F17) ──
  eateriesContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  eateriesBody: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  eateriesRevTile: {
    backgroundColor: '#22322f',
    borderWidth: 1,
    borderColor: 'rgba(187,148,87,0.28)',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  eateriesRevTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eateriesRevLabel: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#9aac9c',
  },
  eateriesRevAmount: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 26,
    color: '#e0c081',
    lineHeight: 28,
  },
  eateriesRevMon: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#9aac9c',
  },
  eateriesRevCount: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 26,
    color: '#f6f4ef',
    lineHeight: 28,
    textAlign: 'right',
  },
  eateriesRevCities: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aac9c',
    marginTop: 2,
    textAlign: 'right',
  },
  eateriesCollectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(246,244,239,0.12)',
  },
  eateriesCollectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0c081',
  },
  eateriesCollectReadyText: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11.5,
    color: '#c8d0c8',
  },
  eateriesCollectBtn: {
    backgroundColor: '#bb9457',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  eateriesCollectBtnText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    color: '#1c2b29',
  },
  eaterieCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
  },
  eaterieCityJp: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#283d3b',
  },
  eaterieCityEn: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 12,
    color: '#7c8682',
  },
  eaterieCityCount: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
  },
  eaterieCityLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e6ddca',
  },
  eateryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e6ddca',
  },
  eateryBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#22322f',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eateryBadgeKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 20,
    color: '#e0c081',
    lineHeight: 22,
  },
  eateryName: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 15,
    color: '#283d3b',
    lineHeight: 17,
  },
  eateryMeta: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aa39e',
    marginTop: 3,
  },
  eateryOpenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'flex-end',
  },
  eateryOpenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#2f7d72',
  },
  eateryOpenText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#2f7d72',
  },
  eateryUpgrade: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 11,
    color: '#bb9457',
    marginTop: 4,
    textAlign: 'right',
  },
  eateriesOpenCTA: {
    borderWidth: 1.5,
    borderColor: '#cdb78a',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(187,148,87,0.05)',
    marginBottom: 16,
  },
  eateriesOpenCTAText: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#9b2226',
  },
  eateriesOpenCTAKanji: {
    fontFamily: 'ShipporiMinchoB1_700Bold',
    fontSize: 15,
    color: '#9b2226',
  },
  eateriesEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  eateriesEmptyText: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 14,
    color: '#9aa39e',
    textAlign: 'center',
  },

  // ── Toast Overlay (F19) ──
  toastStack: {
    position: 'absolute',
    bottom: 30,
    left: 16,
    right: 16,
    gap: 10,
    zIndex: 9999,
  },
  toast: {
    backgroundColor: '#22322f',
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    overflow: 'hidden',
    shadowColor: '#283d3b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.30,
    shadowRadius: 24,
    elevation: 8,
  },
  toastAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  toastIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toastIconText: {
    fontSize: 14,
  },
  toastBody: {
    flex: 1,
  },
  toastTitle: {
    fontFamily: 'ZenKakuGothicNew_700Bold',
    fontSize: 13,
    color: '#f6f4ef',
  },
  toastSub: {
    fontFamily: 'ZenKakuGothicNew_400Regular',
    fontSize: 11,
    color: '#9aac9c',
    marginTop: 1,
  },
});