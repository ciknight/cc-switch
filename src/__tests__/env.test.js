'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

let tmpDir;
let ccDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-env-'));
  ccDir = path.join(tmpDir, 'cc');
  fs.mkdirSync(path.join(ccDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(ccDir, 'private.json'), JSON.stringify({
    ANTHROPIC_AUTH_TOKEN: 'sk-test',
    ANTHROPIC_BASE_URL: 'https://api.test',
  }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'base.json'), JSON.stringify({
    env: { CLAUDE_CODE_ATTRIBUTION_HEADER: '0' },
    permissions: { allow: [] },
    language: 'Chinese',
  }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'profiles', 'sonnet.json'), JSON.stringify({ model: 'sonnet' }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'profiles', 'glm.json'), JSON.stringify({
    model: 'sonnet',
    env: { ANTHROPIC_MODEL: 'glm-5.1' },
  }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'profiles', 'bare.json'), JSON.stringify({
    env: { ANTHROPIC_MODEL: 'bare-model' },
  }), 'utf8');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('buildEnvSettings returns merged env plus model only', () => {
  const { buildEnvSettings } = require('../commands/env');
  const out = buildEnvSettings(ccDir, 'glm');
  expect(out.env.ANTHROPIC_MODEL).toBe('glm-5.1');
  expect(out.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
  expect(out.env.ANTHROPIC_BASE_URL).toBe('https://api.test');
  expect(out.env.CLAUDE_CODE_ATTRIBUTION_HEADER).toBe('0'); // base.json 的 env key 保留
  expect(out.model).toBe('sonnet');
  expect(Object.keys(out).sort()).toEqual(['env', 'model']); // 不含 permissions/language 等
});

test('buildEnvSettings omits model key when profile has none', () => {
  const { buildEnvSettings } = require('../commands/env');
  const out = buildEnvSettings(ccDir, 'bare');
  expect(out.env.ANTHROPIC_MODEL).toBe('bare-model');
  expect('model' in out).toBe(false);
  expect(Object.keys(out)).toEqual(['env']);
});

test('buildEnvSettings throws for missing profile', () => {
  const { buildEnvSettings } = require('../commands/env');
  expect(() => buildEnvSettings(ccDir, 'nope')).toThrow('not found');
});

test('buildEnvSettings throws init hint when base.json missing', () => {
  const { buildEnvSettings } = require('../commands/env');
  fs.rmSync(path.join(ccDir, 'base.json'));
  expect(() => buildEnvSettings(ccDir, 'glm')).toThrow('cc-switch init');
});

test('buildEnvSettings throws init hint when private.json missing', () => {
  const { buildEnvSettings } = require('../commands/env');
  fs.rmSync(path.join(ccDir, 'private.json'));
  expect(() => buildEnvSettings(ccDir, 'glm')).toThrow('cc-switch init');
});

describe('resolveClaudeBin', () => {
  test('prefers CC_SWITCH_CLAUDE', () => {
    const { resolveClaudeBin } = require('../commands/env');
    expect(resolveClaudeBin({ env: { CC_SWITCH_CLAUDE: 'C:/tools/claude.exe' }, platform: 'win32', spawnSyncFn: () => ({ status: 1 }) })).toBe('C:/tools/claude.exe');
  });

  test('returns claude on non-win32', () => {
    const { resolveClaudeBin } = require('../commands/env');
    expect(resolveClaudeBin({ env: {}, platform: 'linux', spawnSyncFn: () => ({ status: 1 }) })).toBe('claude');
  });

  test('resolves via where.exe on win32', () => {
    const { resolveClaudeBin } = require('../commands/env');
    const spawnSyncFn = jest.fn(() => ({ status: 0, stdout: 'C:\\npm\\claude.cmd\r\nC:\\npm\\claude.ps1\r\n' }));
    expect(resolveClaudeBin({ env: {}, platform: 'win32', spawnSyncFn })).toBe('C:\\npm\\claude.cmd');
    expect(spawnSyncFn).toHaveBeenCalledWith('where.exe', ['claude']);
  });

  test('throws with CC_SWITCH_CLAUDE hint when claude missing on win32', () => {
    const { resolveClaudeBin } = require('../commands/env');
    expect(() => resolveClaudeBin({ env: {}, platform: 'win32', spawnSyncFn: () => ({ status: 1 }) })).toThrow('CC_SWITCH_CLAUDE');
  });
});

describe('quoteCmdArg', () => {
  test('passes plain args through', () => {
    const { quoteCmdArg } = require('../commands/env');
    expect(quoteCmdArg('abc')).toBe('abc');
    expect(quoteCmdArg('--settings')).toBe('--settings');
    expect(quoteCmdArg('C:\\Users\\me\\.claude')).toBe('C:\\Users\\me\\.claude');
  });

  test('quotes args with spaces', () => {
    const { quoteCmdArg } = require('../commands/env');
    expect(quoteCmdArg('hello world')).toBe('"hello world"');
  });

  test('escapes embedded quotes', () => {
    const { quoteCmdArg } = require('../commands/env');
    expect(quoteCmdArg('say "hi"')).toBe('"say \\"hi\\""');
  });

  test('doubles trailing backslash inside quotes', () => {
    const { quoteCmdArg } = require('../commands/env');
    expect(quoteCmdArg('hello C:\\dir\\')).toBe('"hello C:\\dir\\\\"');
  });
});

describe('buildSpawnInvocation', () => {
  test('direct spawn on non-win32', () => {
    const { buildSpawnInvocation } = require('../commands/env');
    const inv = buildSpawnInvocation('claude', '/tmp/s.json', ['-c'], 'linux');
    expect(inv.command).toBe('claude');
    expect(inv.args).toEqual(['--settings', '/tmp/s.json', '-c']);
  });

  test('wraps via cmd.exe on win32 with quoted join', () => {
    const { buildSpawnInvocation } = require('../commands/env');
    const inv = buildSpawnInvocation('C:\\npm\\claude.cmd', 'C:\\tmp dir\\s.json', ['-p', 'hello world'], 'win32');
    expect(inv.args[0]).toBe('/d');
    expect(inv.args[1]).toBe('/s');
    expect(inv.args[2]).toBe('/c');
    expect(inv.args[3]).toBe('C:\\npm\\claude.cmd --settings "C:\\tmp dir\\s.json" -p "hello world"');
    expect(inv.command).toMatch(/cmd\.exe$/i);
  });
});

describe('launch', () => {
  function makeFakeSpawn() {
    const calls = [];
    const children = [];
    const spawnFn = (command, args, opts) => {
      calls.push({ command, args, opts });
      const child = new EventEmitter();
      children.push(child);
      return child;
    };
    return { spawnFn, calls, children };
  }

  function settingsFileFrom(spawnCall) {
    if (spawnCall.args[0] === '/d') {
      // win32: ['/d','/s','/c', 'claude.cmd --settings "C:\\...\\s.json" -c']
      const m = spawnCall.args[3].match(/--settings (?:"([^"]+)"|(\S+))/);
      expect(m).not.toBeNull();
      return m[1] || m[2];
    }
    const idx = spawnCall.args.indexOf('--settings');
    expect(idx).toBeGreaterThanOrEqual(0);
    return spawnCall.args[idx + 1];
  }

  test('spawns claude with --settings temp file and cleans up', async () => {
    const { launch } = require('../commands/env');
    const fake = makeFakeSpawn();
    const p = launch('glm', ['-c'], { configDir: ccDir, claudeBin: 'claude', spawnFn: fake.spawnFn });
    const settingsFile = settingsFileFrom(fake.calls[0]);
    expect(settingsFile).toMatch(/cc-switch-env-/);
    expect(fs.existsSync(settingsFile)).toBe(true);
    expect(fake.calls[0].opts.stdio).toBe('inherit');
    fake.children[0].emit('close', 0);
    await expect(p).resolves.toBe(0);
    expect(fs.existsSync(settingsFile)).toBe(false);
  });

  test('writes only env+model into temp file', async () => {
    const { launch } = require('../commands/env');
    const fake = makeFakeSpawn();
    const p = launch('glm', [], { configDir: ccDir, claudeBin: 'claude', spawnFn: fake.spawnFn });
    const settingsFile = settingsFileFrom(fake.calls[0]);
    const content = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    expect(Object.keys(content).sort()).toEqual(['env', 'model']);
    expect(content.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
    fake.children[0].emit('close', 0);
    await p;
  });

  test('passes nonzero exit code through', async () => {
    const { launch } = require('../commands/env');
    const fake = makeFakeSpawn();
    const p = launch('glm', [], { configDir: ccDir, claudeBin: 'claude', spawnFn: fake.spawnFn });
    const settingsFile = settingsFileFrom(fake.calls[0]);
    fake.children[0].emit('close', 2);
    await expect(p).resolves.toBe(2);
    expect(fs.existsSync(settingsFile)).toBe(false);
  });

  test('rejects and cleans up on spawn error', async () => {
    const { launch } = require('../commands/env');
    const fake = makeFakeSpawn();
    const p = launch('glm', [], { configDir: ccDir, claudeBin: 'claude', spawnFn: fake.spawnFn });
    const settingsFile = settingsFileFrom(fake.calls[0]);
    fake.children[0].emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
    await expect(p).rejects.toThrow('CC_SWITCH_CLAUDE');
    expect(fs.existsSync(settingsFile)).toBe(false);
  });

  test('throws listing profiles for missing profile', async () => {
    const { launch } = require('../commands/env');
    await expect(launch('nope', [], { configDir: ccDir, claudeBin: 'claude', spawnFn: () => {} })).rejects.toThrow('glm');
  });

  test('throws init hint when base.json missing', async () => {
    const { launch } = require('../commands/env');
    fs.rmSync(path.join(ccDir, 'base.json'));
    await expect(launch('glm', [], { configDir: ccDir, claudeBin: 'claude', spawnFn: () => {} })).rejects.toThrow('cc-switch init');
  });

  test('prints session line without token', async () => {
    const { launch } = require('../commands/env');
    const fake = makeFakeSpawn();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const p = launch('glm', [], { configDir: ccDir, claudeBin: 'claude', spawnFn: fake.spawnFn });
      fake.children[0].emit('close', 0);
      await p;
      const printed = errSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(printed).toContain('glm');
      expect(printed).not.toContain('sk-test');
    } finally {
      errSpy.mockRestore();
    }
  });

  test('run --print outputs settings JSON without launching', async () => {
    const { run } = require('../commands/env');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await run('glm', [], { print: true, configDir: ccDir });
      const printed = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(printed).toContain('ANTHROPIC_MODEL');
      expect(printed).toContain('"model"');
    } finally {
      logSpy.mockRestore();
    }
  });
});
