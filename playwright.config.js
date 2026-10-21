import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./e2e',use:{baseURL:'http://localhost:3000',headless:true},webServer:{command:'npm run dev',url:'http://localhost:3000',reuseExistingServer:true},reporter:'list'});
