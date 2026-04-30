import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';
import fs from 'node:fs';

const isE2E = process.env.E2E_TEST === '1';

// JS-only modules marked as external in Vite that need copying to packaged app
const EXTERNAL_MODULES = ['sql.js', 'node-llama-cpp'];

// `@node-llama-cpp/*` platform-binary subpackages get copied wholesale —
// node-llama-cpp dlopen's `.node` binaries from these packages at runtime.
const NODE_LLAMA_CPP_BINARY_SCOPE = '@node-llama-cpp';

const plugins: ForgeConfig['plugins'] = [
  new AutoUnpackNativesPlugin({}),
  new VitePlugin({
    build: [
      {
        entry: 'src/main/index.ts',
        config: 'vite.main.config.ts',
        target: 'main',
      },
      {
        entry: 'src/preload/index.ts',
        config: 'vite.preload.config.ts',
        target: 'preload',
      },
    ],
    renderer: [
      {
        name: 'main_window',
        config: 'vite.renderer.config.mts',
      },
    ],
  }),
];

if (!isE2E) {
  plugins.push(
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  );
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './build/icons/icon',
    extraResource: ['./build/icons/icon_256.png'],
    // Keep the on-disk executable lowercase so electron-installer-debian
    // / -rpm find it (they expect `name` from package.json). productName
    // is still "GitArbor" for the macOS .app bundle, Start Menu, etc.
    executableName: 'gitarbor',
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy external JS modules
      const srcModules = path.join(process.cwd(), 'node_modules');
      const destModules = path.join(buildPath, 'node_modules');
      for (const mod of EXTERNAL_MODULES) {
        const src = path.join(srcModules, mod);
        const dest = path.join(destModules, mod);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }

      // Copy any installed `@node-llama-cpp/<platform>-<arch>-<backend>`
      // packages — these contain the prebuilt llama.cpp `.node` binaries.
      const scopeSrc = path.join(srcModules, NODE_LLAMA_CPP_BINARY_SCOPE);
      const scopeDest = path.join(destModules, NODE_LLAMA_CPP_BINARY_SCOPE);
      if (fs.existsSync(scopeSrc)) {
        fs.cpSync(scopeSrc, scopeDest, { recursive: true });
      }

      // Copy app icon (overwrite default electron.icns on macOS)
      const icnsPath = path.join(process.cwd(), 'build', 'icons', 'icon.icns');
      const resourcesDir = path.resolve(buildPath, '..');
      if (fs.existsSync(icnsPath)) {
        fs.cpSync(icnsPath, path.join(resourcesDir, 'electron.icns'));
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        // electron-installer-debian supports resolution map at runtime
        icon: {
          '16x16': './build/icons/icon_16.png',
          '24x24': './build/icons/icon_24.png',
          '32x32': './build/icons/icon_32.png',
          '48x48': './build/icons/icon_48.png',
          '64x64': './build/icons/icon_64.png',
          '128x128': './build/icons/icon_128.png',
          '256x256': './build/icons/icon_256.png',
          '512x512': './build/icons/icon_512.png',
        } as unknown as string,
      },
    }),
    new MakerRpm({
      options: {
        icon: './build/icons/icon.png',
      },
    }),
  ],
  plugins,
};

export default config;
