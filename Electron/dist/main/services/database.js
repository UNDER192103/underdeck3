import Database from 'better-sqlite3';
import electron from 'electron';
import path from 'path';
import fs from 'fs';
import logger from '../../communs/logger.js';
const { app } = electron;
// Objeto para armazenar as conexões abertas (cache)
const connections = {};
/**
 * Obtém ou cria uma conexão com um banco de dados específico.
 * @param dbName Nome do arquivo (ex: 'config', 'main', 'logs')
 */
export const getDb = (dbName = 'main') => {
    // 1. Se a conexão já existe no cache, retorna ela imediatamente
    if (connections[dbName]) {
        return connections[dbName];
    }
    // 2. Define o caminho: AppData/Roaming/SeuApp/database/nome.sqlite
    const fileName = `${dbName}.sqlite`;
    const dbPath = path.join(app.getPath('userData'), 'database', fileName);
    const dbDir = path.dirname(dbPath);
    // 3. Garante que a pasta existe
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    // 4. Cria a nova conexão e guarda no cache
    const db = new Database(dbPath, {
        verbose: logger.log,
    });
    connections[dbName] = db;
    return db;
};
