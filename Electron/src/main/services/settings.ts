import { BaseConfig } from "../../const.js";
import { getDb } from "./database.js";

export const Settings = {
    /**
     * It searches for a database configuration. If it doesn't exist, it returns the default.
     * Ex: const port = Settings.get('express').port;
     */
    get(key: keyof typeof BaseConfig): any {
        const db = getDb('settings');

        db.prepare(`CREATE TABLE IF NOT EXISTS config (id TEXT PRIMARY KEY, val TEXT)`).run();

        const row = db.prepare('SELECT val FROM config WHERE id = ?').get(key) as { val: string } | undefined;
        
        if (row) {
            return JSON.parse(row.val);
        }

        return BaseConfig[key];
    },

    /**
     * Save a configuration to the database.
     * Ex: Settings.set('express', { ... });
     */
    set(key: keyof typeof BaseConfig, value: any) {
        const db = getDb('settings');
        const jsonValue = JSON.stringify(value);
        
        db.prepare('INSERT OR REPLACE INTO config (id, val) VALUES (?, ?)').run(key, jsonValue);
    }
};
