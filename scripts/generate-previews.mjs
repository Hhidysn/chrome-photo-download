import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const preview = spawn(process.execPath, ['scripts/preview.mjs'], { cwd: process.cwd() });
let captured = false;

preview.stdout.on('data', (data) => {
  const match = data.toString().match(/http:\/\/127\.0\.0\.1:(\d+)\//);
  if (match && !captured) {
    captured = true;
    const port = match[1];
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    setTimeout(() => {
      // 1. Light mode preview
      const cap1 = spawn(edgePath, [
        '--headless=new',
        '--force-device-scale-factor=1',
        '--hide-scrollbars',
        '--virtual-time-budget=3000',
        '--window-size=500,820',
        '--screenshot=' + path.resolve('docs/assets', 'panel-preview.png'),
        'http://127.0.0.1:' + port + '/panel.html'
      ]);

      cap1.on('close', () => {
        // 2. Compact preview
        const cap2 = spawn(edgePath, [
          '--headless=new',
          '--force-device-scale-factor=1',
          '--hide-scrollbars',
          '--virtual-time-budget=3000',
          '--window-size=460,720',
          '--screenshot=' + path.resolve('docs/assets', 'panel-preview-compact.png'),
          'http://127.0.0.1:' + port + '/responsive.html'
        ]);

        cap2.on('close', () => {
          // 3. Dark mode preview
          const cap3 = spawn(edgePath, [
            '--headless=new',
            '--force-device-scale-factor=1',
            '--hide-scrollbars',
            '--virtual-time-budget=3000',
            '--blink-settings=forceDarkModeEnabled=true',
            '--window-size=500,820',
            '--screenshot=' + path.resolve('docs/assets', 'panel-preview-dark.png'),
            'http://127.0.0.1:' + port + '/panel.html'
          ]);

          cap3.on('close', () => {
            preview.kill();
            console.log('All preview screenshots captured successfully.');
            process.exit(0);
          });
        });
      });
    }, 2000);
  }
});
