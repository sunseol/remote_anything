import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const usage = `Usage: node tools/probe.mjs tools | create | resume <session-id> <prompt> | read <session-id> | status <session-id> | stop <session-id>
Runs the installed Aside MCP over stdio against the local host.
create makes a dedicated harmless test session. Other commands only use the supplied session ID.
No daemon tokens, account keys, public listeners, or application patches are used.`;

// Windows 포팅: aside 실행파일 해석(sync-server.mjs와 동일 규칙).
function asideBin() {
  if (process.platform === 'win32') {
    const local = join(process.env.LOCALAPPDATA ?? '', 'Aside', 'CLI', 'current', 'aside.exe');
    if (local && existsSync(local)) return local;
  }
  return 'aside';
}

function spawnAside(childArgs, opts = {}) {
  return spawn(asideBin(), childArgs, { windowsHide: true, ...opts });
}

class AsideMcp {
  #child;
  #pending = new Map();
  #sequence = 0;
  #buffer = '';
  #closed = false;
  #failure;
  notifications = [];

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
          } else {
            this.notifications.push(message);
          }
        } catch (error) {
          this.#fail(error);
        }
      }
    });
    // CLI diagnostic output can include account context; it is not persisted or echoed.
    this.#child.stderr.resume();
    this.#child.stdin.on('error', (error) => this.#fail(error));
    this.#child.on('error', (error) => this.#fail(error));
    this.#child.on('exit', (code, signal) => this.#fail(new Error(`Aside MCP exited (${code ?? signal})`)));
  }

  #fail(error) {
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

  request(method, params = {}, timeoutMs = 180_000) {
    if (this.#closed) return Promise.reject(new Error('Aside MCP is closed'));
    if (this.#failure) return Promise.reject(this.#failure);
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out: ${method}. Execution status is unknown; do not blindly retry.`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#send({ jsonrpc: '2.0', id, method, params });
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'remote-anything-probe', version: '0.1.0' },
    }, 15_000);
    this.#send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return result;
  }

  call(name, args) {
    return this.request('tools/call', { name, arguments: args });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#fail(new Error('Aside MCP connection closed'));
    this.#child.stdin.end();
    this.#child.kill('SIGTERM');
    // The installed MCP can wait forever after a run is interrupted.
    const killTimer = setTimeout(() => this.#child.kill('SIGKILL'), 1_000);
    killTimer.unref();
    this.#child.once('exit', () => clearTimeout(killTimer));
  }
}

async function readStatus(client, sessionId) {
  const result = await client.call('repl', {
    title: 'Read dedicated session status',
    code: `console.log(JSON.stringify((s => ({id:s.id,status:s.status,updatedAt:s.updatedAt,suspension:s.suspension}))(aside.sessions.get(${JSON.stringify(sessionId)}))));`,
  });
  if (result.isError) throw new Error('Aside session status read failed');
  const block = result.content.find((item) => item.type === 'text');
  if (!block) throw new Error('Aside session status was empty');
  const status = JSON.parse(block.text);
  if (status.id !== sessionId || typeof status.status !== 'string') throw new Error('Unexpected session status response');
  return status;
}

async function resumeObserved(client, sessionId, prompt) {
  const observer = new AsideMcp();
  let stopped = false;
  try {
    await observer.initialize();
    const initial = await readStatus(observer, sessionId);
    if (initial.status === 'running' || initial.status === 'suspended') {
      throw new Error(`Session is ${initial.status}; refusing a competing prompt`);
    }
    let sawRunning = false;
    const monitor = (async () => {
      while (!stopped) {
        await delay(500);
        if (stopped) return;
        const current = await readStatus(observer, sessionId);
        if (current.status === 'running') sawRunning = true;
        const terminalChanged = current.status !== initial.status || current.updatedAt !== initial.updatedAt || sawRunning;
        if (current.status === 'suspended') {
          throw new Error('Session is suspended. Resolve it in Aside. This probe cannot answer approvals.');
        }
        if (terminalChanged && ['interrupted', 'aborted', 'errored'].includes(current.status)) {
          throw new Error(`Session became ${current.status}; closing the pending MCP call to prevent a later run being returned`);
        }
      }
    })();
    return await Promise.race([client.call('exec', { session_id: sessionId, prompt }), monitor]);
  } finally {
    stopped = true;
    observer.close();
  }
}

async function stopSession(sessionId) {
  return new Promise((resolve, reject) => {
    const child = spawnAside(['session', 'stop', sessionId], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.resume();
    const timer = setTimeout(() => { child.kill(); reject(new Error('Stop timed out; verify session status')); }, 15_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stopped: true, output: output.trim() });
      else reject(new Error(`Aside stop failed (${code})`));
    });
  });
}

function requireSessionId(value) {
  if (!value || !/^[A-Za-z0-9_-]{6,160}$/.test(value)) throw new Error('Invalid session ID');
  return value;
}

async function main(args) {
  const [command, sessionArgument, ...promptWords] = args;
  if (command === '--help' || command === '-h') { console.log(usage); return; }
  if (!['tools', 'create', 'resume', 'read', 'status', 'stop'].includes(command)) throw new Error(usage);
  const sessionId = ['read', 'resume', 'status', 'stop'].includes(command) ? requireSessionId(sessionArgument) : undefined;
  if (command === 'resume' && !promptWords.join(' ').trim()) throw new Error('A follow-up prompt is required');
  if (command === 'stop') { console.log(JSON.stringify(await stopSession(sessionId))); return; }
  let lockPath;
  if (command === 'resume') {
    const lockRoot = fileURLToPath(new URL('.locks/', import.meta.url));
    await mkdir(lockRoot, { recursive: true });
    lockPath = `${lockRoot}${sessionId}`;
    await mkdir(lockPath).catch((error) => {
      if (error.code === 'EEXIST') throw new Error('Another probe owns this session. If it crashed, verify no active probe before removing its lock.');
      throw error;
    });
  }
  const client = new AsideMcp();
  const onSignal = () => client.close();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const server = await client.initialize();
    console.error(`Connected to Aside MCP ${server.serverInfo.version}`);
    let result;
    if (command === 'tools') result = await client.request('tools/list');
    if (command === 'create') {
      const marker = `remote-anything-probe-${randomUUID()}`;
      console.error(`Test marker: ${marker}`);
      result = await client.call('exec', {
        prompt: `This is an isolated integration test named Remote Anything probe. Do not browse, use tools, read files, modify files or settings, or contact anyone. Remember the marker ${marker} for this conversation. Reply with exactly READY ${marker} and nothing else.`,
      });
    }
    if (command === 'resume') result = await resumeObserved(client, sessionId, promptWords.join(' '));
    if (command === 'status') result = await readStatus(client, sessionId);
    if (command === 'read') {
      const code = `const probeSession = aside.sessions.get(${JSON.stringify(sessionId)}); const probeMessages = await aside.sessions.messages(${JSON.stringify(sessionId)}, {limit: 30, order: 'asc'}); console.log(JSON.stringify({session: {id: probeSession.id, title: probeSession.title, status: probeSession.status}, messages: probeMessages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({role:m.role,text: typeof m.content === 'string' ? m.content : m.content.filter(c => c.type === 'text').map(c => c.text).join('\\n')}))}));`;
      result = await client.call('repl', { title: 'Read dedicated remote probe session', code });
    }
    console.log(JSON.stringify({ result, notifications: client.notifications }, null, 2));
    if (result?.isError) process.exitCode = 1;
  } finally {
    client.close();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    if (lockPath) await rm(lockPath, { recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
