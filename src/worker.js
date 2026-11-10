const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 310000;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}
function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function clearCookie() {
  return "hub_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}
function randomId(prefix = "") {
  return prefix + crypto.randomUUID();
}
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}
async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
async function passwordHash(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt.match(/../g).map(x => parseInt(x, 16))), iterations }, key, 256);
  return bytesToHex(bits);
}
function safeName(name) {
  return String(name || "file").normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "file";
}
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "")) && String(email).length <= 254;
}
async function bodyJson(request) {
  try { return await request.json(); } catch { return null; }
}
async function currentUser(request, env) {
  const token = request.headers.get("Cookie")?.match(/(?:^|;\s*)hub_session=([^;]+)/)?.[1];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.display_name AS displayName, s.id AS sessionId FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ?"
  ).bind(tokenHash, new Date().toISOString()).first();
  if (row) await env.DB.prepare("UPDATE sessions SET last_seen_at=? WHERE id=?").bind(new Date().toISOString(), row.sessionId).run();
  return row || null;
}
function requireOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return origin === new URL(request.url).origin || allowed.includes(origin);
}
async function requireAuth(request, env) {
  const user = await currentUser(request, env);
  return user;
}
async function register(request, env) {
  const data = await bodyJson(request);
  if (!data || !validateEmail(data.email) || typeof data.password !== "string" || data.password.length < 12 || data.password.length > 256) {
    return json({ error: "Use a valid email and a password with at least 12 characters." }, 400);
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if (count.n > 0) return json({ error: "Owner account already exists. Public sign-up is closed." }, 403);
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(data.password, salt);
  const userId = randomId("usr_");
  const displayName = String(data.displayName || data.email.split("@")[0]).trim().slice(0, 80);
  try {
    await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,password_iterations) VALUES (?,?,?,?,?,?)")
      .bind(userId, data.email.trim().toLowerCase(), displayName, hash, salt, PBKDF2_ITERATIONS).run();
  } catch {
    return json({ error: "Account could not be created. The owner account may already exist." }, 409);
  }
  return createSession(userId, request, env);
}
async function login(request, env) {
  const data = await bodyJson(request);
  if (!data || !validateEmail(data.email) || typeof data.password !== "string") return json({ error: "Email and password are required." }, 400);
  const email = data.email.trim().toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const attempt = await env.DB.prepare("SELECT attempts, window_started_at, locked_until FROM login_attempts WHERE email=?").bind(email).first();
  if (attempt?.locked_until && attempt.locked_until > now) return json({ error: "Too many attempts. Try again later." }, 429);
  const user = await env.DB.prepare("SELECT id,password_hash,password_salt,password_iterations FROM users WHERE email=?").bind(email).first();
  const candidate = user ? await passwordHash(data.password, user.password_salt, user.password_iterations) : await passwordHash(data.password, "00000000000000000000000000000000");
  if (!user || candidate !== user.password_hash) {
    const withinWindow = attempt && now - attempt.window_started_at < 900;
    const attempts = withinWindow ? attempt.attempts + 1 : 1;
    const lockedUntil = attempts >= 8 ? now + 900 : null;
    await env.DB.prepare("INSERT INTO login_attempts(email,attempts,window_started_at,locked_until) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until")
      .bind(email, attempts, withinWindow ? attempt.window_started_at : now, lockedUntil).run();
    return json({ error: "Email or password is incorrect." }, 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE email=?").bind(email).run();
  return createSession(user.id, request, env);
}
async function createSession(userId, request, env) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)")
    .bind(randomId("ses_"), userId, tokenHash, expires).run();
  const user = await env.DB.prepare("SELECT id,email,display_name AS displayName FROM users WHERE id=?").bind(userId).first();
  return json({ user, authenticated: true }, 200, { "set-cookie": cookie("hub_session", token, SESSION_DAYS * 86400) });
}
async function logout(request, env) {
  const token = request.headers.get("Cookie")?.match(/(?:^|;\s*)hub_session=([^;]+)/)?.[1];
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
}
async function api(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "Content-Type,X-Device-Key,X-Device-Id,X-File-Name", "access-control-max-age": "86400" } });
  if (!requireOrigin(request, env)) return json({ error: "Origin not allowed." }, 403);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, service: "My Private Cloud Hub API", database: "bound", storage: env.BUCKET ? "bound" : "not-configured" });
  if (request.method === "POST" && url.pathname === "/api/auth/register") return register(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/logout") return logout(request, env);

  const user = await requireAuth(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (request.method === "GET" && url.pathname === "/api/auth/me") return json({ user, authenticated: true });

  if (request.method === "GET" && url.pathname === "/api/devices") {
    const { results } = await env.DB.prepare("SELECT id,device_key AS deviceKey,name,device_type AS type,platform,created_at AS createdAt,last_seen_at AS lastSeenAt FROM devices WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC").bind(user.id).all();
    return json({ devices: results });
  }
  if (request.method === "POST" && url.pathname === "/api/devices/register") {
    const data = await bodyJson(request);
    const deviceKey = String(data?.deviceKey || "").slice(0, 100);
    const name = String(data?.name || "").trim().slice(0, 80);
    const type = String(data?.type || "").trim().slice(0, 40);
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(deviceKey) || !name || !type) return json({ error: "Valid device key, name and type are required." }, 400);
    const id = randomId("dev_");
    await env.DB.prepare("INSERT INTO devices(id,user_id,device_key,name,device_type,platform,user_agent) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,device_key) DO UPDATE SET name=excluded.name,device_type=excluded.device_type,platform=excluded.platform,user_agent=excluded.user_agent,last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revoked_at=NULL")
      .bind(id, user.id, deviceKey, name, type, String(data.platform || "").slice(0, 80), request.headers.get("User-Agent") || "").run();
    const device = await env.DB.prepare("SELECT id,device_key AS deviceKey,name,device_type AS type,platform,created_at AS createdAt,last_seen_at AS lastSeenAt FROM devices WHERE user_id=? AND device_key=? AND revoked_at IS NULL").bind(user.id, deviceKey).first();
    return json({ device, registered: true }, 201);
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/devices/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const result = await env.DB.prepare("UPDATE devices SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL").bind(new Date().toISOString(), id, user.id).run();
    return json({ revoked: result.meta.changes > 0 });
  }
  if (request.method === "GET" && url.pathname === "/api/files") {
    const { results } = await env.DB.prepare("SELECT id,device_id AS deviceId,file_name AS name,content_type AS contentType,size_bytes AS sizeBytes,created_at AS createdAt FROM files WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
    return json({ files: results });
  }
  if (request.method === "PUT" && url.pathname === "/api/files/upload") {
    if (!env.BUCKET) return json({ error: "R2 bucket binding is not configured." }, 503);
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > MAX_UPLOAD_BYTES) return json({ error: "File exceeds the 100 MB per-request limit." }, 413);
    const fileName = safeName(decodeURIComponent(request.headers.get("X-File-Name") || "upload.bin"));
    const contentType = request.headers.get("Content-Type") || "application/octet-stream";
    const deviceId = request.headers.get("X-Device-Id") || null;
    if (deviceId) {
      const owned = await env.DB.prepare("SELECT id FROM devices WHERE id=? AND user_id=? AND revoked_at IS NULL").bind(deviceId, user.id).first();
      if (!owned) return json({ error: "Device does not belong to this account." }, 403);
    }
    const id = randomId("file_");
    const objectKey = `${user.id}/${id}/${fileName}`;
    const object = await env.BUCKET.put(objectKey, request.body, { httpMetadata: { contentType } });
    await env.DB.prepare("INSERT INTO files(id,user_id,device_id,object_key,file_name,content_type,size_bytes,etag) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id, user.id, deviceId, objectKey, fileName, contentType, length, object.httpEtag || null).run();
    return json({ file: { id, name: fileName, contentType, sizeBytes: length, etag: object.httpEtag }, uploaded: true }, 201);
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/files/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const row = await env.DB.prepare("SELECT object_key AS objectKey,file_name AS name,content_type AS contentType FROM files WHERE id=? AND user_id=?").bind(id, user.id).first();
    if (!row || !env.BUCKET) return json({ error: "File not found." }, 404);
    const object = await env.BUCKET.get(row.objectKey);
    if (!object) return json({ error: "Stored object not found." }, 404);
    return new Response(object.body, { headers: { "content-type": row.contentType, "content-disposition": `attachment; filename="${row.name}"`, "cache-control": "private, no-store" } });
  }
  return json({ error: "Not found." }, 404);
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await api(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: "Internal server error." }, 500);
    }
  }
};
