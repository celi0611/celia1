const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "ledger.json");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "ledgers";
const LEDGER_ID = process.env.LEDGER_ID || "main";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    writeLocalLedger({ clients: [], notes: [] });
  }
}

function normalizeLedger(input) {
  return {
    clients: Array.isArray(input?.clients) ? input.clients : [],
    notes: Array.isArray(input?.notes) ? input.notes : [],
    calendars: Array.isArray(input?.calendars) ? input.calendars : [],
    calendarTasks: Array.isArray(input?.calendarTasks) ? input.calendarTasks : [],
    taskActions: input?.taskActions && typeof input.taskActions === "object" ? input.taskActions : {},
    taskOverrides: input?.taskOverrides && typeof input.taskOverrides === "object" ? input.taskOverrides : {},
    customTasks: Array.isArray(input?.customTasks) ? input.customTasks : [],
    dayPlans: Array.isArray(input?.dayPlans) ? input.dayPlans : [],
    weekPlans: Array.isArray(input?.weekPlans) ? input.weekPlans : [],
    brandRefs: Array.isArray(input?.brandRefs) ? input.brandRefs : [],
    toolRefs: Array.isArray(input?.toolRefs) ? input.toolRefs : [],
    reportTemplates: input?.reportTemplates && typeof input.reportTemplates === "object" ? input.reportTemplates : {},
    progressOverrides: input?.progressOverrides && typeof input.progressOverrides === "object" ? input.progressOverrides : {},
    plannedOverrides: input?.plannedOverrides && typeof input.plannedOverrides === "object" ? input.plannedOverrides : {},
    progressRemarks: input?.progressRemarks && typeof input.progressRemarks === "object" ? input.progressRemarks : {},
    dashboardMetricOverrides: input?.dashboardMetricOverrides && typeof input.dashboardMetricOverrides === "object" ? input.dashboardMetricOverrides : {},
    mailTemplate: typeof input?.mailTemplate === "string" ? input.mailTemplate : "",
    updatedAt: new Date().toISOString(),
  };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 6000, headers: { "User-Agent": "xhs-ledger-local" } }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 2_000_000) req.destroy(new Error("response too large"));
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
  });
}

function hasCloudStorage() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseRequest(method, endpoint, body) {
  if (!hasCloudStorage()) return Promise.reject(new Error("Supabase is not configured"));

  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${endpoint}`);
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = https.request(
      url,
      {
        method,
        timeout: 10000,
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json; charset=utf-8",
          Prefer: "resolution=merge-duplicates,return=representation",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let responseBody = "";
        response.on("data", (chunk) => {
          responseBody += chunk;
          if (responseBody.length > 50_000_000) req.destroy(new Error("response too large"));
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(responseBody || `Supabase request failed: ${response.statusCode}`));
            return;
          }

          if (!responseBody) {
            resolve(null);
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch {
            resolve(responseBody);
          }
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end(payload);
  });
}

function domainFromUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function readLocalLedger() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeLedger(JSON.parse(raw));
  } catch {
    return normalizeLedger({ clients: [], notes: [] });
  }
}

function writeLocalLedger(input) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const ledger = normalizeLedger(input);
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(ledger, null, 2), "utf8");
  fs.renameSync(tempFile, DATA_FILE);
  return ledger;
}

async function readCloudLedger() {
  const rows = await supabaseRequest("GET", `${SUPABASE_TABLE}?id=eq.${encodeURIComponent(LEDGER_ID)}&select=data`, undefined);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row?.data) {
    const cloudLedger = normalizeLedger(row.data);
    if (cloudLedger.clients.length || cloudLedger.notes.length) return cloudLedger;
  }

  const seed = readLocalLedger();
  if (seed.clients.length || seed.notes.length) {
    await writeCloudLedger(seed);
    return seed;
  }
  return normalizeLedger({ clients: [], notes: [] });
}

async function writeCloudLedger(input) {
  const ledger = normalizeLedger(input);
  await supabaseRequest("POST", SUPABASE_TABLE, {
    id: LEDGER_ID,
    data: ledger,
    updated_at: new Date().toISOString(),
  });
  return ledger;
}

async function readLedger() {
  if (hasCloudStorage()) return readCloudLedger();
  return readLocalLedger();
}

async function writeLedger(input) {
  if (hasCloudStorage()) return writeCloudLedger(input);
  return writeLocalLedger(input);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50_000_000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = path.normalize(path.join(ROOT, decoded));

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      mode: hasCloudStorage() ? "cloud" : "local",
      storage: hasCloudStorage() ? `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}/${LEDGER_ID}` : DATA_FILE,
    });
    return;
  }

  if (pathname === "/api/ledger" && req.method === "GET") {
    try {
      sendJson(res, 200, await readLedger());
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || "读取云端数据失败" });
    }
    return;
  }

  if (pathname === "/api/logo" && req.method === "GET") {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const name = requestUrl.searchParams.get("name") || "";
    const rawBrandUrl = requestUrl.searchParams.get("url") || "";
    const domain = domainFromUrl(rawBrandUrl);

    try {
      if (name.trim()) {
        const suggestions = await fetchJson(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name.trim())}`);
        const logo = Array.isArray(suggestions) ? suggestions.find((item) => item?.logo)?.logo : "";
        if (logo) {
          sendJson(res, 200, { ok: true, logo, source: "brand-name" });
          return;
        }
      }
    } catch {
      // Fall through to domain favicon fallback.
    }

    if (domain) {
      sendJson(res, 200, {
        ok: true,
        logo: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
        source: "domain",
      });
      return;
    }

    sendJson(res, 200, { ok: false, logo: "", source: "fallback" });
    return;
  }

  if (pathname === "/api/ledger" && req.method === "PUT") {
    try {
      const body = await readBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const ledger = await writeLedger(parsed);
      sendJson(res, 200, ledger);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "Invalid JSON" });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "API not found" });
}

ensureDataFile();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url.pathname);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`牛马工作日记已启动：http://${displayHost}:${PORT}`);
  console.log(hasCloudStorage() ? `云数据库：${SUPABASE_URL}/${SUPABASE_TABLE}` : `本地数据文件：${DATA_FILE}`);
});
