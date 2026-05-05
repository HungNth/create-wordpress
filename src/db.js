import fs from 'fs';
import mysql from 'mysql2/promise';

/**
 * Creates and returns a mysql2 connection based on config.
 * Uses socket on macOS if db_socket is set; otherwise TCP.
 * @param {object} config
 * @returns {Promise<import('mysql2/promise').Connection>}
 */
export async function createDbConnection(config) {
	const connectionOptions = {
		port: config.database_port || 3306,
		user: config.db_username || 'root',
		password: config.db_password || '',
	};

	// Use Unix socket on non-Windows if configured
	if (config.db_socket && process.platform !== 'win32') {
		connectionOptions.socketPath = config.db_socket;
	} else {
		connectionOptions.host = '127.0.0.1';
	}

	try {
		const connection = await mysql.createConnection(connectionOptions);
		return connection;
	} catch (err) {
		throw new Error(`Cannot connect to MySQL: ${err.message}`);
	}
}

/**
 * Checks whether a database with the given name already exists.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} dbName
 * @returns {Promise<boolean>}
 */
export async function databaseExists(connection, dbName) {
	const [rows] = await connection.execute(
		'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
		[dbName]
	);
	return rows.length > 0;
}

/**
 * Creates a new database with utf8mb4 charset.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} dbName
 */
export async function createDatabase(connection, dbName) {
	await connection.execute(
		`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
	);
}

/**
 * Imports a SQL dump file directly via mysql2 (bypasses WP-CLI and avoids
 * Windows backslash / escape-sequence issues with `wp db import`).
 *
 * Steps:
 *   1. Connect with multipleStatements enabled
 *   2. Drop + recreate the target database (ensures clean slate)
 *   3. Switch to the database
 *   4. Execute the full SQL file content
 *
 * @param {string} sqlFilePath  Absolute path to the .sql file
 * @param {string} dbName       Target database name
 * @param {object} config       App config (db_username, db_password, database_port, db_socket)
 */
export async function importSqlFile(sqlFilePath, dbName, config) {
	const connectionOptions = {
		port: config.database_port || 3306,
		user: config.db_username || 'root',
		password: config.db_password || '',
		multipleStatements: true,
	};

	if (config.db_socket && process.platform !== 'win32') {
		connectionOptions.socketPath = config.db_socket;
	} else {
		connectionOptions.host = '127.0.0.1';
	}

	const conn = await mysql.createConnection(connectionOptions);
	try {
		// 1. Drop the database that wp core install already populated
		await conn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``);
		// 2. Recreate it clean
		await conn.execute(
			`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
		);
		// 3. Select it
		await conn.execute(`USE \`${dbName}\``);
		// 4. Execute the SQL dump
		const sql = fs.readFileSync(sqlFilePath, 'utf-8');
		await conn.query(sql);
	} finally {
		await conn.end();
	}
}

/**
 * Detects the WordPress table prefix used inside an already-imported database.
 * Looks for a table named `{prefix}options` — every WP install has one.
 *
 * @param {string} dbName   Database name to inspect
 * @param {object} config   App config
 * @returns {Promise<string>} Detected prefix, e.g. 'wpry_'. Falls back to 'wp_'.
 */
export async function detectTablePrefix(dbName, config) {
	const connectionOptions = {
		port: config.database_port || 3306,
		user: config.db_username || 'root',
		password: config.db_password || '',
		database: dbName,
	};

	if (config.db_socket && process.platform !== 'win32') {
		connectionOptions.socketPath = config.db_socket;
	} else {
		connectionOptions.host = '127.0.0.1';
	}

	const conn = await mysql.createConnection(connectionOptions);
	try {
		const [rows] = await conn.execute(
			`SELECT TABLE_NAME FROM information_schema.TABLES
			 WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE '%options'
			 ORDER BY TABLE_NAME LIMIT 1`,
			[dbName]
		);
		if (rows.length > 0) {
			// e.g. 'wpry_options' → 'wpry_'
			return rows[0].TABLE_NAME.replace(/options$/, '');
		}
		return 'wp_';
	} finally {
		await conn.end();
	}
}
