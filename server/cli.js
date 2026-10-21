import { spawn } from 'node:child_process';
import { access, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { streamCodex, streamOpenCode, codexStreamArgs, openCodeStreamArgs } from './streaming.js';

export const CLI_PROVIDERS = {
  codex: { name: 'Codex', loginCommand: 'codex login' },
  claude: { name: 'Claude Code', loginCommand: 'claude auth login' },
  opencode: { name: 'OpenCode', loginCommand: null },
};
const cache = new Map();
const keyFor = (id, suffix) => `CLI_${id.toUpperCase()}_${suffix}`;

async function executable(file) {
  try { return (await stat(file)).isFile() && (await access(file, process.platform === 'win32' ? constants.F_OK : constants.X_OK), true); } catch { return false; }
}

// Resolve npm wrappers to their actual executable without passing prompts through cmd.exe.
async function resolveFile(file, id) {
  if (!await executable(file)) return null;
  if (/\.(cmd|ps1|bat)$/i.test(file)) {
    const modules = path.join(path.dirname(file), 'node_modules');
    const targets = {
      codex: [path.join(modules, '@openai/codex/bin/codex.js')],
      claude: [path.join(modules, '@anthropic-ai/claude-code/cli.js')],
      opencode: [path.join(modules, '@opencode/cli/bin/opencode.exe'), path.join(modules, 'opencode-ai/bin/opencode')],
    };
    for (const target of targets[id]) if (await executable(target)) return { command: /\.exe$/i.test(target) ? target : process.execPath, prefix: /\.exe$/i.test(target) ? [] : [target] };
    return null;
  }
  if (/\.(mjs|cjs|js)$/i.test(file)) return { command: process.execPath, prefix: [file] };
  return { command: file, prefix: [] };
}

export async function resolveCli(id, env = process.env) {
  if (!CLI_PROVIDERS[id]) throw new Error('Invalid CLI provider.');
  const configured = env[keyFor(id, 'PATH')];
  if (configured) return resolveFile(path.resolve(configured), id);
  const folders = [...(env.PATH || env.Path || '').split(path.delimiter), path.join(homedir(), '.local/bin')];
  if (process.platform === 'win32') folders.push(path.join(homedir(), 'AppData/Local/Programs/OpenAI/Codex/bin'), path.join(homedir(), 'AppData/Roaming/npm'));
  for (const folder of folders.filter(Boolean)) {
    for (const extension of process.platform === 'win32' ? ['.exe', '.cmd', '.ps1', ''] : ['']) {
      const resolved = await resolveFile(path.join(folder, id + extension), id);
      if (resolved) return resolved;
    }
  }
  return null;
}

export function terminateTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
    killer.on('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

async function versionOf(resolved) {
  return new Promise(resolve => {
    let text = '';
    const child = spawn(resolved.command, [...resolved.prefix, '--version'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const timer = setTimeout(() => terminateTree(child), 6000);
    child.stdout.on('data', chunk => { if (text.length < 500) text += chunk; });
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('close', code => { clearTimeout(timer); resolve(code === 0 ? text.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n')[0].slice(0, 120) : ''); });
  });
}

export async function getCliStatus(env = process.env, refresh = false) {
  return Promise.all(Object.entries(CLI_PROVIDERS).map(async ([id, info]) => {
    const key = `${id}:${env[keyFor(id, 'PATH')] || ''}`;
    let result = cache.get(key);
    if (!result || refresh || Date.now() - result.time > 15000) {
      const resolved = await resolveCli(id, env);
      const version = resolved ? await versionOf(resolved) : '';
      result = { time: Date.now(), version, installed: Boolean(resolved && version) };
      cache.set(key, result);
    }
    return { id, ...info, installed: result.installed, version: result.version, model: env[keyFor(id, 'MODEL')] || null };
  }));
}

export function defaultCli(env = process.env) {
  return Object.hasOwn(CLI_PROVIDERS, env.CLI_PROVIDER) ? env.CLI_PROVIDER : 'codex';
}

export function cliError(id, detail = '') {
  const name = CLI_PROVIDERS[id]?.name || 'CLI';
  if(/image could not be decoded|invalid image data|failed to decode.{0,30}image/i.test(detail))return `${name} could not read one of the images. Attach it again as PNG, JPG or WebP.`;
  if(/(?:does not support|unsupported|cannot process|not support).{0,60}(?:image|vision)|(?:image|vision).{0,60}(?:not supported|unsupported)/i.test(detail))return `The model selected in ${name} does not support images. Choose a vision-capable model.`;
  if (id === 'opencode' && /free tier can only be used from within opencode/i.test(detail)) return 'The free OpenCode model provider rejected this request: «OpenCode\'s free tier can only be used from within OpenCode». This is not a CLI login requirement. Choose a model or provider that supports this usage via CLI_OPENCODE_MODEL.';
  if (/rate.?limit|quota|usage.?limit|429|credit|balance/i.test(detail)) return `${name} has reached a usage or credit limit. Check your account and try again.`;
  if (/model.*(not found|invalid|not available)|unknown model|no.*model|provider.*not found/i.test(detail)) return `Check the model and provider configured in ${name}.`;
  if (/log.?in|unauthorized|401|not.?logged|authentication.{0,20}(required|fail)|(?:missing|invalid).{0,15}(api.?key|credential)/i.test(detail)) {
    if (id === 'opencode') return 'The provider configured in OpenCode rejected its credentials. Check that provider configuration; Perplemini does not require an OpenCode CLI login.';
    return `${name} requires authentication. Run “${CLI_PROVIDERS[id].loginCommand}” in your terminal and try again.`;
  }
  return `${name} could not complete the request. Check that it works in your terminal and review its authentication and model.`;
}

// Only public answer text is forwarded: never reasoning, command output, or tool results.
export function createEventParser(id) {
  const seen = new Map();
  let hasClaudeDelta = false;
  let hasAnswer = false;
  return event => {
    if (event.type === 'error' || event.type === 'turn.failed' || (event.type === 'result' && event.is_error)) {
      throw new Error(cliError(id, JSON.stringify(event.error || event.result || event.errors || '')));
    }
    if (id === 'codex') {
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.phase !== 'commentary') {
        const text = event.item.text || '';
        if (text) { const prefix=hasAnswer?'\n\n':'';hasAnswer = true; return prefix+text; }
      }
    } else if (id === 'claude') {
      const delta = event.type === 'stream_event' && event.event?.type === 'content_block_delta' && event.event.delta?.type === 'text_delta' ? event.event.delta.text : '';
      if (delta) { hasClaudeDelta = true; hasAnswer = true; return delta; }
      if (event.type === 'assistant' && !hasClaudeDelta) {
        const text = (event.message?.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
        if (text) { hasAnswer = true; return text; }
      }
      if (event.type === 'result' && !hasAnswer && typeof event.result === 'string') { hasAnswer = true; return event.result; }
    } else if (id === 'opencode') {
      if (event.type === 'text' && typeof event.part?.text === 'string') {
        const key = event.part.id || 'answer';
        const newBlock=!seen.has(key)&&seen.size>0;
        const old = seen.get(key) || '';
        const full = event.part.text;
        seen.set(key, full);
        return (newBlock?'\n\n':'')+(full.startsWith(old) ? full.slice(old.length) : full);
      }
      if (event.type === 'text_delta' && typeof event.delta === 'string') return event.delta;
      if (event.type === 'message.part.delta' && event.properties?.field === 'text') return event.properties.delta || '';
    }
    return '';
  };
}

export function buildInvocation(id, { model, port=0, research = false, images=[] }) {
  if(id==='codex')return codexStreamArgs(research);
  if(id==='opencode')return openCodeStreamArgs(port);
  const args = ['--print', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', research?'WebSearch,WebFetch':'', ...(research?['--allowedTools','WebSearch,WebFetch']:[]), '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--disable-slash-commands', '--no-session-persistence', '--permission-mode', 'dontAsk'];
  if (model) args.push('--model', model);
  if (images.length) args.push('--input-format','stream-json');
  return args;
}

export function composePrompt(system, messages, { research = false } = {}) {
  return `${system}\n\nThis is an answer-engine query, not a task on the computer. Do not read local files or run commands. ${research?'You may only use native web tools to search and read pages.':'Do not use tools.'} Answer only the latest message, using this history as context data.\n\nHISTORY (JSON):\n${JSON.stringify(messages)}`;
}

export function openCodeConfig(major, research) {
  // Preserve the native agent and tool catalog; allow only web tools without a prompt.
  return major >= 2 ? { permissions: [
    { action: '*', resource: '*', effect: 'ask' },
    ...(research?['websearch','webfetch'].map(action=>({action,resource:'*',effect:'allow'})):[]),
  ] } : { permission: { '*': 'ask', ...(research?{websearch:'allow',webfetch:'allow'}:{}) } };
}

export async function* runCli({ id, prompt, signal, model, research = false, images=[], onEvent, env = process.env }) {
  const resolved = await resolveCli(id, env);
  if (!resolved) throw new Error(`${CLI_PROVIDERS[id].name} is not installed or is not in PATH. Check Settings.`);
  const workdir = await mkdtemp(path.join(tmpdir(), 'perplemini-cli-'));
  let child;
  let onAbort;
  try {
    signal?.throwIfAborted();
    const version = id === 'opencode' ? await versionOf(resolved) : '';
    const major = Number(version.match(/(?:^|\s)v?(\d+)\./)?.[1] || 2);
    if (id === 'opencode') {
      // Keep the native harness intact. Like ClyraADE's guarded launch, use
      // permission requests rather than removing the native tool catalog or
      // replacing the built-in agent. No --auto flag grants those requests.
      const config = openCodeConfig(major,research);
      await writeFile(path.join(workdir, 'opencode.json'), JSON.stringify(config), { mode: 0o600 });
    }
    signal?.throwIfAborted();
    const childEnv = { ...env, NO_COLOR: '1' };
    // Do not inherit the host agent's nesting marker; auth stays owned by the CLI.
    delete childEnv.CLAUDECODE;
    if(id==='codex'||id==='opencode'){
      const stream=id==='codex'?streamCodex:streamOpenCode;
      yield* stream({resolved,workdir,env:childEnv,prompt,images,model:model||env[keyFor(id,'MODEL')],research,major,signal,onEvent,stop:terminateTree,errorFor:cliError});
      return;
    }
    child = spawn(resolved.command, [...resolved.prefix, ...buildInvocation(id, { model: model || env[keyFor(id, 'MODEL')], workdir, major, research, images })], {
      cwd: workdir, env: childEnv, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const completion = new Promise(resolve => { child.once('error', error => resolve({ error })); child.once('close', (code, signal) => resolve({ code, signal })); });
    onAbort = () => terminateTree(child);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    let stderr = '', bytes = 0, received = false;
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 4_000_000) terminateTree(child); });
    child.stdin.on('error', () => {});
    child.stdin.end(images.length?JSON.stringify({type:'user',message:{role:'user',content:[{type:'text',text:prompt},...images.map(image=>({type:'image',source:{type:'base64',media_type:image.mime,data:image.data}}))]},parent_tool_use_id:null})+'\n':prompt);
    const parse = createEventParser(id);
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of lines) {
      signal?.throwIfAborted();
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      const text = parse(event);
      onEvent?.(event);
      if (text) { received = true; yield text; }
    }
    const exit = await completion;
    signal?.throwIfAborted();
    if (bytes > 4_000_000) throw new Error('CLI output exceeded the size limit.');
    if (exit.error || exit.code !== 0) throw new Error(cliError(id, stderr));
    if (!received) throw new Error(cliError(id, stderr));
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = new Promise(resolve => child.once('close', resolve));
      terminateTree(child);
      await Promise.race([closed, new Promise(resolve => { const timer = setTimeout(resolve, 3000); timer.unref(); })]);
    }
    // Only remove the exact temporary directory created by this invocation.
    if (path.dirname(workdir) === path.resolve(tmpdir()) && path.basename(workdir).startsWith('perplemini-cli-')) await rm(workdir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}
