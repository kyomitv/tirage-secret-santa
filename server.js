import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createEvent,
  getPublicEvent,
  getAdminEvent,
  revealParticipant,
  resetParticipant,
  deleteEvent
} from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// HTML Routes for local express server
app.get('/admin/:id', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'admin.html'));
});

app.get('/draw/:id', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'draw.html'));
});

// API Routes
app.post('/api/events', async (req, res) => {
  try {
    const { title, budget, rules, participants, exclusions } = req.body;
    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ error: 'Veuillez entrer au moins 2 participants.' });
    }

    const event = await createEvent({
      title: (title || '').trim() || 'Secret Santa',
      budget: (budget || '').trim(),
      rules: (rules || '').trim(),
      participants,
      exclusions: exclusions || {}
    });

    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Erreur lors de la création du tirage.' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await getPublicEvent(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Tirage introuvable ou expiré.' });
    }
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/:id/admin', async (req, res) => {
  try {
    const adminToken = req.query.token || req.headers['x-admin-token'];
    if (!adminToken) {
      return res.status(401).json({ error: 'Jeton administrateur manquant.' });
    }

    const event = await getAdminEvent(req.params.id, adminToken);
    if (!event) {
      return res.status(403).json({ error: 'Accès administrateur refusé ou tirage introuvable.' });
    }

    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:id/reveal', async (req, res) => {
  try {
    const { participantId, claimToken } = req.body;
    if (!participantId) {
      return res.status(400).json({ error: 'Identifiant du participant requis.' });
    }

    const result = await revealParticipant(req.params.id, participantId, claimToken);
    if (!result.success) {
      return res.status(result.status || 400).json({ error: result.message });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:id/admin/reset', async (req, res) => {
  try {
    const { participantId, adminToken } = req.body;
    if (!participantId || !adminToken) {
      return res.status(400).json({ error: 'Paramètres manquants.' });
    }

    const result = await resetParticipant(req.params.id, participantId, adminToken);
    if (!result.success) {
      return res.status(result.status || 400).json({ error: result.message });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const { adminToken } = req.body;
    if (!adminToken) {
      return res.status(400).json({ error: 'Jeton administrateur requis.' });
    }

    const result = await deleteEvent(req.params.id, adminToken);
    if (!result.success) {
      return res.status(result.status || 400).json({ error: result.message });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server if not running inside Vercel serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🎁 Secret Santa server démarré sur http://localhost:${PORT}`);
  });
}

export default app;
