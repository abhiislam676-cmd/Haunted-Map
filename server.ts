import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'ABHIISLAM').trim();
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.GEMINI_API_KEY || 'haunted-map-ephemeral-secret').digest('hex');

const ADMIN_STORE_PATH = path.resolve(__dirname, '.haunted-map-admin-store.json');
const DISCOVERY_STORE_PATH = path.resolve(__dirname, '.haunted-map-discovery.json');
const FIREBASE_CONFIG_PATH = path.resolve(__dirname, 'firebase-applet-config.json');
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface AdminStore {
  username: string;
  passwordHash: string;
  salt: string;
  updatedAt: string;
}

interface DiscoveryDraft {
  id: string;
  name: string;
  country: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  category: string;
  historicalPeriod: string;
  activityTypes: string[];
  description: string;
  history: string;
  paranormalReports: string;
  localLegends: string;
  sourceUrls: string[];
  researchDate: string;
  verificationStatus: 'verified_history' | 'folklore_legend' | 'unverified_claim';
  geocodeSource: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface DiscoveryStore {
  autoEnabled: boolean;
  intervalHours: number;
  countryCursor: number;
  totalDiscovered: number;
  countriesResearched: string[];
  duplicatesRejected: number;
  lastResearchDate: string | null;
  drafts: DiscoveryDraft[];
  recentSourceLinks: { title: string; uri: string; country: string; date: string }[];
  logs: { timestamp: string; message: string; country?: string }[];
}

const TARGET_COUNTRIES = [
  'Bangladesh',
  'United Kingdom',
  'Japan',
  'United States',
  'Romania',
  'Italy',
  'France',
  'India',
  'Ireland',
  'Australia',
  'Germany',
  'Czechia',
  'Mexico',
  'Canada',
  'Spain',
  'Poland',
  'Portugal',
];

const KNOWN_SEED_LOCATIONS = [
  { name: 'Lalbagh Fort', country: 'Bangladesh', lat: 23.7188, lng: 90.3882 },
  { name: 'Ahsan Manzil', country: 'Bangladesh', lat: 23.7085, lng: 90.4056 },
  { name: 'Panam Nagar', country: 'Bangladesh', lat: 23.6558, lng: 90.6033 },
  { name: 'Puthia Rajbari', country: 'Bangladesh', lat: 24.3617, lng: 88.8365 },
  { name: 'Lawachara National Park', country: 'Bangladesh', lat: 24.3292, lng: 91.7879 },
  { name: 'Boga Lake', country: 'Bangladesh', lat: 21.9803, lng: 92.4701 },
  { name: "Foy's Lake", country: 'Bangladesh', lat: 22.3598, lng: 91.7952 },
  { name: 'Edinburgh Castle', country: 'United Kingdom', lat: 55.9486, lng: -3.1999 },
  { name: 'Eastern State Penitentiary', country: 'United States', lat: 39.9683, lng: -75.1727 },
  { name: 'Hoia-Baciu Forest', country: 'Romania', lat: 46.7745, lng: 23.5194 },
  { name: 'The Stanley Hotel', country: 'United States', lat: 40.3828, lng: -105.5186 },
  { name: 'Poveglia Island', country: 'Italy', lat: 45.3819, lng: 12.3314 },
  { name: 'Bhangarh Fort', country: 'India', lat: 27.0962, lng: 76.2862 },
  { name: 'Himeji Castle & Okiku Well', country: 'Japan', lat: 34.8394, lng: 134.6939 },
  { name: 'Château de Brissac', country: 'France', lat: 47.3529, lng: -0.4498 },
  { name: 'Monte Cristo Homestead', country: 'Australia', lat: -34.8644, lng: 147.5902 },
  { name: 'Waverly Hills Sanatorium', country: 'United States', lat: 38.1306, lng: -85.8414 },
];

function getFirebaseApiKey(): string | null {
  try {
    if (fs.existsSync(FIREBASE_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf8'));
      return cfg.apiKey || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function readAdminStore(): AdminStore | null {
  try {
    if (fs.existsSync(ADMIN_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(ADMIN_STORE_PATH, 'utf8')) as AdminStore;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeAdminStore(store: AdminStore): void {
  fs.writeFileSync(ADMIN_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function verifyAdminPassword(username: string, password: string): boolean {
  if (username.trim().toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
    return false;
  }
  const stored = readAdminStore();
  if (stored) {
    const candidateHash = hashPassword(password, stored.salt);
    return crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(stored.passwordHash, 'hex'));
  }
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!initialPassword) {
    return false;
  }
  const a = Buffer.from(password, 'utf8');
  const b = Buffer.from(initialPassword, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAdminAuthConfigured(): boolean {
  return Boolean(readAdminStore() || process.env.ADMIN_INITIAL_PASSWORD);
}

function signSessionToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: username,
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 12,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): { valid: boolean; username?: string } {
  if (!token) return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string;
      exp: number;
    };
    if (Date.now() > parsed.exp) return { valid: false };
    return { valid: true, username: parsed.sub };
  } catch {
    return { valid: false };
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

async function verifyFirebaseUserToken(
  authHeader: string | undefined
): Promise<{ valid: boolean; uid?: string; email?: string; emailVerified?: boolean }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { valid: false };
  const idToken = authHeader.slice(7).trim();
  const apiKey = getFirebaseApiKey();
  if (!idToken || !apiKey) return { valid: false };

  try {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!resp.ok) return { valid: false };
    const data = (await resp.json()) as {
      users?: { localId?: string; email?: string; emailVerified?: boolean }[];
    };
    const user = data.users?.[0];
    if (user?.localId && /^[a-zA-Z0-9_-]{1,128}$/.test(user.localId)) {
      return {
        valid: true,
        uid: user.localId,
        email: user.email,
        emailVerified: user.emailVerified,
      };
    }
  } catch {
    // ignore
  }
  return { valid: false };
}

async function resolveUploadActor(req: Request): Promise<{ ok: boolean; uid: string; isAdmin: boolean }> {
  const fbUser = await verifyFirebaseUserToken(req.headers.authorization);
  if (fbUser.valid && fbUser.uid) {
    return {
      ok: true,
      uid: fbUser.uid,
      isAdmin: fbUser.email === 'abhiislam676@gmail.com' && fbUser.emailVerified === true,
    };
  }
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySessionToken(cookies['hm_admin_session']);
  if (session.valid) {
    return { ok: true, uid: 'admin', isAdmin: true };
  }
  return { ok: false, uid: '', isAdmin: false };
}

async function verifyFirebaseAdminToken(authHeader: string | undefined): Promise<{ valid: boolean; email?: string }> {
  const fbUser = await verifyFirebaseUserToken(authHeader);
  if (fbUser.valid && fbUser.email === 'abhiislam676@gmail.com' && fbUser.emailVerified === true) {
    return { valid: true, email: fbUser.email };
  }
  return { valid: false };
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySessionToken(cookies['hm_admin_session']);
  if (session.valid) {
    (req as Request & { adminUser?: string }).adminUser = session.username;
    next();
    return;
  }

  const fbAuth = await verifyFirebaseAdminToken(req.headers.authorization);
  if (fbAuth.valid) {
    (req as Request & { adminUser?: string }).adminUser = fbAuth.email;
    next();
    return;
  }

  res.status(401).json({ error: 'Administrator authentication required.' });
}

function readDiscoveryStore(): DiscoveryStore {
  try {
    if (fs.existsSync(DISCOVERY_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(DISCOVERY_STORE_PATH, 'utf8')) as DiscoveryStore;
    }
  } catch {
    // ignore
  }
  return {
    autoEnabled: false,
    intervalHours: 12,
    countryCursor: 0,
    totalDiscovered: 0,
    countriesResearched: [],
    duplicatesRejected: 0,
    lastResearchDate: null,
    drafts: [],
    recentSourceLinks: [],
    logs: [],
  };
}

function writeDiscoveryStore(store: DiscoveryStore): void {
  fs.writeFileSync(DISCOVERY_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(val: string): string {
  return val
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const geocodeCache = new Map<string, { lat: number; lng: number; address: string; source: string } | null>();
let lastNominatimRequestAt = 0;

async function geocodePlace(query: string): Promise<{ lat: number; lng: number; address: string; source: string } | null> {
  const normalizedKey = query.trim().toLowerCase();
  if (geocodeCache.has(normalizedKey)) {
    return geocodeCache.get(normalizedKey) ?? null;
  }

  // Enforce OpenStreetMap Nominatim usage policy (max 1 request per second)
  const now = Date.now();
  const elapsed = now - lastNominatimRequestAt;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastNominatimRequestAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'HauntedMapPlatform/1.0 (https://hauntedmap.org; contact@hauntedmap.org)',
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const items = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      if (items[0]) {
        const result = {
          lat: Number(items[0].lat),
          lng: Number(items[0].lon),
          address: items[0].display_name,
          source: 'OpenStreetMap Nominatim',
        };
        geocodeCache.set(normalizedKey, result);
        return result;
      }
    }
  } catch (err) {
    console.error('Nominatim Geocoding error:', err);
  }
  geocodeCache.set(normalizedKey, null);
  return null;
}

const reverseGeocodeCache = new Map<
  string,
  { address: string; city: string; country: string; source: string } | null
>();

async function reverseGeocodePlace(
  lat: number,
  lng: number
): Promise<{ address: string; city: string; country: string; source: string } | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseGeocodeCache.has(key)) {
    return reverseGeocodeCache.get(key) ?? null;
  }

  const now = Date.now();
  const elapsed = now - lastNominatimRequestAt;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastNominatimRequestAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&accept-language=en`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'HauntedMapPlatform/1.0 (https://hauntedmap.org; contact@hauntedmap.org)',
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        display_name?: string;
        address?: Record<string, string | undefined>;
      };
      const a = data.address || {};
      const city =
        a.city ||
        a.town ||
        a.village ||
        a.suburb ||
        a.municipality ||
        a.county ||
        a.state_district ||
        a.state ||
        '';
      const country = a.country || '';
      const result = {
        address: data.display_name || [city, country].filter(Boolean).join(', '),
        city,
        country,
        source: 'OpenStreetMap Nominatim',
      };
      reverseGeocodeCache.set(key, result);
      return result;
    }
  } catch (err) {
    console.error('Nominatim Reverse Geocoding error:', err);
  }
  reverseGeocodeCache.set(key, null);
  return null;
}

let discoveryRunning = false;

async function executeDiscoverySweep(requestedCountry?: string, knownNames: string[] = []): Promise<{
  country: string;
  addedCount: number;
  duplicatesRejected: number;
  error?: string;
}> {
  if (discoveryRunning) {
    throw new Error('A discovery research sweep is already running.');
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }

  discoveryRunning = true;
  const store = readDiscoveryStore();
  const country =
    requestedCountry?.trim() || TARGET_COUNTRIES[store.countryCursor % TARGET_COUNTRIES.length];

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const existingNames = new Set<string>([
      ...KNOWN_SEED_LOCATIONS.map((l) => normalizeName(l.name)),
      ...store.drafts.map((d) => normalizeName(d.name)),
      ...knownNames.map((n) => normalizeName(n)),
    ]);

    const excludeHint = [...KNOWN_SEED_LOCATIONS.map((l) => l.name), ...store.drafts.map((d) => d.name)]
      .slice(0, 25)
      .join(', ');

    const prompt = `Research 3 real, publicly documented historical places in ${country} that are widely associated with folklore, ghost stories, or reported paranormal claims (such as historic castles, former hospitals/sanatoriums, historic hotels, forests, lighthouses, or heritage manors).
Avoid duplicating these already-cataloged places: ${excludeHint || 'none'}.

CRITICAL ACCURACY RULES:
- Use Google Search grounding to verify real places, real cities, and factual history.
- NEVER invent coordinates, addresses, historical facts, or URLs.
- Clearly distinguish verified historical facts ("history") from reported paranormal claims ("paranormalReports") and traditional folklore ("localLegends").
- Never state that a place is proven haunted; frame claims as "reported", "alleged", or "folklore".

Return ONLY a valid JSON array (no markdown commentary outside JSON) of up to 3 objects with exact keys:
[
  {
    "name": "Official Place Name",
    "city": "City or Region",
    "address": "Best known street or locality address for geocoding",
    "category": "One of: Castle & Fortress, Haunted House & Manor, Hospital & Sanatorium, Historic Hotel, Forest & Wilderness, Prison & Penitentiary, Island & Coastal",
    "historicalPeriod": "e.g. 17th Century",
    "activityTypes": ["Apparitions", "Auditory Phenomena"],
    "description": "Concise 2-3 sentence factual overview.",
    "history": "Verified historical background only.",
    "paranormalReports": "Documented reported sightings or claims labeled as reported/alleged.",
    "localLegends": "Traditional local folklore and legends.",
    "verificationStatus": "verified_history or folklore_legend or unverified_claim"
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const rawText = (response.text || '').trim();
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('AI research did not return structured JSON candidates.');
    }

    const candidates = JSON.parse(jsonMatch[0]) as Array<{
      name?: string;
      city?: string;
      address?: string;
      category?: string;
      historicalPeriod?: string;
      activityTypes?: string[];
      description?: string;
      history?: string;
      paranormalReports?: string;
      localLegends?: string;
      verificationStatus?: 'verified_history' | 'folklore_legend' | 'unverified_claim';
    }>;

    // Extract real Google Search grounding URLs
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundedSources: { title: string; uri: string }[] = [];
    for (const chunk of chunks) {
      const web = (chunk as { web?: { uri?: string; title?: string } }).web;
      if (web?.uri) {
        groundedSources.push({
          title: web.title || web.uri,
          uri: web.uri,
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    let addedCount = 0;
    let dupRejected = 0;

    for (const item of candidates) {
      if (!item.name || !item.city || !item.description) continue;
      const norm = normalizeName(item.name);
      if (existingNames.has(norm)) {
        dupRejected++;
        continue;
      }

      // Geocode via Google Maps Geocoding API or Nominatim (respecting rate limit)
      const geoQuery = `${item.name}, ${item.city}, ${country}`;
      const geo = await geocodePlace(geoQuery);

      if (geo) {
        const isNearKnown = KNOWN_SEED_LOCATIONS.some(
          (k) => haversineKm(k.lat, k.lng, geo.lat, geo.lng) < 1.0
        );
        const isNearDraft = store.drafts.some(
          (d) => d.lat !== null && d.lng !== null && haversineKm(d.lat, d.lng, geo.lat, geo.lng) < 1.0
        );
        if (isNearKnown || isNearDraft) {
          dupRejected++;
          continue;
        }
      }

      const id = `ai_${norm.slice(0, 32)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const draft: DiscoveryDraft = {
        id,
        name: item.name.slice(0, 140),
        country,
        city: item.city.slice(0, 100),
        address: (geo?.address || item.address || `${item.city}, ${country}`).slice(0, 300),
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        category: item.category || 'Haunted House & Manor',
        historicalPeriod: item.historicalPeriod || 'Historical',
        activityTypes: Array.isArray(item.activityTypes) ? item.activityTypes.slice(0, 8) : ['Folklore'],
        description: item.description.slice(0, 3000),
        history: (item.history || '').slice(0, 4000),
        paranormalReports: (item.paranormalReports || '').slice(0, 4000),
        localLegends: (item.localLegends || '').slice(0, 3000),
        sourceUrls: groundedSources.map((s) => s.uri).slice(0, 10),
        researchDate: today,
        verificationStatus: item.verificationStatus || 'folklore_legend',
        geocodeSource: geo?.source || 'Unresolved (Manual coordinates needed)',
        status: 'pending',
      };

      store.drafts.unshift(draft);
      existingNames.add(norm);
      addedCount++;
      store.totalDiscovered++;

      // Politeness delay between Nominatim calls
      await new Promise((r) => setTimeout(r, 1100));
    }

    store.duplicatesRejected += dupRejected;
    store.lastResearchDate = new Date().toISOString();
    if (!store.countriesResearched.includes(country)) {
      store.countriesResearched.push(country);
    }
    if (!requestedCountry) {
      store.countryCursor = (store.countryCursor + 1) % TARGET_COUNTRIES.length;
    }

    for (const src of groundedSources.slice(0, 5)) {
      store.recentSourceLinks.unshift({
        title: src.title,
        uri: src.uri,
        country,
        date: today,
      });
    }
    store.recentSourceLinks = store.recentSourceLinks.slice(0, 30);

    store.logs.unshift({
      timestamp: new Date().toISOString(),
      country,
      message: `Researched ${country}: ${addedCount} new draft(s) created, ${dupRejected} duplicate(s) filtered.`,
    });
    store.logs = store.logs.slice(0, 40);

    writeDiscoveryStore(store);
    return { country, addedCount, duplicatesRejected: dupRejected };
  } finally {
    discoveryRunning = false;
  }
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function syncDiscoveryScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  const store = readDiscoveryStore();
  if (store.autoEnabled) {
    const ms = Math.max(1, store.intervalHours) * 60 * 60 * 1000;
    schedulerTimer = setInterval(() => {
      void executeDiscoverySweep().catch((err) => {
        console.error('Scheduled AI Discovery error:', err);
      });
    }, ms);
  }
}

async function startServer() {
  const app = express();

  const UPLOAD_MIME_MAP: Record<string, { ext: string; maxBytes: number }> = {
    'image/jpeg': { ext: '.jpg', maxBytes: 10 * 1024 * 1024 },
    'image/jpg': { ext: '.jpg', maxBytes: 10 * 1024 * 1024 },
    'image/png': { ext: '.png', maxBytes: 10 * 1024 * 1024 },
    'image/webp': { ext: '.webp', maxBytes: 10 * 1024 * 1024 },
    'image/gif': { ext: '.gif', maxBytes: 10 * 1024 * 1024 },
    'image/avif': { ext: '.avif', maxBytes: 10 * 1024 * 1024 },
    'video/mp4': { ext: '.mp4', maxBytes: 32 * 1024 * 1024 },
    'video/webm': { ext: '.webm', maxBytes: 32 * 1024 * 1024 },
    'video/quicktime': { ext: '.mov', maxBytes: 32 * 1024 * 1024 },
  };
  const ALLOWED_UPLOAD_FOLDERS = new Set(['locations', 'posts', 'avatars', 'covers', 'messages', 'general']);

  app.post(
    '/api/uploads',
    express.raw({ type: ['image/*', 'video/*', 'application/octet-stream'], limit: '35mb' }),
    async (req, res) => {
      try {
        const actor = await resolveUploadActor(req);
        if (!actor.ok) {
          res.status(401).json({ error: 'Authentication required to upload media.' });
          return;
        }

        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          res.status(400).json({ error: 'Empty or invalid media payload.' });
          return;
        }

        const contentType = String(req.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        const spec = UPLOAD_MIME_MAP[contentType];
        if (!spec) {
          res.status(415).json({ error: `Unsupported media format: ${contentType || 'unknown'}` });
          return;
        }

        if (req.body.length > spec.maxBytes) {
          res.status(413).json({
            error: `File exceeds maximum allowed size (${Math.round(spec.maxBytes / (1024 * 1024))}MB).`,
          });
          return;
        }

        const rawFolder = String(req.headers['x-upload-folder'] || 'general')
          .trim()
          .toLowerCase();
        const folder = ALLOWED_UPLOAD_FOLDERS.has(rawFolder) ? rawFolder : 'general';

        const userDir = path.join(UPLOADS_DIR, actor.uid);
        fs.mkdirSync(userDir, { recursive: true });

        const filename = `${folder}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}${spec.ext}`;
        const targetPath = path.join(userDir, filename);
        fs.writeFileSync(targetPath, req.body);

        res.status(201).json({
          ok: true,
          url: `/uploads/${actor.uid}/${filename}`,
          size: req.body.length,
          contentType,
        });
      } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Failed to store uploaded media on server.' });
      }
    }
  );

  app.use(express.json({ limit: '2mb' }));

  app.delete('/api/uploads', async (req, res) => {
    const actor = await resolveUploadActor(req);
    if (!actor.ok) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const rawUrl = String((req.body as { url?: string })?.url || '').trim();
    if (!rawUrl.startsWith('/uploads/')) {
      res.status(400).json({ error: 'Invalid upload URL.' });
      return;
    }
    const rel = rawUrl.slice('/uploads/'.length).replace(/^\/+/, '');
    const targetPath = path.resolve(UPLOADS_DIR, rel);
    if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid file path.' });
      return;
    }
    if (!actor.isAdmin && !rel.startsWith(`${actor.uid}/`)) {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Could not remove file.' });
    }
  });

  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '365d',
      fallthrough: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );
  app.use('/uploads', (_req, res) => {
    res.status(404).json({ error: 'Uploaded file not found.' });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'haunted-map' });
  });

  // Admin Auth Endpoints
  app.get('/api/admin/status', (_req, res) => {
    res.json({
      configured: isAdminAuthConfigured(),
      username: ADMIN_USERNAME,
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!isAdminAuthConfigured()) {
      res.status(503).json({
        error:
          'ADMIN_INITIAL_PASSWORD is not configured on the server. Set it in your environment secrets or sign in with the authorized Firebase administrator account.',
      });
      return;
    }
    if (!username || !password || !verifyAdminPassword(username, password)) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    const token = signSessionToken(ADMIN_USERNAME);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('hm_admin_session', token, {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      maxAge: 1000 * 60 * 60 * 12,
      path: '/',
    });
    res.json({ authenticated: true, username: ADMIN_USERNAME });
  });

  app.post('/api/admin/logout', (req, res) => {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('hm_admin_session', {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/me', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifySessionToken(cookies['hm_admin_session']);
    if (session.valid) {
      res.json({ authenticated: true, username: session.username, method: 'credentials' });
      return;
    }
    const fbAuth = await verifyFirebaseAdminToken(req.headers.authorization);
    if (fbAuth.valid) {
      res.json({ authenticated: true, username: fbAuth.email, method: 'firebase' });
      return;
    }
    res.json({ authenticated: false });
  });

  app.post('/api/admin/change-password', requireAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    if (isAdminAuthConfigured() && !verifyAdminPassword(ADMIN_USERNAME, currentPassword)) {
      res.status(401).json({ error: 'Current administrator password is incorrect.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(newPassword, salt);
    writeAdminStore({
      username: ADMIN_USERNAME,
      passwordHash,
      salt,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true, message: 'Administrator password updated securely.' });
  });

  // Server-side Geocoding Endpoint
  app.get('/api/geocode', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      res.status(400).json({ error: 'Provide a valid search query (?q=...).' });
      return;
    }
    const result = await geocodePlace(q);
    if (!result) {
      res.status(404).json({ error: 'No matching geographic coordinates found.' });
      return;
    }
    res.json(result);
  });

  app.get('/api/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Provide valid ?lat=...&lng=... coordinates.' });
      return;
    }
    const result = await reverseGeocodePlace(lat, lng);
    if (!result) {
      res.json({
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        city: '',
        country: 'Bangladesh',
        source: 'Coordinates',
      });
      return;
    }
    res.json(result);
  });

  const directionsCache = new Map<
    string,
    {
      distanceKm: number;
      durationSeconds: number;
      coordinates: Array<[number, number]>;
      source: string;
    }
  >();

  app.get('/api/directions', async (req, res) => {
    const fromLat = Number(req.query.fromLat);
    const fromLng = Number(req.query.fromLng);
    const toLat = Number(req.query.toLat);
    const toLng = Number(req.query.toLng);
    const profile = req.query.profile === 'walking' ? 'walking' : 'driving';

    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng) ||
      fromLat < -90 ||
      fromLat > 90 ||
      toLat < -90 ||
      toLat > 90 ||
      fromLng < -180 ||
      fromLng > 180 ||
      toLng < -180 ||
      toLng > 180
    ) {
      res.status(400).json({ error: 'Provide valid fromLat, fromLng, toLat, toLng coordinates.' });
      return;
    }

    const cacheKey = `${profile}:${fromLat.toFixed(4)},${fromLng.toFixed(4)}->${toLat.toFixed(4)},${toLng.toFixed(4)}`;
    const cached = directionsCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const straightKm = haversineKm(fromLat, fromLng, toLat, toLng);
    const osrmProfile = profile === 'walking' ? 'foot' : 'driving';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'HauntedMapPlatform/1.0',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = (await resp.json()) as {
          code?: string;
          routes?: Array<{
            distance: number;
            duration: number;
            geometry?: { coordinates?: Array<[number, number]> };
          }>;
        };
        const route = data.routes?.[0];
        if (route && route.geometry?.coordinates?.length) {
          const latLngCoords = route.geometry.coordinates.map(
            ([lngVal, latVal]) => [latVal, lngVal] as [number, number]
          );
          const result = {
            distanceKm: Number((route.distance / 1000).toFixed(2)),
            durationSeconds: Math.round(route.duration),
            coordinates: latLngCoords,
            source: 'OpenStreetMap OSRM',
          };
          directionsCache.set(cacheKey, result);
          res.json(result);
          return;
        }
      }
    } catch {
      // Fallback cleanly to estimated straight-line route
    }

    const fallbackSpeedKmh = profile === 'walking' ? 4.8 : 38;
    const fallbackResult = {
      distanceKm: Number(straightKm.toFixed(2)),
      durationSeconds: Math.max(60, Math.round((straightKm / fallbackSpeedKmh) * 3600)),
      coordinates: [
        [fromLat, fromLng] as [number, number],
        [toLat, toLng] as [number, number],
      ],
      source: 'Estimated Distance & Duration',
    };
    directionsCache.set(cacheKey, fallbackResult);
    res.json(fallbackResult);
  });

  // AI Discovery System Endpoints
  app.get('/api/discovery/status', requireAdmin, (_req, res) => {
    const store = readDiscoveryStore();
    res.json({
      running: discoveryRunning,
      autoEnabled: store.autoEnabled,
      intervalHours: store.intervalHours,
      totalDiscovered: store.totalDiscovered,
      countriesResearched: store.countriesResearched,
      pendingCount: store.drafts.filter((d) => d.status === 'pending').length,
      duplicatesRejected: store.duplicatesRejected,
      lastResearchDate: store.lastResearchDate,
      recentSourceLinks: store.recentSourceLinks,
      logs: store.logs,
      drafts: store.drafts,
      availableCountries: TARGET_COUNTRIES,
    });
  });

  app.post('/api/discovery/toggle', requireAdmin, (req, res) => {
    const { autoEnabled, intervalHours } = req.body as {
      autoEnabled?: boolean;
      intervalHours?: number;
    };
    const store = readDiscoveryStore();
    if (typeof autoEnabled === 'boolean') {
      store.autoEnabled = autoEnabled;
    }
    if (typeof intervalHours === 'number' && intervalHours >= 1 && intervalHours <= 168) {
      store.intervalHours = intervalHours;
    }
    store.logs.unshift({
      timestamp: new Date().toISOString(),
      message: `Automatic background discovery ${store.autoEnabled ? 'enabled' : 'disabled'} (every ${store.intervalHours}h).`,
    });
    store.logs = store.logs.slice(0, 40);
    writeDiscoveryStore(store);
    syncDiscoveryScheduler();
    res.json({ autoEnabled: store.autoEnabled, intervalHours: store.intervalHours });
  });

  app.post('/api/discovery/run', requireAdmin, async (req, res) => {
    const { country, knownNames } = req.body as { country?: string; knownNames?: string[] };
    try {
      const result = await executeDiscoverySweep(country, Array.isArray(knownNames) ? knownNames : []);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Discovery sweep failed.',
      });
    }
  });

  app.post('/api/discovery/drafts/:id/status', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status?: 'approved' | 'rejected' };
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }
    const store = readDiscoveryStore();
    const draft = store.drafts.find((d) => d.id === id);
    if (!draft) {
      res.status(404).json({ error: 'Draft not found.' });
      return;
    }
    draft.status = status;
    store.logs.unshift({
      timestamp: new Date().toISOString(),
      country: draft.country,
      message: `Draft "${draft.name}" marked as ${status}.`,
    });
    store.logs = store.logs.slice(0, 40);
    writeDiscoveryStore(store);
    res.json({ ok: true, draft });
  });

  // Vite Dev Middleware or Static Production Build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  syncDiscoveryScheduler();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HAUNTED MAP server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
