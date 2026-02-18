import fs from "fs";
import path from "path";
import { Pool } from "pg";
import QRCode from "qrcode";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const eq = normalized.indexOf("=");
    if (eq < 1) {
      continue;
    }

    const key = normalized.slice(0, eq).trim();
    let value = normalized.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const cwd = process.cwd();
loadEnvFile(path.join(cwd, ".env.local"));
loadEnvFile(path.join(cwd, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  const rows = await client.query(
    `SELECT id FROM items
     WHERE qr_code_url IS NULL
        OR qr_code_url NOT LIKE 'data:image/%'`
  );

  let updated = 0;
  for (const row of rows.rows) {
    const itemUrl = `${baseUrl}/items/${row.id}`;
    const qrDataUrl = await QRCode.toDataURL(itemUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320
    });

    await client.query(`UPDATE items SET qr_code_url = $1, updated_at = now() WHERE id = $2`, [qrDataUrl, row.id]);
    updated += 1;
  }

  console.log(`Repaired QR image data for ${updated} item(s).`);
} finally {
  client.release();
  await pool.end();
}
