import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
const port = Number(process.env.PORT || 8787);
const dataDir = process.env.SELFTERM_DATA_DIR || path.resolve(process.cwd(), 'data');
const token = process.env.SYNC_TOKEN || '';
const vaultPath = path.join(dataDir, 'vault.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function requireToken(req, res, next) {
  if (!token) {
    res.status(500).send('SYNC_TOKEN is not set on the server.');
    return;
  }

  const header = req.header('authorization') || '';
  if (header !== `Bearer ${token}`) {
    res.status(401).send('Unauthorized');
    return;
  }

  next();
}

async function readVault() {
  try {
    const raw = await fs.readFile(vaultPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeVault(payload) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(vaultPath, JSON.stringify(payload, null, 2), 'utf8');
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'selfterm-sync' });
});

app.get('/vault', requireToken, async (_req, res, next) => {
  try {
    const vault = await readVault();
    res.json(vault || { updatedAt: null, blob: null });
  } catch (error) {
    next(error);
  }
});

app.put('/vault', requireToken, async (req, res, next) => {
  try {
    const { blob, updatedAt } = req.body || {};
    if (!blob || blob.format !== 'selfterm-vault-v1') {
      res.status(400).send('Invalid vault blob.');
      return;
    }

    const payload = {
      updatedAt: Number(updatedAt) || Date.now(),
      blob,
    };

    await writeVault(payload);
    res.json({ ok: true, updatedAt: payload.updatedAt });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).send(error.message || 'Server error');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`SelfTerm sync server listening on http://0.0.0.0:${port}`);
  if (!token) {
    console.warn('SYNC_TOKEN is not set. Set it before using /vault.');
  }
});
