import crypto from "crypto";
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

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pick(arr) {
  return arr[randomInt(arr.length)];
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makePhone() {
  const area = 201 + randomInt(700);
  const part1 = 100 + randomInt(800);
  const part2 = 1000 + randomInt(9000);
  return `${area}-${part1}-${part2}`;
}

function tokenHash() {
  const token = crypto.randomBytes(24).toString("hex");
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makePhotoDataUrl(label) {
  const safe = label.replace(/[^a-zA-Z0-9 +_-]/g, "").slice(0, 24);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#e2d2b2'/><stop offset='100%' stop-color='#b8d5ce'/></linearGradient></defs><rect width='640' height='360' fill='url(#g)'/><text x='28' y='200' font-size='38' fill='#1f2a2b' font-family='Verdana'>${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const cwd = process.cwd();
loadEnvFile(path.join(cwd, ".env.local"));
loadEnvFile(path.join(cwd, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Add it to .env.local or export it in your shell.");
  process.exit(1);
}

const runTag = Date.now().toString(36);
const userTarget = Number(process.env.SEED_USERS ?? 12);
const itemTarget = Number(process.env.SEED_ITEMS ?? 16);
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

const firstNames = [
  "Ava",
  "Mason",
  "Sofia",
  "Liam",
  "Harper",
  "Ethan",
  "Mila",
  "Noah",
  "Ivy",
  "Lucas",
  "Camila",
  "Aria",
  "Elijah",
  "Nora",
  "Leo",
  "Layla"
];

const lastNames = [
  "Rivera",
  "Patel",
  "Nguyen",
  "Jackson",
  "Khan",
  "Wright",
  "Lopez",
  "Bennett",
  "Miller",
  "Kim",
  "Singh",
  "Brooks"
];

const neighborhoods = ["Ladd Park"];

const categories = ["Tools", "Kitchen", "Garden", "Party", "Sports", "Kids", "Electronics"];

const titles = [
  "Cordless Drill",
  "Pressure Washer",
  "Foldable Tables",
  "Camping Lantern Set",
  "Mixer + Baking Kit",
  "Projector",
  "Leaf Blower",
  "Lawn Aerator",
  "Soccer Goal Set",
  "Popcorn Machine",
  "Carpet Cleaner",
  "Step Ladder"
];

const descriptions = [
  "Well-maintained and ready for weekend projects.",
  "Works great for short-term home or yard jobs.",
  "Cleaned after each use and easy to transport.",
  "Comes with basic accessories for typical tasks.",
  "Great option when you only need it for a day or two."
];

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

const summary = {
  usersCreated: 0,
  itemsCreated: 0,
  waitlistEntriesCreated: 0,
  transfersCreated: 0,
  tokensCreated: 0
};

try {
  await client.query("BEGIN");

  let primaryUser = null;
  if (process.env.SEED_OWNER_EMAIL) {
    const existing = await client.query(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [process.env.SEED_OWNER_EMAIL]);
    primaryUser = existing.rows[0] ?? null;
  }

  if (!primaryUser) {
    const existingAny = await client.query(`SELECT * FROM users ORDER BY created_at ASC LIMIT 1`);
    primaryUser = existingAny.rows[0] ?? null;
  }

  if (!primaryUser) {
    const fallbackEmail = `primary-${runTag}@neighborly.seed`;
    const inserted = await client.query(
      `INSERT INTO users (email, display_name, phone, neighborhood)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [fallbackEmail, "Primary Neighbor", makePhone(), pick(neighborhoods)]
    );
    primaryUser = inserted.rows[0];
    summary.usersCreated += 1;
  }

  const users = [primaryUser];

  for (let i = 0; i < userTarget; i += 1) {
    const name = `${pick(firstNames)} ${pick(lastNames)}`;
    const email = `seed-${runTag}-${i + 1}@neighborly.seed`;
    const inserted = await client.query(
      `INSERT INTO users (email, display_name, phone, neighborhood)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, name, makePhone(), pick(neighborhoods)]
    );
    if (Math.random() < 0.5) {
      await client.query(`UPDATE users SET tips_enabled = true, tip_url = $1 WHERE id = $2`, [
        `https://example.com/tip/${inserted.rows[0].id.slice(0, 8)}`,
        inserted.rows[0].id
      ]);
      inserted.rows[0].tips_enabled = true;
      inserted.rows[0].tip_url = `https://example.com/tip/${inserted.rows[0].id.slice(0, 8)}`;
    }
    users.push(inserted.rows[0]);
    summary.usersCreated += 1;
  }

  const scenarios = [
    {
      owner: primaryUser,
      status: "available"
    },
    {
      owner: primaryUser,
      status: "checked_out",
      holder: users.find((u) => u.id !== primaryUser.id)
    },
    {
      owner: users.find((u) => u.id !== primaryUser.id),
      status: "checked_out",
      holder: primaryUser
    },
    {
      owner: primaryUser,
      status: "inactive"
    }
  ];

  const allItems = [];

  for (let i = 0; i < itemTarget; i += 1) {
    const scenario = scenarios[i] ?? null;

    const owner = scenario?.owner ?? pick(users);
    const status =
      scenario?.status ?? pick(["available", "available", "checked_out", "checked_out", "inactive"]);

    let holder = null;
    if (status === "checked_out") {
      if (scenario?.holder && scenario.holder.id !== owner.id) {
        holder = scenario.holder;
      } else {
        const candidates = users.filter((u) => u.id !== owner.id);
        holder = pick(candidates);
      }
    }

    const title = pick(titles);
    const itemInsert = await client.query(
      `INSERT INTO items (owner_id, title, description, category, pickup_area, status, current_holder_id, qr_code_url, photo_url, borrow_duration_days)
       VALUES ($1, $2, $3, $4, $5, $6::item_status, $7, $8, $9, $10)
       RETURNING *`,
      [
        owner.id,
        title,
        pick(descriptions),
        pick(categories),
        owner.neighborhood ?? pick(neighborhoods),
        status,
        holder?.id ?? null,
        null,
        makePhotoDataUrl(title),
        3 + randomInt(12)
      ]
    );

    const item = itemInsert.rows[0];
    allItems.push({ item, owner, holder });
    summary.itemsCreated += 1;

    await client.query(
      `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, initiated_at, accepted_at)
       VALUES ($1, NULL, $2, 'create', 'completed', now() - interval '12 days', now() - interval '12 days')`,
      [item.id, owner.id]
    );
    summary.transfersCreated += 1;

    if (holder) {
      await client.query(
        `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, initiated_at, accepted_at)
         VALUES ($1, $2, $3, 'checkout', 'completed', now() - interval '6 days', now() - interval '6 days')`,
        [item.id, owner.id, holder.id]
      );
      summary.transfersCreated += 1;

      if (Math.random() < 0.4) {
        const passCandidates = users.filter((u) => u.id !== owner.id && u.id !== holder.id);
        const nextHolder = pick(passCandidates);
        await client.query(
          `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, initiated_at, accepted_at)
           VALUES ($1, $2, $3, 'pass', 'completed', now() - interval '2 days', now() - interval '2 days')`,
          [item.id, holder.id, nextHolder.id]
        );
        await client.query(
          `UPDATE items SET current_holder_id = $1, updated_at = now() WHERE id = $2`,
          [nextHolder.id, item.id]
        );
        holder = nextHolder;
        summary.transfersCreated += 1;
      }
    }

    const itemUrl = `${baseUrl}/items/${item.id}`;
    const qrDataUrl = await QRCode.toDataURL(itemUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320
    });
    await client.query(`UPDATE items SET qr_code_url = $1 WHERE id = $2`, [qrDataUrl, item.id]);

    const waitlistCandidates = shuffle(users).filter((u) => u.id !== owner.id && u.id !== (holder?.id ?? ""));
    const waitingCount = randomInt(4);

    for (let pos = 0; pos < waitingCount; pos += 1) {
      const u = waitlistCandidates[pos];
      if (!u) {
        continue;
      }

      await client.query(
        `INSERT INTO waitlist_entries (item_id, user_id, status, position, created_at)
         VALUES ($1, $2, 'waiting', $3, now() - ($4 || ' hours')::interval)`,
        [item.id, u.id, pos + 1, String(48 - pos * 2)]
      );
      summary.waitlistEntriesCreated += 1;
    }

    const fulfilledCandidate = waitlistCandidates[waitingCount];
    if (fulfilledCandidate && Math.random() < 0.35) {
      await client.query(
        `INSERT INTO waitlist_entries (item_id, user_id, status, position)
         VALUES ($1, $2, 'fulfilled', NULL)`,
        [item.id, fulfilledCandidate.id]
      );
      summary.waitlistEntriesCreated += 1;
    }

    const removedCandidate = waitlistCandidates[waitingCount + 1];
    if (removedCandidate && Math.random() < 0.35) {
      await client.query(
        `INSERT INTO waitlist_entries (item_id, user_id, status, position)
         VALUES ($1, $2, 'removed', NULL)`,
        [item.id, removedCandidate.id]
      );
      summary.waitlistEntriesCreated += 1;
    }

    if (holder && Math.random() < 0.45) {
      const pendingRecipient = waitlistCandidates[0];
      if (pendingRecipient && pendingRecipient.id !== holder.id) {
        const pendingTransfer = await client.query(
          `INSERT INTO transfers (item_id, from_user_id, to_user_id, type, status, initiated_at)
           VALUES ($1, $2, $3, 'pass', 'pending_accept', now() - interval '1 hour')
           RETURNING id`,
          [item.id, holder.id, pendingRecipient.id]
        );
        summary.transfersCreated += 1;

        await client.query(
          `INSERT INTO tokens (item_id, transfer_id, token_hash, purpose, expires_at)
           VALUES ($1, $2, $3, 'handoff_accept', now() + interval '48 hours')`,
          [item.id, pendingTransfer.rows[0].id, tokenHash()]
        );
        summary.tokensCreated += 1;
      }
    }
  }

  await client.query("COMMIT");

  console.log("Seed complete.");
  console.log(`Run tag: ${runTag}`);
  console.log(`Primary user: ${primaryUser.email}`);
  console.log(`Users created: ${summary.usersCreated}`);
  console.log(`Items created: ${summary.itemsCreated}`);
  console.log(`Waitlist entries created: ${summary.waitlistEntriesCreated}`);
  console.log(`Transfers created: ${summary.transfersCreated}`);
  console.log(`Tokens created: ${summary.tokensCreated}`);
  console.log("Tip: set SEED_OWNER_EMAIL to force ownership for a specific account.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
