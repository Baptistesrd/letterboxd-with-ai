// import-watched.mjs
// Usage: node import-watched.mjs
//
// Avant de lancer :
// 1. npm install firebase-admin csv-parse
// 2. Télécharge ta clé de service Firebase (voir instructions ci-dessous)
// 3. Renseigne les variables en haut du fichier

import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ============================================================
// CONFIGURE ICI
// ============================================================
const SERVICE_ACCOUNT_PATH = "./service-account.json"; // clé Firebase Admin (voir README)
const CSV_PATH = "./watched.csv";                        // ton fichier CSV
const TMDB_API_KEY = "REMPLACE_PAR_TA_CLE_TMDB";        // ta clé TMDB
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

  console.log(`📽️  ${records.length} films à importer...`);

  const watchedList = [];
  let notFound = [];

  for (let i = 0; i < records.length; i++) {
    const { Name, Year } = records[i];
    const tmdbId = await getTmdbId(Name, Year);

    if (tmdbId) {
      watchedList.push({ movieID: tmdbId });
      console.log(`✅ [${i + 1}/${records.length}] ${Name} (${Year}) → ID ${tmdbId}`);
    } else {
      notFound.push({ Name, Year });
      console.log(`❌ [${i + 1}/${records.length}] ${Name} (${Year}) → non trouvé`);
    }

    // Respecter le rate limit TMDB (40 req/10s)
    if ((i + 1) % 35 === 0) {
      console.log("⏳ Pause 10s pour le rate limit TMDB...");
      await sleep(10000);
    } else {
      await sleep(100);
    }
  }

  console.log(`\n📦 Import de ${watchedList.length} films dans Firestore...`);

  // Firestore limite les arrayUnion à ~500 éléments par requête
  const chunkSize = 400;
  for (let i = 0; i < watchedList.length; i += chunkSize) {
    const chunk = watchedList.slice(i, i + chunkSize);
    await db.collection("users").doc(USER_UID).update({
      watched: FieldValue.arrayUnion(...chunk),
    });
    console.log(`✅ Chunk ${Math.floor(i / chunkSize) + 1} importé (${chunk.length} films)`);
  }

  console.log("\n🎉 Import terminé !");

  if (notFound.length > 0) {
    console.log(`\n⚠️  ${notFound.length} films non trouvés sur TMDB :`);
    notFound.forEach(({ Name, Year }) => console.log(`  - ${Name} (${Year})`));
  }
}

main().catch(console.error);
