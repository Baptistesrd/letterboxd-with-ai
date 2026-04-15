// import-watched.mjs
// Usage: node import-watched.mjs
//
// Avant de lancer :
// 1. npm install firebase-admin csv-parse
// 2. TÃ©lÃ©charge ta clÃ© de service Firebase (voir instructions ci-dessous)
// 3. Renseigne les variables en haut du fichier

import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ============================================================
// CONFIGURE ICI
// ============================================================
const SERVICE_ACCOUNT_PATH = "./service-account.json"; // clÃ© Firebase Admin (voir README)
const CSV_PATH = "./watched.csv";                        // ton fichier CSV
const TMDB_API_KEY = "5c8c1fbb837d1ab120b1db2a8acba21a";        // ta clÃ© TMDB
const USER_UID = "SUS1NtIgjfZRrCIdBfVieKlpJDb2";                 // ton UID Firebase (visible dans Authentication > Users)
// ============================================================

initializeApp({ credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH))) });
const db = getFirestore();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTmdbId(title, year) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&year=${year}&language=en-US`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.results && data.results.length > 0) {
    return data.results[0].id.toString();
  }
  // retry without year if no result
  const url2 = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
  const res2 = await fetch(url2);
  const data2 = await res2.json();
  return data2.results?.[0]?.id?.toString() ?? null;
}

async function main() {
  const csv = readFileSync(CSV_PATH, "utf-8");
  const records = parse(csv, { columns: true, skip_empty_lines: true });

  console.log(`ðŸ“½ï¸  ${records.length} films Ã  importer...`);

  const watchedList = [];
  let notFound = [];

  for (let i = 0; i < records.length; i++) {
    const { Name, Year } = records[i];
    const tmdbId = await getTmdbId(Name, Year);

    if (tmdbId) {
      watchedList.push({ movieID: tmdbId });
      console.log(`âœ… [${i + 1}/${records.length}] ${Name} (${Year}) â†’ ID ${tmdbId}`);
    } else {
      notFound.push({ Name, Year });
      console.log(`âŒ [${i + 1}/${records.length}] ${Name} (${Year}) â†’ non trouvÃ©`);
    }

    // Respecter le rate limit TMDB (40 req/10s)
    if ((i + 1) % 35 === 0) {
      console.log("â³ Pause 10s pour le rate limit TMDB...");
      await sleep(10000);
    } else {
      await sleep(100);
    }
  }

  console.log(`\nðŸ“¦ Import de ${watchedList.length} films dans Firestore...`);

  // Firestore limite les arrayUnion Ã  ~500 Ã©lÃ©ments par requÃªte
  const chunkSize = 400;
  for (let i = 0; i < watchedList.length; i += chunkSize) {
    const chunk = watchedList.slice(i, i + chunkSize);
    await db.collection("users").doc(USER_UID).update({
      watched: FieldValue.arrayUnion(...chunk),
    });
    console.log(`âœ… Chunk ${Math.floor(i / chunkSize) + 1} importÃ© (${chunk.length} films)`);
  }

  console.log("\nðŸŽ‰ Import terminÃ© !");

  if (notFound.length > 0) {
    console.log(`\nâš ï¸  ${notFound.length} films non trouvÃ©s sur TMDB :`);
    notFound.forEach(({ Name, Year }) => console.log(`  - ${Name} (${Year})`));
  }
}

main().catch(console.error);

