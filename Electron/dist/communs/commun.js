import { app } from 'electron';
import fs from 'node:fs';
import path from 'path';
export const getAssetPath = (...paths) => {
    const isDev = !app.isPackaged;
    if (isDev) {
        return path.join(process.cwd(), 'assets', ...paths);
    }
    const candidates = [
        path.join(app.getAppPath(), 'assets', ...paths),
        path.join(process.resourcesPath, 'assets', ...paths),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', ...paths),
    ];
    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
};
