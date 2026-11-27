import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',workers:1,use:{baseURL:'http://127.0.0.1:4189',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},webServer:{command:'node scripts/test-server.mjs',url:'http://127.0.0.1:4189',reuseExistingServer:false}});
