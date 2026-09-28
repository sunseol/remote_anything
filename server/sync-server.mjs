#!/usr/bin/env node
// Remote Anything: remote session bridge for Aside (unofficial, not affiliated with Aside).
//
// Read side: tails each session's native messages.jsonl (full envelopes, unmodified).
// Write side: messages go through Aside surfaces (MCP exec / CLI session queue|stop).
// Creating a session or project from the phone also writes a few rows to the local
// Aside state.db (sessions.ephemeral/project_id, projects).
// Auth: 6-digit pairing code shown in this terminal -> short-lived cookie.
// No daemon tokens are extracted.

import { spawn } from 'node:child_process';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { watch } from 'node:fs';

for (const [signal, label] of [['uncaughtException', 'uncaughtException'], ['unhandledRejection', 'unhandledRejection']]) {
  process.on(signal, (err) => {
    console.error('[' + new Date().toISOString() + '] fatal ' + label + ':', err?.stack ?? err);
    process.exit(1);
  });
}
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    console.error('[' + new Date().toISOString() + '] received ' + sig + '; exiting');
    process.exit(0);
  });
}
import { open as openFile, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir, networkInterfaces } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const PORT = Number(argValue('--port', '8787'));
const HOST = argValue('--host', '127.0.0.1');
const SESSION_ID_RE = /^[A-Za-z0-9_-]{6,160}$/;
const MAX_BODY_BYTES = 64 * 1024;
const COOKIE_TTL_MS = 24 * 60 * 60 * 1000;
const TERMINAL_STATES = new Set(['interrupted', 'aborted', 'errored']);
const HISTORY_MAX_BYTES = 96 * 1024;
const ASIDE_BIN_OVERRIDE = argValue('--aside', '');

// Windows 포팅: aside 실행파일 해석. 기본은 PATH의 aside이고, Windows에서는 PATH에
// 없을 때 per-user 설치 위치(%LOCALAPPDATA%\Aside\CLI\current)로 폴백한다.
let asideBinCache;
function asideBin() {
  if (ASIDE_BIN_OVERRIDE) return ASIDE_BIN_OVERRIDE;
  if (asideBinCache) return asideBinCache;
  if (process.platform === 'win32') {
    const local = join(process.env.LOCALAPPDATA ?? '', 'Aside', 'CLI', 'current', 'aside.exe');
    if (local && existsSync(local)) {
      asideBinCache = local;
      return local;
    }
  }
  asideBinCache = 'aside';
  return asideBinCache;
}

function spawnAside(childArgs, opts = {}) {
  // windowsHide: 예약 작업·백그라운드 실행에서 자식 콘솔 창이 깜빡이지 않게 한다.
  return spawn(asideBin(), childArgs, { windowsHide: true, ...opts });
}

class AsideMcp {
  #child;
  #pending = new Map();
  #sequence = 0;
  #buffer = '';
  #closed = false;
  #failure;

  constructor() {
    this.#child = spawnAside(['mcp', '--host', 'local'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.#child.stdout.setEncoding('utf8');
    this.#child.stdout.on('data', (chunk) => {
      this.#buffer += chunk;
      while (this.#buffer.includes('\n')) {
        const end = this.#buffer.indexOf('\n');
        const line = this.#buffer.slice(0, end);
        this.#buffer = this.#buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id !== undefined) {
            const pending = this.#pending.get(message.id);
            if (!pending) continue;
            this.#pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
            else pending.resolve(message.result);
          }
        } catch (error) {
          this.#fail(error);
        }
      }
    });
    this.#child.stderr.resume();
    this.#child.stdin.on('error', () => {});
    this.#child.on('error', (error) => this.#fail(error));
    this.#child.on('exit', (code, signal) => this.#fail(new Error('`Aside MCP exited (${code ?? signal})`')));
  }

  #fail(error) {
    if (this.#failure) return;
    this.#failure = error;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #send(message) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async initialize() {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'remote-anything', version: '0.1.0' },
    }, 15_000);
    this.#send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  request(method, params = {}, timeoutMs = 30_000) {
    if (this.#closed || this.#failure) return Promise.reject(this.#failure ?? new Error('MCP closed'));
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error('`Timed out: ${method}`'));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#send({ jsonrpc: '2.0', id, method, params });
    });
  }

  async replCode(code, timeoutMs = 30_000) {
    const result = await this.request('tools/call', { name: 'repl', arguments: { title: 'remote-anything', code } }, timeoutMs);
    if (result.isError) throw new Error('Aside repl failed');
    const block = (result.content ?? []).find((item) => item.type === 'text');
    if (!block) throw new Error('Aside repl returned no text');
    return block.text;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#fail(this.#failure ?? new Error('closed'));
    this.#child.stdin.end();
    this.#child.kill('SIGTERM');
    const killTimer = setTimeout(() => this.#child.kill('SIGKILL'), 1_000);
    killTimer.unref();
  }
}

let sharedMcp;
async function withMcp(fn) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (!sharedMcp) {
        sharedMcp = new AsideMcp();
        await sharedMcp.initialize();
      }
      return await fn(sharedMcp);
    } catch (error) {
      sharedMcp?.close();
      sharedMcp = undefined;
      if (attempt === 1) throw error;
      await delay(300);
    }
  }
  throw new Error('unreachable');
}

async function listSessions(mcp) {
  const text = await mcp.replCode(
    'console.log(JSON.stringify(aside.sessions.list().filter(s => s && s.id).map(s => ({id:s.id,title:s.title ?? "",status:s.status ?? "unknown",suspension:s.suspension ?? null,updatedAt:s.updatedAt ?? null,parentId:s.parentId ?? null,projectId:s.projectId ?? null}))));',
  );
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Unexpected sessions.list response');
  return parsed;
}

async function listProjects(mcp) {
  const text = await mcp.replCode(
    'console.log(JSON.stringify((aside.projects && typeof aside.projects.list === \'function\' ? aside.projects.list() : []).filter(p => p && p.id).map(p => ({id:p.id,name:p.name ?? p.id}))));',
  );
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Unexpected projects.list response');
  return parsed;
}

async function getSessionStatus(mcp, sessionId) {
  const text = await mcp.replCode(
    'console.log(JSON.stringify((s => s && ({id:s.id,status:s.status,suspension:s.suspension ?? null,updatedAt:s.updatedAt ?? null}))(aside.sessions.get(' + JSON.stringify(sessionId) + '))));',
  );
  const parsed = JSON.parse(text);
  if (!parsed || parsed.id !== sessionId) throw new Error('Unexpected session status response');
  return parsed;
}

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

async function readModelCatalog(sessionId) {
  const root = join(homedir(), '.aside', 'u');
  const accounts = await readdir(root).catch(() => []);
  for (const account of accounts) {
    const sessionsDir = join(root, account, 'sessions');
    const entries = await readdir(sessionsDir).catch(() => []);
    if (!entries.some((name) => name.endsWith('_' + sessionId))) continue;
    const raw = await readFile(join(root, account, 'models.json'), 'utf8').catch(() => null);
    if (raw === null) break;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { break; }
    const providers = [];
    for (const [provider, info] of Object.entries(parsed.providers ?? {})) {
      let models = [];
      if (Array.isArray(info.models)) {
        models = info.models.map((m) => ({ id: m.id, name: m.name ?? m.id, reasoning: m.reasoning === true, contextWindow: m.contextWindow ?? null, thinkingLevelMap: m.thinkingLevelMap ?? null }));
      } else if (info.accountModelCatalog && Array.isArray(info.accountModelCatalog.modelIds)) {
        models = info.accountModelCatalog.modelIds.map((id) => ({ id, name: id, reasoning: true, contextWindow: null, thinkingLevelMap: null }));
      }
      if (models.length > 0) providers.push({ provider, name: info.name ?? provider, models });
    }
    return { providers };
  }
  return { providers: [] };
}

async function readSessionModel(sessionId) {
  const root = join(homedir(), '.aside', 'u');
  const accounts = await readdir(root).catch(() => []);
  for (const account of accounts) {
    const dbPath = join(root, account, 'state.db');
    const info = await stat(dbPath).catch(() => null);
    if (!info) continue;
    const out = await readSessionModelRow(dbPath, sessionId);
    if (out === undefined) continue;
    if (out === null) return null;
    try { return JSON.parse(out); } catch { return null; }
  }
  return null;
}

async function stateDbPaths() {
  const root = join(homedir(), '.aside', 'u');
  const accounts = await readdir(root).catch(() => []);
  const out = [];
  for (const account of accounts) {
    const dbPath = join(root, account, 'state.db');
    const info = await stat(dbPath).catch(() => null);
    if (info) out.push(dbPath);
  }
  return out;
}

function sqlQuote(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

let nodeSqlite; // undefined = 미확인, null = 모듈 없음(node:sqlite 없는 구형 Node)

// 행 목록 질의. node:sqlite 우선(Windows엔 sqlite3 CLI가 기본 없다), 없으면 CLI -json으로 폴백.
async function queryDb(dbPath, sql) {
  if (nodeSqlite !== null) {
    try {
      nodeSqlite ??= await import('node:sqlite');
      const db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        return db.prepare(sql).all();
      } finally {
        db.close();
      }
    } catch (error) {
      if (nodeSqlite === undefined) {
        nodeSqlite = null; // node:sqlite 없는 Node: sqlite3 CLI 폴백
      } else {
        return []; // DB 잠김·손상: 빈 목록
      }
    }
  }
  return new Promise((resolve) => {
    const child = spawn('sqlite3', ['-json', dbPath, sql], { windowsHide: true });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk.toString(); });
    child.on('exit', () => { try { resolve(JSON.parse(text || '[]')); } catch { resolve([]); } });
    child.on('error', () => resolve([]));
  });
}

// 쓰기 질의. 성공하면 true, 실패(제약 위반·잠김·손상)하면 false. queryDb는 읽기 전용으로 열기 때문에
// 쓰기는 반드시 이 함수를 거친다.
async function execDb(dbPath, sql) {
  if (nodeSqlite !== null) {
    try {
      nodeSqlite ??= await import('node:sqlite');
      const db = new nodeSqlite.DatabaseSync(dbPath);
      try {
        db.exec(sql);
        return true;
      } finally {
        db.close();
      }
    } catch (error) {
      if (nodeSqlite === undefined) {
        nodeSqlite = null; // node:sqlite 없는 Node: sqlite3 CLI 폴백
      } else {
        return false;
      }
    }
  }
  return new Promise((resolve) => {
    const child = spawn('sqlite3', ['-bail', dbPath, sql], { windowsHide: true });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function listAllSessions(mcp) {
  const live = await listSessions(mcp);
  const byId = new Map(live.map((s) => [s.id, s]));
  for (const dbPath of await stateDbPaths()) {
    const rows = await queryDb(dbPath, 'SELECT id, title, status, project_id, updated_at FROM sessions');
    for (const row of rows) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        id: row.id,
        title: row.title ?? '',
        status: row.status ?? 'idle',
        suspension: null,
        updatedAt: row.updated_at ? row.updated_at * 1000 : null,
        parentId: null,
        projectId: row.project_id ?? null,
      });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const av = a.updatedAt ? Date.parse(a.updatedAt) || a.updatedAt : 0;
    const bv = b.updatedAt ? Date.parse(b.updatedAt) || b.updatedAt : 0;
    return bv - av;
  });
}

// 세션 모델 행을 읽는다. 반환값: 모델 JSON 문자열 | null(행 없음) | undefined(DB를 못 읽음).
// node:sqlite를 먼저 쓰는 이유: Windows에는 sqlite3 CLI가 기본 설치돼 있지 않다.
// node:sqlite가 없는 구형 Node에서는 기존대로 sqlite3 CLI로 폴백한다(macOS 경로).
async function readSessionModelRow(dbPath, sessionId) {
  if (nodeSqlite !== null) {
    try {
      nodeSqlite ??= await import('node:sqlite');
      const db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare('SELECT model FROM sessions WHERE id = ?').get(sessionId);
        return row ? (row.model ?? null) : null;
      } finally {
        db.close();
      }
    } catch (error) {
      if (nodeSqlite === undefined) {
        nodeSqlite = null; // node:sqlite 없는 Node: sqlite3 CLI 폴백
      } else {
        return undefined; // DB 잠김·손상: 다음 계정으로
      }
    }
  }
  return new Promise((resolve) => {
    const child = spawn('sqlite3', [dbPath, "SELECT model FROM sessions WHERE id='" + sessionId + "';"], { windowsHide: true });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk.toString(); });
    child.on('exit', () => resolve(text.trim() || undefined));
    child.on('error', () => resolve(undefined));
  });
}

async function listSubagents(filePath) {
  const info = await stat(filePath).catch(() => null);
  if (!info) return [];
  const handle = await openFile(filePath, 'r');
  try {
    const size = info.size;
    const start = Math.max(0, size - 8 * 1024 * 1024);
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    const text = buf.toString('utf8');
    const lines = text.split('\n');
    if (start > 0) lines.shift();
    const envelopes = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try { envelopes.push(JSON.parse(line)); } catch {}
    }
    const resultByTask = new Map();
    for (const env of envelopes) {
      if (env.role === 'system-message' && typeof env.content === 'string') {
        const match = env.content.match(/^Subagent (\S+) is done \(([^)]*)\)\n?<result>\n?([\s\S]*?)(?:\n?<\/result>|$)/);
        if (match) { const raw = match[2].trim(); const sm = raw.match(/status:\s*([^,]+)/); const progress = raw.match(/(\d+\/\d+)/); resultByTask.set(match[1], { status: sm ? sm[1].trim() : raw, progress: progress ? progress[1] : null, result: match[3].trim() }); }
      }
    }
    const taskByCall = new Map();
    for (const env of envelopes) {
      if (env.role === 'toolResult' && env.toolName === 'subagent' && env.details && env.details.taskId) {
        taskByCall.set(env.toolCallId, env.details.taskId);
      }
    }
    const agents = [];
    const seenTasks = new Set();
    for (const env of envelopes) {
      if (env.role !== 'assistant' || !Array.isArray(env.content)) continue;
      for (const block of env.content) {
        if (block.type !== 'toolCall' || block.name !== 'subagent') continue;
        const args = block.arguments ?? {};
        if (args.action !== 'spawn') continue;
        const taskId = taskByCall.get(block.id) ?? null;
        const outcome = taskId ? resultByTask.get(taskId) ?? null : null;
        agents.push({
          taskId,
          description: typeof args.description === 'string' ? args.description : '',
          prompt: typeof args.prompt === 'string' ? args.prompt : '',
          profile: typeof args.subagent_profile === 'string' ? args.subagent_profile : '',
          modelCategory: typeof args.model_category === 'string' ? args.model_category : '',
          runInBackground: args.run_in_background === true,
          status: outcome ? outcome.status : (taskId ? 'running' : 'unknown'),
          progress: outcome ? outcome.progress ?? null : null,
          result: outcome ? outcome.result : null,
        });
        if (taskId) seenTasks.add(taskId);
      }
    }
    return agents;
  } finally {
    await handle.close();
  }
}

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

// 마크다운 산출물 링크(file://, 절대경로, artifacts/... 상대경로)를 세션/프로젝트 워크스페이스에서 해석한다.
// 모든 후보는 ~/.aside/u 안으로 jail-check하며, 못 찾으면 null.
// 세션의 작업 폴더(state.db sessions.cwd)를 조회한다. 없으면 null.
async function readSessionCwd(sessionId) {
  const root = join(homedir(), '.aside', 'u');
  const accounts = await readdir(root).catch(() => []);
  for (const account of accounts) {
    const dbPath = join(root, account, 'state.db');
    const info = await stat(dbPath).catch(() => null);
    if (!info) continue;
    try {
      nodeSqlite ??= await import('node:sqlite');
      const db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare('SELECT cwd FROM sessions WHERE id = ?').get(sessionId);
        if (row && typeof row.cwd === 'string' && row.cwd.trim()) return row.cwd.trim();
      } finally {
        db.close();
      }
    } catch { /* 다음 계정 */ }
  }
  return null;
}

async function resolveStoredFilePath(rawPath, rawSessionId) {
  const sessionInput = String(rawSessionId ?? '').trim();
  // Reserved directory-name form: YYYY-MM-DD_<id>.
  const sessionId = sessionInput.replace(/^\d{4}-\d{2}-\d{2}_(?=[A-Za-z0-9_-]{6,160}$)/, '');
  const attempts = [];
  let firstMissing;
  let candidate = String(rawPath ?? '');
  const fail = (result) => {
    console.warn(JSON.stringify({
      event: 'api_file_resolution_failed', session: sessionInput,
      normalizedSession: sessionId, requestedPath: String(rawPath ?? ''),
      candidate, result, attempts,
    }));
    return result;
  };
  const under = (child, root) => {
    const rel = relative(root, child);
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
  };
  const missing = (error) => ['ENOENT', 'ENOTDIR'].includes(error.code);
  const existingReal = async (path) => {
    try { return await realpath(path); }
    catch (error) { if (missing(error)) return null; throw error; }
  };
  try {
    if (sessionId && !SESSION_ID_RE.test(sessionId)) {
      return fail({ status: 400, error: 'Invalid session ID' });
    }
    if (!candidate || candidate.includes('\0')) {
      return fail({ status: 400, error: 'Invalid path' });
    }
    if (/^file:/i.test(candidate)) {
      try { candidate = fileURLToPath(candidate); }
      catch { return fail({ status: 400, error: 'Invalid file URL' }); }
    }
    // searchParams.get already decoded the query. Do not decodeURIComponent again.
    candidate = candidate.replace(/\\/g, '/').normalize('NFC');
    if (/^\/[A-Za-z]:\//.test(candidate)) candidate = candidate.slice(1);
    if (/^[A-Za-z]:(?!\/)/.test(candidate)) {
      return fail({ status: 400, error: 'Drive-relative path is not supported' });
    }
    // Journal links can arrive percent-encoded (the client re-encodes an
    // already-encoded href). Try the literal form first, then the decoded one.
    const candidates = [candidate];
    if (candidate.includes('%')) {
      try {
        const decoded = decodeURIComponent(candidate).normalize('NFC');
        if (decoded !== candidate && decoded !== '' && !decoded.includes('\0')) candidates.push(decoded);
      } catch { /* malformed escape: keep the literal form */ }
    }
    const storageRoot = join(homedir(), '.aside', 'u');
    const sessionCwd = sessionId ? await readSessionCwd(sessionId) : null;
    const lexicalRoots = [storageRoot, sessionCwd].filter(Boolean).map(p => resolve(p));
    const realRoots = (await Promise.all(lexicalRoots.map(existingReal))).filter(Boolean);
    const allowedLexically = p => [...lexicalRoots, ...realRoots].some(r => under(p, r));
    const allowedReally = p => realRoots.some(r => under(p, r));
    const tried = new Set();
    const tryPath = async (absolute) => {
      if (tried.has(absolute)) return null;
      tried.add(absolute);
      const attempt = { path: absolute, outcome: 'outside' };
      attempts.push(attempt);
      if (!allowedLexically(absolute)) return null;
      try {
        const real = await realpath(absolute);
        if (!allowedReally(real)) { attempt.outcome = 'outside-realpath'; return null; }
        if (!(await stat(real)).isFile()) { attempt.outcome = 'not-file'; return null; }
        attempt.outcome = 'found';
        return { path: real };
      } catch (error) {
        attempt.outcome = error.code ?? 'error';
        if (!missing(error)) throw error;
        firstMissing ??= absolute;
        return null; // A miss must never terminate the search.
      }
    };
    const notFound = () => fail(firstMissing || attempts.some(a => a.outcome === 'not-file')
      ? { missing: true, path: firstMissing ?? attempts.find(a => a.outcome === 'not-file').path }
      : { outside: true });
    for (const cand of candidates) {
      if (isAbsolute(cand)) {
        const absHit = await tryPath(resolve(cand));
        if (absHit) return absHit;
        continue;
      }
      const sessionFile = sessionId ? await findSessionFile(sessionId) : null;
      const bases = [sessionFile && dirname(sessionFile), sessionCwd].filter(Boolean);
      for (const base of bases) {
        const hit = await tryPath(resolve(base, cand));
        if (hit) return hit;
      }
    }

    // No recursive file walk. Enumerate only accounts and immediate directories.
    // Check the directory's real path BEFORE reading it (junction/symlink jail).
    const childDirs = async (parent) => {
      try {
        const real = await realpath(parent);
        if (!allowedReally(real)) return [];
        return (await readdir(real, { withFileTypes: true }))
          .filter(e => e.isDirectory()).map(e => join(real, e.name)).sort();
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
    };
    // Cross-workspace fallback must not reinterpret a parent traversal.
    const matches = new Map();
    for (const cand of candidates) {
      if (cand.split('/').includes('..')) continue;
      const baseRoots = [];
      for (const account of await childDirs(storageRoot)) {
        for (const kind of ['projects', 'sessions']) baseRoots.push(join(account, kind));
        // aside mirrors agent sessions under agents/<agent>/sessions too.
        for (const agent of await childDirs(join(account, 'agents'))) {
          for (const group of await childDirs(agent)) baseRoots.push(group);
        }
      }
      for (const groupRoot of baseRoots) {
        for (const base of await childDirs(groupRoot)) {
          const absolute = resolve(base, cand);
          if (!under(absolute, base)) continue;
          const hit = await tryPath(absolute);
          if (!hit) continue;
          // The same session may be mirrored in several trees (sessions vs
          // agents/...). That is one file, not an ambiguity: keep the first.
          const baseLeaf = base.split(sep).pop();
          if ([...matches.values()].some((m) => m.baseLeaf === baseLeaf)) continue;
          matches.set(hit.path, { ...hit, baseLeaf });
          if (matches.size > 1) {
            return fail({ status: 409, error: 'Ambiguous file path', matches: [...matches.keys()] });
          }
        }
      }
    }
    if (matches.size === 1) {
      const only = matches.values().next().value;
      return { path: only.path };
    }
    if (attempts.length === 0) return fail({ outside: true });
    return fail({ missing: true, path: firstMissing ?? candidate });
  } catch (error) {
    return fail({ status: 500, error: 'File resolution failed', code: error.code ?? 'UNKNOWN' });
  }
}

async function findSessionFile(sessionId) {
  if (!SESSION_ID_RE.test(sessionId)) throw new Error('Invalid session ID');
  const root = join(homedir(), '.aside', 'u');
  const accounts = await readdir(root).catch(() => []);
  for (const account of accounts) {
    const sessionsDir = join(root, account, 'sessions');
    const entries = await readdir(sessionsDir).catch(() => []);
    const match = entries.find((name) => name.endsWith('_' + sessionId));
    if (match) return join(sessionsDir, match, 'messages.jsonl');
  }
  return null;
}

async function readNewLines(filePath, fromBytes) {
  const info = await stat(filePath).catch(() => null);
  if (!info) return { gap: fromBytes > 0, bytes: fromBytes, lines: [] };
  if (info.size < fromBytes) return { gap: true, bytes: 0, lines: [] };
  if (info.size === fromBytes) return { gap: false, bytes: fromBytes, lines: [] };
  const handle = await openFile(filePath, 'r');
  try {
    const length = info.size - fromBytes;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, fromBytes);
    const text = buffer.toString('utf8');
    const complete = text.endsWith('\n');
    const usable = complete ? text : text.slice(0, text.lastIndexOf('\n') + 1);
    const lines = usable.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return { role: 'unreadable', raw: line.slice(0, 400) }; }
    });
    return { gap: false, bytes: fromBytes + Buffer.byteLength(usable), lines };
  } finally {
    await handle.close();
  }
}

async function readRange(filePath, start, end) {
  const handle = await openFile(filePath, 'r');
  try {
    const length = end - start;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer.toString('utf8').split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return { role: 'unreadable', raw: line.slice(0, 400) }; }
    });
  } finally {
    await handle.close();
  }
}

async function historyChunk(filePath, beforeBytes, maxBytes) {
  const info = await stat(filePath).catch(() => null);
  if (!info) return { lines: [], headBytes: 0, hasMore: false, endBytes: 0 };
  let end = Number.isSafeInteger(beforeBytes) && beforeBytes > 0 ? Math.min(beforeBytes, info.size) : info.size;
  if (end <= 0) return { lines: [], headBytes: 0, hasMore: false, endBytes: end };
  let start = Math.max(0, end - maxBytes);
  const handle = await openFile(filePath, 'r');
  try {
    const probe = Buffer.alloc(1);
    while (start > 0) {
      await handle.read(probe, 0, 1, start - 1);
      if (probe[0] === 0x0a) break;
      start -= 1;
    }
    while (end === info.size && end > start) {
      await handle.read(probe, 0, 1, end - 1);
      if (probe[0] === 0x0a) break;
      end -= 1;
    }
  } finally {
    await handle.close();
  }
  const lines = start < end ? await readRange(filePath, start, end) : [];
  return { lines, headBytes: start, hasMore: start > 0, endBytes: end };
}

const inFlight = new Set();

async function runPrompt(sessionId, prompt) {
  const client = new AsideMcp();
  let stopped = false;
  try {
    await client.initialize();
    const status = await getSessionStatus(client, sessionId);
    if (status.status === 'running' || status.status === 'suspended') {
      throw new Error('Session became busy; message was not sent');
    }
    const monitor = (async () => {
      let sawRunning = false;
      while (!stopped) {
        await delay(800);
        if (stopped) return;
        const current = await getSessionStatus(client, sessionId).catch(() => null);
        if (!current) continue;
        if (current.status === 'running') sawRunning = true;
        if (current.status === 'suspended') throw new Error('Session suspended; resolve it in the Aside app');
        if ((current.status !== status.status || current.updatedAt !== status.updatedAt || sawRunning)
          && TERMINAL_STATES.has(current.status)) {
          throw new Error('`Session became ${current.status}`');
        }
      }
    })();
    await Promise.race([
      client.request('tools/call', { name: 'exec', arguments: { session_id: sessionId, prompt } }, 20 * 60_000),
      monitor,
    ]);
  } finally {
    stopped = true;
    client.close();
  }
}

function runAsideCli(cliArgs, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawnAside(cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.resume();
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('aside ' + cliArgs.join(' ') + ' timed out')); }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, output: output.trim() });
      else reject(new Error('aside ' + cliArgs.join(' ') + ' failed (' + code + ')'));
    });
  });
}

async function sendRemoteMessage(sessionId, text) {
  if (!SESSION_ID_RE.test(sessionId)) throw new Error('Invalid session ID');
  const prompt = String(text ?? '').trim();
  if (!prompt || prompt.length > 8000) throw new Error('Message must be 1-8000 characters');
  if (inFlight.has(sessionId)) {
    await runAsideCli(['session', 'queue', sessionId, prompt]);
    return { mode: 'queued' };
  }
  const status = await withMcp((mcp) => getSessionStatus(mcp, sessionId));
  if (status.status === 'suspended') throw new Error('Session is suspended; resolve it in the Aside app first');
  if (status.status === 'running') {
    await runAsideCli(['session', 'queue', sessionId, prompt]);
    return { mode: 'queued' };
  }
  inFlight.add(sessionId);
  runPrompt(sessionId, prompt)
    .catch((error) => broadcast(sessionId, { type: 'sendError', error: String(error.message ?? error) }))
    .finally(() => inFlight.delete(sessionId));
  return { mode: 'run' };
}

const pairingCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
// 무차별 대입 방어: IP당 분당 5회, 그리고 연속 실패가 PAIR_MAX_FAILURES에 닿으면 재시작 전까지
// 페어링을 잠근다. 한 번 실행되는 동안 맞힐 확률은 최대 20/1,000,000이다. 이미 페어링된 기기는 영향 없다.
const PAIR_WINDOW_MS = 60_000;
const PAIR_PER_IP_LIMIT = 5;
const PAIR_MAX_FAILURES = 20;
const pairAttemptsByIp = new Map();
let pairFailures = 0;
function pairCodeMatches(input) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(pairingCode);
  return a.length === b.length && timingSafeEqual(a, b);
}
const COOKIE_STORE_PATH = join(homedir(), '.remote-anything-cookies.json');
const cookies = new Map();
try {
  const stored = JSON.parse(await readFile(COOKIE_STORE_PATH, 'utf8'));
  for (const [sid, issuedAt] of Object.entries(stored)) {
    if (typeof issuedAt === 'number' && Date.now() - issuedAt <= COOKIE_TTL_MS) cookies.set(sid, { issuedAt });
  }
} catch { }
function persistCookies() {
  writeFile(COOKIE_STORE_PATH, JSON.stringify(Object.fromEntries(cookies))).catch(() => { });
}

function cookiesFromRequest(req) {
  const header = req.headers.cookie ?? '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  const sid = cookiesFromRequest(req).asideRemote;
  const entry = sid ? cookies.get(sid) : null;
  if (!entry) return false;
  if (Date.now() - entry.issuedAt > COOKIE_TTL_MS) {
    cookies.delete(sid);
    return false;
  }
  return true;
}

const sseClients = new Set();
function broadcast(sessionId, payload) {
  for (const client of sseClients) {
    if (client.sessionId === sessionId) client.push(payload);
  }
}

const APP_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Remote Anything</title>
<style>
:root{color-scheme:dark;--bg:#0d1117;--panel:#161b22;--line:#21262d;--text:#e6edf3;--dim:#8b949e;--accent:#4c8dff;--user:#1f6feb;--warn:#d29922}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;height:100dvh;display:flex;flex-direction:column}
header{padding:10px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;background:var(--panel)}
header h1{font-size:16px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip{font-size:11px;padding:2px 8px;border-radius:99px;background:var(--line);color:var(--dim)}
.chip.running{background:#238636;color:#fff}.chip.suspended{background:var(--warn);color:#000}
button{font:inherit;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:8px;padding:8px 14px;cursor:pointer}
button.primary{background:var(--user);border-color:var(--user);color:#fff}
button:disabled{opacity:.5}
#back{border:none;background:none;color:var(--accent);font-size:14px;padding:4px}
#view{flex:1;overflow-y:auto;padding:14px 12px 8px;display:flex;flex-direction:column;gap:8px}
.row{display:flex}.row.user{justify-content:flex-end}
.bubble{max-width:86%;padding:8px 12px;border-radius:14px;background:var(--panel);border:1px solid var(--line);white-space:pre-wrap;word-break:break-word}
.row.user .bubble{background:var(--user);border-color:var(--user)}
.divider{text-align:center;color:var(--dim);font-size:11px;margin:4px 0}
.sysmsg{color:var(--dim);font-size:12px;background:var(--panel);border-radius:8px;padding:6px 10px}
details{margin-top:6px}.summary{color:var(--dim);font-size:12px;cursor:pointer}
details pre{font-size:12px;color:var(--dim);white-space:pre-wrap;background:#0a0d12;border-radius:8px;padding:8px;margin-top:4px;max-height:200px;overflow:auto}
.raw{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--dim);background:#0a0d12;border-radius:8px;padding:8px;white-space:pre-wrap;max-height:220px;overflow:auto}
#pendingBar{display:none;padding:6px 14px;font-size:12px;color:var(--warn);background:var(--panel);border-top:1px solid var(--line)}
#conn{padding:4px 14px;font-size:11px;color:var(--dim);background:var(--panel);border-top:1px solid var(--line)}
#composer{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--panel)}
#text{flex:1;background:#0a0d12;border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px 12px;font:inherit;resize:none;height:44px}
.list{display:flex;flex-direction:column;gap:8px;padding:14px 12px;overflow-y:auto;flex:1}
.item{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:4px;cursor:pointer}
.item .title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .meta{font-size:12px;color:var(--dim);display:flex;gap:8px;align-items:center}
.pair-box{margin:auto;text-align:center;display:flex;flex-direction:column;gap:14px;padding:24px}
.pair-box input{font:28px ui-monospace,monospace;letter-spacing:8px;text-align:center;background:#0a0d12;border:1px solid var(--line);border-radius:12px;color:var(--text);padding:10px;width:220px}
</style></head><body>
<header><button id="back" hidden>&larr;</button><h1 id="title">Remote Anything</h1><span class="chip" id="status"></span></header>
<div class="pair-box" id="pairBox" hidden>
  <div id="pairPrompt"></div>
  <input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
  <button class="primary" id="pairBtn"></button>
  <div id="pairMsg" style="color:var(--dim);font-size:13px"></div>
</div>
<div class="list" id="list"></div>
<div id="view" hidden></div>
<div id="pendingBar"></div>
<div id="conn"></div>
<div id="composer" hidden>
  <textarea id="text"></textarea>
  <button class="primary" id="send"></button>
  <button id="stop" hidden></button>
</div>
<script>
const $=function(id){return document.getElementById(id)};
const KO=(navigator.languages||[navigator.language]).some(function(l){return /^ko/i.test(l||'')});
const L=KO?{pairPrompt:'서버 터미널에 표시된 페어링 코드를 입력하세요.',connect:'연결',placeholder:'메시지 입력...',send:'전송',stop:'중지',badCode:'코드가 올바르지 않습니다',noSessions:'세션이 없습니다',attachment:'(첨부 메시지)',thinking:'사고 과정',runningBar:'세션 실행 중 — 새 메시지는 대기열에 추가됩니다',connecting:'연결 중...',live:'실시간 연결됨',retrying:'연결 끊김 — 재시도 중...',sendError:'전송 오류: ',stopRequested:'중지 요청됨',stopError:'중지 오류: ',queued:'대기열에 추가됨',sent:'전송됨 — 응답 대기 중',listError:'목록 오류: '}
:{pairPrompt:'Enter the pairing code shown in the server terminal.',connect:'Connect',placeholder:'Message...',send:'Send',stop:'Stop',badCode:'Invalid code',noSessions:'No sessions',attachment:'(attachment)',thinking:'Thinking',runningBar:'Session running — new messages will be queued',connecting:'Connecting...',live:'Live',retrying:'Disconnected — retrying...',sendError:'Send failed: ',stopRequested:'Stop requested',stopError:'Stop failed: ',queued:'Queued',sent:'Sent — waiting for reply',listError:'Couldn\'t load sessions: '};
document.documentElement.lang=KO?'ko':'en';
$('pairPrompt').textContent=L.pairPrompt;$('pairBtn').textContent=L.connect;$('text').placeholder=L.placeholder;$('send').textContent=L.send;$('stop').textContent=L.stop;
let sessionId=null, offset=0, es=null, connTimer=null, statusTimer=null, lastStatus='idle';
function conn(t){$('conn').textContent=t}
async function api(path,opts){const r=await fetch(path,Object.assign({headers:{'content-type':'application/json'}},opts||{}));if(r.status===401){showPair();throw new Error('unauthorized')}const b=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(b.error||('HTTP '+r.status));return b}
function showPair(){$('pairBox').hidden=false;$('list').hidden=true;$('view').hidden=true;$('composer').hidden=true}
async function pair(){const code=$('code').value.replace(/\D/g,'');$('pairMsg').textContent='';try{await api('/api/pair',{method:'POST',body:JSON.stringify({code:code})});$('pairBox').hidden=true;loadList().catch(function(){})}catch(e){$('pairMsg').textContent=L.badCode}}
$('pairBtn').onclick=pair;$('code').onkeydown=function(e){if(e.key==='Enter')pair()};
async function loadList(){const b=await api('/api/session');$('title').textContent='Remote Anything';$('status').textContent='';$('list').hidden=false;$('view').hidden=true;$('composer').hidden=true;$('back').hidden=true;const el=$('list');el.innerHTML='';if(!b.sessions.length){el.textContent=L.noSessions;return}for(const s of b.sessions){const d=document.createElement('div');d.className='item';const t=document.createElement('div');t.className='title';t.textContent=s.title||s.id;const m=document.createElement('div');m.className='meta';const c=document.createElement('span');c.className='chip '+s.status;c.textContent=s.status;const when=document.createElement('span');when.textContent=new Date(s.updatedAt||Date.now()).toLocaleString();m.append(c,when);d.append(t,m);d.onclick=function(){openSession(s.id,s.title)};el.append(d)}}
function renderLine(el,l){
  const role=l.role;
  if(role==='turn-lifecycle'){const d=document.createElement('div');d.className='divider';d.textContent='— turn '+l.event+' —';el.append(d);return}
  if(role==='user'){let text='';if(typeof l.content==='string')text=l.content;else if(Array.isArray(l.content))text=l.content.filter(function(c){return c.type==='text'}).map(function(c){return c.text}).join('\n');const w=document.createElement('div');w.className='row user';const b=document.createElement('div');b.className='bubble';b.textContent=text||L.attachment;w.append(b);el.append(w);return}
  if(role==='assistant'){const w=document.createElement('div');w.className='row';const b=document.createElement('div');b.className='bubble';if(Array.isArray(l.content)){for(const c of l.content){if(c.type==='text'&&c.text){const t=document.createElement('div');t.textContent=c.text;b.append(t)}else if(c.type==='thinking'&&c.thinking){const d=document.createElement('details');const s=document.createElement('summary');s.className='summary';s.textContent=L.thinking;const p=document.createElement('pre');p.textContent=c.thinking;d.append(s,p);b.append(d)}else{const p=document.createElement('pre');p.textContent='['+c.type+'] '+JSON.stringify(c).slice(0,300);b.append(p)}}}else{b.textContent=JSON.stringify(l).slice(0,500)}w.append(b);el.append(w);return}
  if(role==='system-message'){const d=document.createElement('div');d.className='sysmsg';d.textContent=(l.kind?('['+l.kind+'] '):'')+(typeof l.content==='string'?l.content:JSON.stringify(l.content));el.append(d);return}
  const d=document.createElement('div');d.className='raw';d.textContent=JSON.stringify(l,null,1).slice(0,1200);el.append(d);
}
function setStatusBar(s){lastStatus=s;$('status').textContent=s;$('status').className='chip '+s;$('stop').hidden=(s!=='running'&&s!=='suspended');$('pendingBar').style.display=(s==='running')?'block':'none';$('pendingBar').textContent=(s==='running')?L.runningBar:''}
function scrollBottom(){$('view').scrollTop=$('view').scrollHeight}
function connectStream(){
  if(!sessionId)return;if(es)es.close();conn(L.connecting);
  es=new EventSource('/api/events?session='+encodeURIComponent(sessionId)+'&from='+offset);
  es.onopen=function(){conn(L.live)};
  es.onerror=function(){conn(L.retrying);if(es)es.close();clearTimeout(connTimer);connTimer=setTimeout(connectStream,1200)};
  es.onmessage=function(ev){const msg=JSON.parse(ev.data);
    if(msg.type==='snapshot'){offset=msg.bytes;$('view').innerHTML='';for(const l of msg.lines)renderLine($('view'),l);scrollBottom()}
    else if(msg.type==='append'){offset=msg.bytes;for(const l of msg.lines)renderLine($('view'),l);scrollBottom()}
    else if(msg.type==='resync'){offset=0;connectStream()}
    else if(msg.type==='status'){setStatusBar(msg.status)}
    else if(msg.type==='sendError'){conn(L.sendError+msg.error)}
  };
}
async function pollStatus(){if(!sessionId)return;try{const b=await api('/api/status?session='+encodeURIComponent(sessionId));setStatusBar(b.status)}catch(e){}}
async function openSession(id,title){sessionId=id;offset=0;$('list').hidden=true;$('view').hidden=false;$('view').innerHTML='';$('composer').hidden=false;$('back').hidden=false;$('title').textContent=title||id;connectStream();pollStatus();clearInterval(statusTimer);statusTimer=setInterval(pollStatus,2500)}
$('back').onclick=function(){sessionId=null;if(es)es.close();clearInterval(statusTimer);loadList().catch(function(){})};
$('stop').onclick=async function(){try{await api('/api/stop',{method:'POST',body:JSON.stringify({session:sessionId})});conn(L.stopRequested)}catch(e){conn(L.stopError+e.message)}};
$('send').onclick=async function(){const text=$('text').value.trim();if(!text||!sessionId)return;$('text').value='';try{const b=await api('/api/send',{method:'POST',body:JSON.stringify({session:sessionId,text:text})});conn(b.mode==='queued'?L.queued:L.sent)}catch(e){conn(L.sendError+e.message);$('text').value=text}};
$('text').onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('send').click()}};
loadList().catch(function(e){if(e.message!=='unauthorized')conn(L.listError+e.message)});
</script></body></html>`;

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleStream(req, res, url) {
  const sessionId = url.searchParams.get('session') ?? '';
  if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
  let from = Number(url.searchParams.get('from') ?? '0');
  if (!Number.isSafeInteger(from) || from < 0) from = 0;

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const client = {
    sessionId,
    push(payload) {
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
    },
  };
  sseClients.add(client);
  let pollTimer = null;
  let statusInterval = null;
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    if (pollTimer) clearInterval(pollTimer);
    if (statusInterval) clearInterval(statusInterval);
    sseClients.delete(client);
  });

  const filePath = await findSessionFile(sessionId);
  const emitSnapshot = async () => {
    const result = filePath ? await readNewLines(filePath, 0) : { gap: false, bytes: 0, lines: [] };
    client.push({ type: 'snapshot', bytes: result.bytes, lines: result.lines });
    return result.bytes;
  };

  const tailParam = Number(url.searchParams.get('tail') ?? '0');
  const tailBytes = Number.isSafeInteger(tailParam) && tailParam > 0 ? Math.min(tailParam, 512 * 1024) : 0;
  if (from === 0 && filePath && tailBytes > 0) {
    const chunk = await historyChunk(filePath, null, tailBytes);
    from = chunk.endBytes;
    client.push({ type: 'snapshot', bytes: chunk.endBytes, lines: chunk.lines, headBytes: chunk.headBytes, hasMore: chunk.hasMore });
  } else if (from === 0) {
    from = await emitSnapshot();
  } else {
    const result = filePath ? await readNewLines(filePath, from) : { gap: from > 0, bytes: from, lines: [] };
    if (result.gap) {
      client.push({ type: 'resync' });
      from = await emitSnapshot();
    } else {
      client.push({ type: 'snapshot', bytes: from, lines: [] });
      if (result.lines.length) {
        client.push({ type: 'append', bytes: result.bytes, lines: result.lines });
        from = result.bytes;
      }
    }
  }

  if (filePath) {
    try {
      const dir = dirname(filePath);
      const watcher = watch(dir, () => pump());
      watcher.on('error', () => {});
    } catch { /* polling fallback below */ }
  }
  let pumping = false;
  async function pump() {
    if (pumping || !filePath) return;
    pumping = true;
    try {
      const result = await readNewLines(filePath, from);
      if (result.gap) {
        client.push({ type: 'resync' });
        from = await emitSnapshot();
      } else if (result.lines.length) {
        from = result.bytes;
        client.push({ type: 'append', bytes: result.bytes, lines: result.lines });
      }
    } catch { /* next tick retries */ } finally {
      pumping = false;
    }
  }
  pollTimer = setInterval(() => pump(), 700);

  const pushStatus = async () => {
    try {
      const status = await withMcp((mcp) => getSessionStatus(mcp, sessionId));
      client.push({ type: 'status', status: status.status, suspension: status.suspension });
    } catch { /* transient; next tick retries */ }
  };
  await pushStatus();
  statusInterval = setInterval(pushStatus, 2_000);
}

const WEB_DIST = fileURLToPath(new URL('../web/dist/', import.meta.url));
// fileURLToPath는 Windows에서 역슬래시로 끝나는 경로를 반환하므로 양쪽 구분자를 모두 허용한다.
const WEB_DIST_ROOT = (WEB_DIST.endsWith('/') || WEB_DIST.endsWith(sep)) ? WEB_DIST : WEB_DIST + sep;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveStatic(pathname, res) {
  if (pathname.indexOf(String.fromCharCode(0)) !== -1) return false;
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const target = join(WEB_DIST_ROOT, rel);
  if (!target.startsWith(WEB_DIST_ROOT)) return false;
  let servedPath = target;
  let data = null;
  try {
    data = await readFile(target);
  } catch {
    data = null;
  }
  if (data === null && extname(target) !== '.html') {
    try {
      servedPath = join(WEB_DIST_ROOT, 'index.html');
      data = await readFile(servedPath);
    } catch {
      return false;
    }
  }
  if (data === null) return false;
  const isHtml = extname(servedPath) === '.html';
  const cacheControl = isHtml ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'content-type': MIME_TYPES[extname(servedPath)] ?? 'application/octet-stream', 'cache-control': cacheControl });
  res.end(data);
  return true;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname !== '/healthz' && !url.pathname.startsWith('/api/')) {
      if (await serveStatic(url.pathname, res)) return;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(APP_HTML);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true });

    if (req.method === 'POST' && url.pathname === '/api/pair') {
      const now = Date.now();
      if (pairFailures >= PAIR_MAX_FAILURES) return json(res, 423, { error: 'Pairing locked after too many failed attempts; restart the server' });
      const ip = req.socket.remoteAddress ?? '';
      const recent = (pairAttemptsByIp.get(ip) ?? []).filter((t) => now - t <= PAIR_WINDOW_MS);
      if (recent.length >= PAIR_PER_IP_LIMIT) return json(res, 429, { error: 'Too many attempts; wait a minute' });
      recent.push(now);
      pairAttemptsByIp.set(ip, recent);
      const body = await readBody(req);
      if (!pairCodeMatches(body.code ?? '')) {
        pairFailures += 1;
        if (pairFailures >= PAIR_MAX_FAILURES) {
          console.error('[' + new Date().toISOString() + '] pairing locked after ' + pairFailures + ' failed attempts (last from ' + ip + '); restart to pair again');
        }
        return json(res, 401, { error: 'Invalid code' });
      }
      pairFailures = 0;
      pairAttemptsByIp.delete(ip);
      const sid = randomBytes(24).toString('base64url');
      cookies.set(sid, { issuedAt: now });
      persistCookies();
      return json(res, 200, { ok: true }, {
        'set-cookie': 'asideRemote=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + (COOKIE_TTL_MS / 1000),
      });
    }

    if (!isAuthed(req)) return json(res, 401, { error: 'Pairing required' });

    if (req.method === 'GET' && url.pathname === '/api/session') {
      const sessions = await withMcp(listAllSessions);
      return json(res, 200, { sessions });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const status = await withMcp((mcp) => getSessionStatus(mcp, url.searchParams.get('session') ?? ''));
      return json(res, 200, status);
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const projects = await withMcp(listProjects);
      return json(res, 200, { projects });
    }
    if (req.method === 'GET' && url.pathname === '/api/models') {
      const sessionId = url.searchParams.get('session') ?? '';
      if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
      return json(res, 200, await readModelCatalog(sessionId));
    }
    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const body = await readBody(req);
      const text = String(body.text ?? '').trim();
      if (!text || text.length > 8000) return json(res, 400, { error: 'Message must be 1-8000 characters' });
      let projectId = null;
      if (body.projectId != null && String(body.projectId).trim()) {
        projectId = String(body.projectId).trim();
        let projectExists = false;
        for (const dbPath2 of await stateDbPaths()) {
          const rows2 = await queryDb(dbPath2, 'SELECT id FROM projects WHERE id=' + sqlQuote(projectId));
          if (rows2.length > 0) { projectExists = true; break; }
        }
        if (!projectExists) return json(res, 400, { error: 'Unknown project' });
      }
      const beforeSec = Math.floor(Date.now() / 1000) - 3;
      const client = new AsideMcp();
      client.initialize()
        .then(() => client.request('tools/call', { name: 'exec', arguments: { prompt: text } }))
        .catch(() => void 0)
        .finally(() => { const t = setTimeout(() => client.close(), 60_000); if (t.unref) t.unref(); });
      let sessionId = null;
      for (let attempt = 0; attempt < 50 && !sessionId; attempt++) {
        await delay(300);
        for (const dbPath2 of await stateDbPaths()) {
          const rows2 = await queryDb(dbPath2, 'SELECT id FROM sessions WHERE created_at > ' + beforeSec + ' ORDER BY created_at DESC LIMIT 1');
          if (rows2.length > 0) { sessionId = rows2[0].id; break; }
        }
      }
      if (!sessionId) return json(res, 504, { error: 'Session creation timed out' });
      for (const dbPath3 of await stateDbPaths()) {
        await execDb(dbPath3, 'UPDATE sessions SET ephemeral=0' + (projectId ? ', project_id=' + sqlQuote(projectId) : '') + ' WHERE id=' + sqlQuote(sessionId));
      }
      return json(res, 200, { sessionId });
    }
    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const body = await readBody(req);
      const name = String(body.name ?? '').trim().slice(0, 60);
      if (!name) return json(res, 400, { error: 'Project name is required' });
      const workspacePath = String(body.workspacePath ?? '').trim() || join(homedir(), name.replace(/\s+/g, '-'));
      await mkdir(workspacePath, { recursive: true }).catch(() => void 0);
      let inserted = false;
      for (const dbPath3 of await stateDbPaths()) {
        if (await execDb(dbPath3, 'INSERT INTO projects (id, name, icon, color, workspace_path, created_at, updated_at) VALUES (' + sqlQuote(name) + ', ' + sqlQuote(name) + ", 'folder', 'mono', " + sqlQuote(workspacePath) + ', unixepoch(), unixepoch())')) inserted = true;
      }
      if (!inserted) return json(res, 409, { error: 'Could not create project (it may already exist)' });
      return json(res, 200, { project: { id: name, name } });
    }
    if (req.method === 'GET' && url.pathname === '/api/model') {
      const sessionId = url.searchParams.get('session') ?? '';
      if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
      return json(res, 200, { model: await readSessionModel(sessionId) });
    }
    if (req.method === 'POST' && url.pathname === '/api/model') {
      const body = await readBody(req);
      const sessionId = String(body.session ?? '');
      if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
      const provider = String(body.provider ?? '').trim();
      const modelId = String(body.modelId ?? '').trim();
      const thinkingLevel = String(body.thinkingLevel ?? 'high').trim();
      if (!provider || !modelId) return json(res, 400, { error: 'provider and modelId are required' });
      if (!THINKING_LEVELS.includes(thinkingLevel)) return json(res, 400, { error: 'Invalid thinking level' });
      const model = { provider, modelId, thinkingLevel, fastMode: body.fastMode === true };
      await withMcp((mcp) => mcp.replCode(
        'aside.sessions.update(' + JSON.stringify(sessionId) + ', {model: ' + JSON.stringify(model) + '}); console.log("ok")',
      ));
      return json(res, 200, { model: await readSessionModel(sessionId) });
    }
    if (req.method === 'GET' && url.pathname === '/api/file') {
      const found = await resolveStoredFilePath(url.searchParams.get('path') ?? '', url.searchParams.get('session') ?? '');
      if (found?.status) return json(res, found.status, { error: found.error });
      if (!found || found.outside) return json(res, 403, { error: 'Path is outside the session storage.' });
      if (found.missing) {
        const message = 'File not found in the session workspace: ' + (found.path ?? '');
        const htmlMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
        if ((req.headers.accept ?? '').includes('text/html')) {
          res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><meta charset="utf-8"><title>404</title><body style="font-family:system-ui;background:#141414;color:#e5e5e5;display:grid;place-items:center;height:100vh;margin:0"><p style="max-width:28rem;line-height:1.7">' + htmlMessage + '</p></body>');
          return;
        }
        return json(res, 404, { error: message });
      }
      const target = found.path;
      const info = await stat(target).catch(() => null);
      if (!info || !info.isFile()) return json(res, 404, { error: 'Not found' });
      const ext = extname(target).toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
      res.writeHead(200, { 'content-type': mime, 'content-length': info.size, 'cache-control': 'private, max-age=86400' });
      createReadStream(target).pipe(res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/attach') {
      const body = await readBody(req, 12 * 1024 * 1024);
      const sessionId = String(body.session ?? '');
      if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
      const sessionFile = await findSessionFile(sessionId);
      if (!sessionFile) return json(res, 404, { error: 'Session not found' });
      const data = String(body.data ?? '');
      if (!data) return json(res, 400, { error: 'Missing image data' });
      const buffer = Buffer.from(data, 'base64');
      if (!buffer.length) return json(res, 400, { error: 'Invalid image data' });
      const rawName = String(body.filename ?? 'image.png').replace(/[^\w.()-]/g, '_');
      const safeName = (Date.now() + '_' + rawName).slice(-120);
      const tmpDir = join(dirname(sessionFile), 'tmp');
      await mkdir(tmpDir, { recursive: true });
      const target = join(tmpDir, safeName);
      await writeFile(target, buffer);
      return json(res, 200, { path: target, bytes: buffer.length });
    }
    if (req.method === 'GET' && url.pathname === '/api/subagents') {
      const sessionId = url.searchParams.get('session') ?? '';
      if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
      const filePath = await findSessionFile(sessionId);
      if (!filePath) return json(res, 200, { agents: [] });
      return json(res, 200, { agents: await listSubagents(filePath) });
    }
    if (req.method === 'GET' && url.pathname === '/api/history') {
      const sessionId = url.searchParams.get('session') ?? '';
      if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
      const filePath = await findSessionFile(sessionId);
      if (!filePath) return json(res, 200, { lines: [], headBytes: 0, hasMore: false });
      const beforeRaw = Number(url.searchParams.get('beforeBytes') ?? '');
      const beforeBytes = Number.isSafeInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : null;
      const chunk = await historyChunk(filePath, beforeBytes, HISTORY_MAX_BYTES);
      return json(res, 200, chunk);
    }
    if (req.method === 'GET' && url.pathname === '/api/events') return handleStream(req, res, url);
    if (req.method === 'POST' && url.pathname === '/api/send') {
      const body = await readBody(req);
      if (body.mode === 'answer') {
        const sessionId = String(body.session ?? '');
        if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
        const prompt = String(body.text ?? '').trim();
        if (!prompt || prompt.length > 8000) return json(res, 400, { error: 'Message must be 1-8000 characters' });
        const client = new AsideMcp();
        try {
          await client.initialize();
          const status = await getSessionStatus(client, sessionId);
          if (status.status === 'suspended') {
            await runAsideCli(['session', 'stop', sessionId]);
            for (let i = 0; i < 12; i++) {
              await delay(300);
              const current = await getSessionStatus(client, sessionId).catch(() => null);
              if (current && current.status !== 'suspended') break;
            }
          }
        } finally {
          client.close();
        }
        const result = await sendRemoteMessage(sessionId, prompt);
        return json(res, 200, result);
      }
      if (body.mode === 'steer') {
        const sessionId = String(body.session ?? '');
        if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
        const prompt = String(body.text ?? '').trim();
        if (!prompt || prompt.length > 8000) return json(res, 400, { error: 'Message must be 1-8000 characters' });
        await runAsideCli(['session', 'steer', sessionId, prompt], 30_000);
        return json(res, 200, { mode: 'steered' });
      }
      const result = await sendRemoteMessage(String(body.session ?? ''), body.text);
      return json(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      const body = await readBody(req);
      const sessionId = String(body.session ?? '');
      if (!SESSION_ID_RE.test(sessionId)) return json(res, 400, { error: 'Invalid session ID' });
      await runAsideCli(['session', 'stop', sessionId]);
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    json(res, 500, { error: String(error.message ?? error) });
  }
}).listen(PORT, HOST, () => {
  const addresses = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  console.log('Remote Anything listening on ' + HOST + ':' + PORT + '.');
  console.log('Aside CLI: ' + asideBin());
  if (HOST === '0.0.0.0') {
    for (const address of addresses) console.log('  http://' + address + ':' + PORT + '/');
  } else {
    console.log('  http://' + (HOST.includes(':') ? '[' + HOST + ']' : HOST) + ':' + PORT + '/');
    if (HOST === '127.0.0.1') console.log('Local only. Use --host 0.0.0.0 for LAN access, or put it behind tailscale serve.');
  }
  console.log('Pairing code: ' + pairingCode);
  console.log('The code grants full read/send access to your Aside sessions. Do not share it.');
});

process.on('SIGINT', () => {
  sharedMcp?.close();
  process.exit(0);
});
