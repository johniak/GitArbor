import { execSync, spawn } from 'node:child_process';

function hasBinary(name: string): boolean {
  try {
    execSync(`command -v ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function spawnDetached(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        cwd: opts.cwd,
      });
      let done = false;
      child.once('error', (err) => {
        if (done) return;
        done = true;
        resolve({ error: err.message });
      });
      child.unref();
      // ENOENT surfaces via the 'error' event asynchronously. Give it a brief
      // window to fire before we report success.
      setTimeout(() => {
        if (done) return;
        done = true;
        resolve({});
      }, 120);
    } catch (e) {
      resolve({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export async function openTerminal(cwd: string): Promise<{ error?: string }> {
  const platform = process.platform;

  if (platform === 'darwin') {
    return spawnDetached('open', ['-a', 'Terminal', cwd]);
  }

  if (platform === 'win32') {
    if (hasBinary('wt.exe')) {
      return spawnDetached('wt.exe', ['-d', cwd]);
    }
    return spawnDetached(
      'cmd.exe',
      ['/c', 'start', '', '/D', cwd, 'cmd.exe'],
      {},
    );
  }

  const candidates: Array<{ cmd: string; args: string[] }> = [
    { cmd: 'x-terminal-emulator', args: [] },
    { cmd: 'gnome-terminal', args: ['--working-directory', cwd] },
    { cmd: 'konsole', args: ['--workdir', cwd] },
    { cmd: 'xfce4-terminal', args: [`--working-directory=${cwd}`] },
    { cmd: 'kitty', args: ['--directory', cwd] },
    { cmd: 'alacritty', args: ['--working-directory', cwd] },
    { cmd: 'tilix', args: ['--working-directory', cwd] },
    { cmd: 'xterm', args: [] },
  ];

  for (const { cmd, args } of candidates) {
    if (!hasBinary(cmd)) continue;
    const result = await spawnDetached(cmd, args, { cwd });
    if (!result.error) return result;
  }

  return { error: 'No supported terminal emulator found on PATH' };
}
