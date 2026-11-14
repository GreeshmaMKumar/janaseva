import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orchestrateComplaintPipeline } from './server/ai/orchestrator.ts';
import {
  runBatchMonitoringAnalysis,
  type BatchMonitorComplaint,
} from './server/ai/agents/monitoringAgent.ts';
import {
  GEMINI_MODEL,
  type DepartmentContext,
  type RecentComplaintContext,
} from './server/ai/geminiClient.ts';
import processComplaintRouter from './server/processComplaintRouter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api', processComplaintRouter);

// Guard against infinite loops, rapid duplicate bursts, and excessive Gemini API calls
const RATE_WINDOW_MS = 60_000;
const MAX_ORCHESTRATE_PER_WINDOW = 20;
const MAX_MONITOR_PER_WINDOW = 15;
const DUPLICATE_COOLDOWN_MS = 8_000;

const orchestrateTimestamps: number[] = [];
const monitorTimestamps: number[] = [];
const recentPayloadHashes = new Map<string, number>();

function checkSlidingRateLimit(timestamps: number[], maxRequests: number): boolean {
  const now = Date.now();
  while (timestamps.length > 0 && now - timestamps[0] > RATE_WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  return true;
}

function checkAndRecordDuplicateBurst(fingerprint: string): boolean {
  const now = Date.now();
  for (const [key, ts] of recentPayloadHashes.entries()) {
    if (now - ts > DUPLICATE_COOLDOWN_MS) {
      recentPayloadHashes.delete(key);
    }
  }
  const prev = recentPayloadHashes.get(fingerprint);
  if (prev && now - prev <= DUPLICATE_COOLDOWN_MS) {
    return true;
  }
  recentPayloadHashes.set(fingerprint, now);
  return false;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'janaseva-ai-backend',
    model: GEMINI_MODEL,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.post('/api/agents/orchestrate', async (req, res) => {
  try {
    const {
      title,
      description,
      locationText,
      ward,
      userSelectedCategory,
      photoDataUrl,
      departments,
      recentComplaints,
    } = req.body as {
      title?: string;
      description?: string;
      locationText?: string;
      ward?: string;
      userSelectedCategory?: string;
      photoDataUrl?: string;
      departments?: DepartmentContext[];
      recentComplaints?: RecentComplaintContext[];
    };

    if (!title || !description || !locationText || !ward) {
      res.status(400).json({
        error: 'Missing required complaint fields: title, description, locationText, and ward are required.',
      });
      return;
    }

    if (!Array.isArray(departments) || departments.length === 0) {
      res.status(400).json({
        error: 'Municipal department directory must be provided for routing.',
      });
      return;
    }

    const fingerprint = `${String(title).trim().toLowerCase()}|${String(ward).trim().toLowerCase()}|${String(
      description
    )
      .trim()
      .toLowerCase()
      .slice(0, 120)}`;

    if (checkAndRecordDuplicateBurst(fingerprint)) {
      res.status(429).json({
        error: 'Duplicate orchestration request detected within 8 seconds. Please wait before resubmitting.',
      });
      return;
    }

    if (!checkSlidingRateLimit(orchestrateTimestamps, MAX_ORCHESTRATE_PER_WINDOW)) {
      res.status(429).json({
        error: 'AI orchestrator rate limit reached (max 20 runs per minute). Please wait briefly and try again.',
      });
      return;
    }

    const safeRecent = Array.isArray(recentComplaints) ? recentComplaints.slice(0, 20) : [];

    const result = await orchestrateComplaintPipeline({
      intake: {
        title: String(title).trim(),
        description: String(description).trim(),
        locationText: String(locationText).trim(),
        ward: String(ward).trim(),
        userSelectedCategory: String(userSelectedCategory || 'Road maintenance'),
        photoDataUrl: typeof photoDataUrl === 'string' ? photoDataUrl : undefined,
      },
      departments,
      recentComplaints: safeRecent,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI orchestration failed';
    console.error('[/api/agents/orchestrate] Error:', error);
    res.status(500).json({
      error: message,
    });
  }
});

app.post('/api/agents/monitor', async (req, res) => {
  try {
    const { complaints } = req.body as { complaints?: BatchMonitorComplaint[] };
    if (!Array.isArray(complaints)) {
      res.status(400).json({ error: 'complaints array is required.' });
      return;
    }

    if (complaints.length === 0) {
      res.json({
        analysis: {
          overallRiskSummary: 'No complaints available for SLA and recurring hotspot evaluation.',
          escalationRecommendations: [],
          recurringHotspots: [],
        },
        trace: {
          agentName: 'Monitoring and Escalation Agent',
          action: 'Portfolio SLA audit & recurring hotspot scan',
          status: 'Completed',
          latencyMs: 0,
          summary: 'Portfolio empty; zero escalations or recurring hotspots detected.',
          outputData: { escalationCount: 0, hotspotCount: 0, autoCloseAllowed: false },
        },
      });
      return;
    }

    if (!checkSlidingRateLimit(monitorTimestamps, MAX_MONITOR_PER_WINDOW)) {
      res.status(429).json({
        error: 'Monitoring scan rate limit reached (max 15 scans per minute). Please wait briefly.',
      });
      return;
    }

    const result = await runBatchMonitoringAnalysis(complaints, new Date().toISOString());
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Monitoring analysis failed';
    console.error('[/api/agents/monitor] Error:', error);
    res.status(500).json({
      error: message,
    });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

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
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JANASEVA AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start JANASEVA AI server:', err);
  process.exit(1);
});
