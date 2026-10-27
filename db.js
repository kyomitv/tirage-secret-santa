import crypto from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const isVercelKv = Boolean(
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
);

let redisClient = null;
let sqliteDb = null;

if (isVercelKv) {
  const { Redis } = await import('@upstash/redis');
  redisClient = new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  console.log('⚡ Utilisation du stockage Vercel KV / Upstash Redis');
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(__dirname, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  sqliteDb = new DatabaseSync(join(dataDir, 'secretsanta.db'));
  sqliteDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      admin_token TEXT NOT NULL,
      title TEXT NOT NULL,
      budget TEXT,
      rules TEXT,
      created_at TEXT NOT NULL,
      exclusions TEXT
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      is_opened INTEGER DEFAULT 0,
      opened_at TEXT,
      opened_token TEXT,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    );
  `);

  try {
    sqliteDb.exec('ALTER TABLE events ADD COLUMN exclusions TEXT;');
  } catch (_) {}

  console.log('📦 Utilisation de la base SQLite locale');
}

/**
 * Generate a valid Secret Santa pairing.
 * Guarantees no one gives to themselves and satisfies exclusion constraints.
 */
export function generatePairs(names, exclusions = {}) {
  const cleanedNames = names.map(n => n.trim()).filter(Boolean);
  if (cleanedNames.length < 2) {
    throw new Error('Il faut au moins 2 participants pour faire un tirage.');
  }

  const uniqueNames = Array.from(new Set(cleanedNames));
  if (uniqueNames.length !== cleanedNames.length) {
    throw new Error('Les noms des participants doivent tous être différents.');
  }

  // Try randomized single-cycle shuffle (up to 400 attempts)
  for (let attempt = 0; attempt < 400; attempt++) {
    const shuffled = [...uniqueNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let valid = true;
    const pairs = [];
    for (let i = 0; i < shuffled.length; i++) {
      const giver = shuffled[i];
      const receiver = shuffled[(i + 1) % shuffled.length];
      if (giver === receiver) {
        valid = false;
        break;
      }
      const excluded = exclusions[giver] || [];
      if (excluded.includes(receiver)) {
        valid = false;
        break;
      }
      pairs.push({ giver, receiver });
    }

    if (valid) {
      return pairs;
    }
  }

  // Backtracking fallback for tight exclusion constraints
  function backtrack(index, availableReceivers, currentAssignment) {
    if (index === uniqueNames.length) {
      return currentAssignment;
    }
    const giver = uniqueNames[index];
    const excluded = exclusions[giver] || [];
    const candidates = [...availableReceivers].sort(() => Math.random() - 0.5);

    for (const receiver of candidates) {
      if (receiver === giver) continue;
      if (excluded.includes(receiver)) continue;

      const nextAvailable = availableReceivers.filter(r => r !== receiver);
      const res = backtrack(index + 1, nextAvailable, [...currentAssignment, { giver, receiver }]);
      if (res) return res;
    }
    return null;
  }

  const result = backtrack(0, uniqueNames, []);
  if (!result) {
    throw new Error('Impossible de trouver une combinaison valide avec les exclusions spécifiées.');
  }
  return result;
}

export async function createEvent({ title, budget, rules, participants, exclusions = {} }) {
  const pairs = generatePairs(participants, exclusions);
  const eventId = crypto.randomBytes(5).toString('hex');
  const adminToken = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  // Shuffle order of participant cards
  const shuffledPairs = [...pairs].sort(() => Math.random() - 0.5);

  const participantObjects = shuffledPairs.map(pair => ({
    id: crypto.randomBytes(6).toString('hex'),
    name: pair.giver,
    target_name: pair.receiver,
    is_opened: 0,
    opened_at: null,
    opened_token: null
  }));

  if (isVercelKv) {
    const eventData = {
      id: eventId,
      admin_token: adminToken,
      title: title || 'Secret Santa',
      budget: budget || '',
      rules: rules || '',
      created_at: now,
      exclusions: exclusions || {},
      participants: participantObjects
    };
    await redisClient.set(`secretsanta:event:${eventId}`, JSON.stringify(eventData), {
      ex: 60 * 60 * 24 * 90
    });
  } else {
    const insertEvent = sqliteDb.prepare(`
      INSERT INTO events (id, admin_token, title, budget, rules, created_at, exclusions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertEvent.run(
      eventId,
      adminToken,
      title || 'Secret Santa',
      budget || '',
      rules || '',
      now,
      JSON.stringify(exclusions || {})
    );

    const insertParticipant = sqliteDb.prepare(`
      INSERT INTO participants (id, event_id, name, target_name, is_opened, opened_at, opened_token)
      VALUES (?, ?, ?, ?, 0, NULL, NULL)
    `);

    for (const p of participantObjects) {
      insertParticipant.run(p.id, eventId, p.name, p.target_name);
    }
  }

  return { eventId, adminToken };
}

export async function getPublicEvent(eventId) {
  if (isVercelKv) {
    const raw = await redisClient.get(`secretsanta:event:${eventId}`);
    if (!raw) return null;
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const sortedParticipants = [...event.participants].sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
    );

    return {
      id: event.id,
      title: event.title,
      budget: event.budget,
      rules: event.rules,
      createdAt: event.created_at,
      participants: sortedParticipants.map(p => ({
        id: p.id,
        name: p.name,
        isOpened: Boolean(p.is_opened),
        openedAt: p.opened_at
      }))
    };
  }

  const eventStmt = sqliteDb.prepare('SELECT id, title, budget, rules, created_at FROM events WHERE id = ?');
  const event = eventStmt.get(eventId);
  if (!event) return null;

  const partStmt = sqliteDb.prepare(`
    SELECT id, name, is_opened, opened_at
    FROM participants
    WHERE event_id = ?
    ORDER BY name COLLATE NOCASE ASC
  `);
  const participants = partStmt.all(eventId).map(p => ({
    id: p.id,
    name: p.name,
    isOpened: Boolean(p.is_opened),
    openedAt: p.opened_at
  }));

  return {
    ...event,
    participants
  };
}

export async function getAdminEvent(eventId, adminToken) {
  if (isVercelKv) {
    const raw = await redisClient.get(`secretsanta:event:${eventId}`);
    if (!raw) return null;
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (event.admin_token !== adminToken) return null;

    const sortedParticipants = [...event.participants].sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
    );

    return {
      id: event.id,
      title: event.title,
      budget: event.budget,
      rules: event.rules,
      createdAt: event.created_at,
      participants: sortedParticipants.map(p => ({
        id: p.id,
        name: p.name,
        targetName: p.target_name,
        isOpened: Boolean(p.is_opened),
        openedAt: p.opened_at
      }))
    };
  }

  const eventStmt = sqliteDb.prepare('SELECT * FROM events WHERE id = ? AND admin_token = ?');
  const event = eventStmt.get(eventId, adminToken);
  if (!event) return null;

  const partStmt = sqliteDb.prepare(`
    SELECT id, name, target_name, is_opened, opened_at
    FROM participants
    WHERE event_id = ?
    ORDER BY name COLLATE NOCASE ASC
  `);
  const participants = partStmt.all(eventId).map(p => ({
    id: p.id,
    name: p.name,
    targetName: p.target_name,
    isOpened: Boolean(p.is_opened),
    openedAt: p.opened_at
  }));

  return {
    id: event.id,
    title: event.title,
    budget: event.budget,
    rules: event.rules,
    createdAt: event.created_at,
    participants
  };
}

export async function revealParticipant(eventId, participantId, claimToken = null) {
  if (isVercelKv) {
    const raw = await redisClient.get(`secretsanta:event:${eventId}`);
    if (!raw) {
      return { success: false, status: 404, message: 'Tirage non trouvé.' };
    }
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const part = event.participants.find(p => p.id === participantId);
    if (!part) {
      return { success: false, status: 404, message: 'Participant non trouvé.' };
    }

    if (part.is_opened) {
      if (claimToken && claimToken === part.opened_token) {
        return {
          success: true,
          participantName: part.name,
          targetName: part.target_name,
          isReplay: true,
          claimToken: part.opened_token
        };
      }
      return {
        success: false,
        status: 403,
        message: 'Cette enveloppe a déjà été ouverte et est définitivement verrouillée.'
      };
    }

    const newClaimToken = crypto.randomUUID();
    const now = new Date().toISOString();

    part.is_opened = 1;
    part.opened_at = now;
    part.opened_token = newClaimToken;

    await redisClient.set(`secretsanta:event:${eventId}`, JSON.stringify(event), {
      ex: 60 * 60 * 24 * 90
    });

    return {
      success: true,
      participantName: part.name,
      targetName: part.target_name,
      isReplay: false,
      claimToken: newClaimToken
    };
  }

  const partStmt = sqliteDb.prepare('SELECT * FROM participants WHERE id = ? AND event_id = ?');
  const part = partStmt.get(participantId, eventId);
  if (!part) {
    return { success: false, status: 404, message: 'Participant non trouvé.' };
  }

  if (part.is_opened) {
    if (claimToken && claimToken === part.opened_token) {
      return {
        success: true,
        participantName: part.name,
        targetName: part.target_name,
        isReplay: true,
        claimToken: part.opened_token
      };
    }
    return {
      success: false,
      status: 403,
      message: 'Cette enveloppe a déjà été ouverte et est définitivement verrouillée.'
    };
  }

  const newClaimToken = crypto.randomUUID();
  const now = new Date().toISOString();

  const updateStmt = sqliteDb.prepare(`
    UPDATE participants
    SET is_opened = 1, opened_at = ?, opened_token = ?
    WHERE id = ? AND is_opened = 0
  `);
  const info = updateStmt.run(now, newClaimToken, participantId);

  if (info.changes === 0) {
    return {
      success: false,
      status: 403,
      message: 'Cette enveloppe vient tout juste d’être ouverte.'
    };
  }

  return {
    success: true,
    participantName: part.name,
    targetName: part.target_name,
    isReplay: false,
    claimToken: newClaimToken
  };
}

export async function resetParticipant(eventId, participantId, adminToken) {
  if (isVercelKv) {
    const raw = await redisClient.get(`secretsanta:event:${eventId}`);
    if (!raw) return { success: false, status: 404, message: 'Tirage non trouvé.' };
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (event.admin_token !== adminToken) {
      return { success: false, status: 401, message: 'Non autorisé.' };
    }

    const part = event.participants.find(p => p.id === participantId);
    if (!part) return { success: false, status: 404, message: 'Participant non trouvé.' };

    part.is_opened = 0;
    part.opened_at = null;
    part.opened_token = null;

    await redisClient.set(`secretsanta:event:${eventId}`, JSON.stringify(event), {
      ex: 60 * 60 * 24 * 90
    });
    return { success: true };
  }

  const eventStmt = sqliteDb.prepare('SELECT id FROM events WHERE id = ? AND admin_token = ?');
  const event = eventStmt.get(eventId, adminToken);
  if (!event) {
    return { success: false, status: 401, message: 'Non autorisé.' };
  }

  const updateStmt = sqliteDb.prepare(`
    UPDATE participants
    SET is_opened = 0, opened_at = NULL, opened_token = NULL
    WHERE id = ? AND event_id = ?
  `);
  updateStmt.run(participantId, eventId);
  return { success: true };
}

export async function resetAllOpenings(eventId, adminToken) {
  if (isVercelKv) {
    const raw = await redisClient.get(`secretsanta:event:${eventId}`);
    if (!raw) return { success: false, status: 404, message: 'Tirage non trouvé.' };
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (event.admin_token !== adminToken) {
      return { success: false, status: 401, message: 'Non autorisé.' };
    }

    event.participants.forEach(p => {
      p.is_opened = 0;
      p.opened_at = null;
      p.opened_token = null;
    });

    await redisClient.set(`secretsanta:event:${eventId}`, JSON.stringify(event), {
      ex: 60 * 60 * 24 * 90
    });
    return { success: true };
  }

  const eventStmt = sqliteDb.prepare('SELECT id FROM events WHERE id = ? AND admin_token = ?');
  const event = eventStmt.get(eventId, adminToken);
  if (!event) {
    return { success: false, status: 401, message: 'Non autorisé.' };
  }

  const updateStmt = sqliteDb.prepare(`
    UPDATE participants
    SET is_opened = 0, opened_at = NULL, opened_token = NULL
    WHERE event_id = ?
  `);
  updateStmt.run(eventId);
  return { success: true };
}

export async function rerollDraw(eventId, adminToken) {
  if (isVercelKv) {
    const raw = await redisClient.get(`secretsanta:event:${eventId}`);
    if (!raw) return { success: false, status: 404, message: 'Tirage non trouvé.' };
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (event.admin_token !== adminToken) {
      return { success: false, status: 401, message: 'Non autorisé.' };
    }

    const names = event.participants.map(p => p.name);
    const pairs = generatePairs(names, event.exclusions || {});

    event.participants.forEach(p => {
      const match = pairs.find(pair => pair.giver === p.name);
      if (match) {
        p.target_name = match.receiver;
      }
      p.is_opened = 0;
      p.opened_at = null;
      p.opened_token = null;
    });

    await redisClient.set(`secretsanta:event:${eventId}`, JSON.stringify(event), {
      ex: 60 * 60 * 24 * 90
    });
    return { success: true };
  }

  const eventStmt = sqliteDb.prepare('SELECT * FROM events WHERE id = ? AND admin_token = ?');
  const event = eventStmt.get(eventId, adminToken);
  if (!event) {
    return { success: false, status: 401, message: 'Non autorisé.' };
  }

  const partStmt = sqliteDb.prepare('SELECT id, name FROM participants WHERE event_id = ?');
  const parts = partStmt.all(eventId);
  const names = parts.map(p => p.name);

  let exclusions = {};
  try {
    exclusions = event.exclusions ? JSON.parse(event.exclusions) : {};
  } catch (_) {}

  const pairs = generatePairs(names, exclusions);

  const updateStmt = sqliteDb.prepare(`
    UPDATE participants
    SET target_name = ?, is_opened = 0, opened_at = NULL, opened_token = NULL
    WHERE id = ? AND event_id = ?
  `);

  for (const p of parts) {
    const match = pairs.find(pair => pair.giver === p.name);
    if (match) {
      updateStmt.run(match.receiver, p.id, eventId);
    }
  }

  return { success: true };
}

export async function deleteEvent(eventId, adminToken) {
  if (isVercelKv) {
    const raw = await redisClient.get(`secretsanta:event:${eventId}`);
    if (!raw) return { success: false, status: 404, message: 'Tirage non trouvé.' };
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (event.admin_token !== adminToken) {
      return { success: false, status: 401, message: 'Non autorisé.' };
    }

    await redisClient.del(`secretsanta:event:${eventId}`);
    return { success: true };
  }

  const eventStmt = sqliteDb.prepare('SELECT id FROM events WHERE id = ? AND admin_token = ?');
  const event = eventStmt.get(eventId, adminToken);
  if (!event) {
    return { success: false, status: 401, message: 'Non autorisé.' };
  }

  sqliteDb.prepare('DELETE FROM participants WHERE event_id = ?').run(eventId);
  sqliteDb.prepare('DELETE FROM events WHERE id = ?').run(eventId);
  return { success: true };
}
