import axios from "axios";

const API_KEY = "ak_f76386b1b822bdebe3174e9f3a6c4b27a0e6cd9ff538ef99";
const BASE_URL = "https://assessment.ksensetech.com/api";

// patient type based on API docs
interface Patient {
  patient_id: string;
  name: string;
  age: any;
  blood_pressure: string;
  temperature: any;
}

// sleep helper for retries
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch with basic retry logic (api has ~8% failure rate)
async function fetchWithRetry(url: string, options: any, retries = 4): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, options);
      return res.data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429 || status === 500 || status === 503) {
        console.log(`  retry ${i + 1} after ${status}...`);
        await sleep((i + 1) * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("max retries reached");
}

// get all patients across all pages
async function getAllPatients(): Promise<Patient[]> {
  const patients: Patient[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    console.log(`fetching page ${page}/${totalPages}...`);

    const data = await fetchWithRetry(
      `${BASE_URL}/patients`,
      {
        headers: { "x-api-key": API_KEY },
        params: { page, limit: 20 },
      }
    );

    patients.push(...data.data);
    totalPages = data.pagination.totalPages;
    page++;

    await sleep(300); // avoid rate limit
  }

  return patients;
}

// --- scoring functions ---

function getBPScore(bp: string): { score: number; invalid: boolean } {
  if (!bp || typeof bp !== "string") return { score: 0, invalid: true };

  const match = bp.trim().match(/^(\d+)\/(\d+)$/);
  if (!match) return { score: 0, invalid: true }; // handles "150/" "/90" "N/A" etc

  const sys = parseInt(match[1]);
  const dia = parseInt(match[2]);

  if (sys >= 140 || dia >= 90) return { score: 4, invalid: false }; // stage 2
  if (sys >= 130 || dia >= 80) return { score: 3, invalid: false }; // stage 1
  if (sys >= 120 && sys <= 129 && dia < 80) return { score: 2, invalid: false };  // elevated
  return { score: 1, invalid: false };                               // normal
}

function getTempScore(temp: any): { score: number; invalid: boolean; fever: boolean } {
  if (temp === null || temp === undefined || temp === "") {
    return { score: 0, invalid: true, fever: false };
  }

  const t = parseFloat(temp);
  if (isNaN(t)) return { score: 0, invalid: true, fever: false };

  if (t >= 101.0) return { score: 2, invalid: false, fever: true };
  if (t >= 99.6)  return { score: 1, invalid: false, fever: true };
  return { score: 0, invalid: false, fever: false };
}

function getAgeScore(age: any): { score: number; invalid: boolean } {
  if (age === null || age === undefined || age === "") {
    return { score: 0, invalid: true };
  }

  const a = parseInt(age);
  if (isNaN(a)) return { score: 0, invalid: true }; // "fifty-three" etc

  if (a > 65) return { score: 2, invalid: false };
  return { score: 1, invalid: false }; // both <40 and 40-65 = 1 point
}

// main logic
async function main() {
  console.log("=== Healthcare Assessment ===\n");

  const patients = await getAllPatients();
  console.log(`\ntotal patients: ${patients.length}\n`);

  const highRisk: string[] = [];
  const feverPatients: string[] = [];
  const dataIssues: string[] = [];

  for (const p of patients) {
    const bp   = getBPScore(p.blood_pressure);
    const temp = getTempScore(p.temperature);
    const age  = getAgeScore(p.age);

    const total = bp.score + temp.score + age.score;
    const hasIssue = bp.invalid || temp.invalid || age.invalid;

    if (total >= 4) highRisk.push(p.patient_id);
    if (temp.fever) feverPatients.push(p.patient_id);
    if (hasIssue)   dataIssues.push(p.patient_id);

    // quick debug log per patient
    console.log(
      `${p.patient_id} | bp:${bp.score} temp:${temp.score} age:${age.score} = ${total}` +
      (hasIssue ? " [INVALID DATA]" : "") +
      (temp.fever ? " [FEVER]" : "")
    );
  }

  console.log("\n--- Results ---");
  console.log(`High Risk (>=4):     ${highRisk.length} patients`, highRisk);
  console.log(`Fever (>=99.6):      ${feverPatients.length} patients`, feverPatients);
  console.log(`Data Quality Issues: ${dataIssues.length} patients`, dataIssues);

  // submit
  console.log("\nsubmitting...");
  const res = await axios.post(
    `${BASE_URL}/submit-assessment`,
    {
      high_risk_patients: highRisk,
      fever_patients: feverPatients,
      data_quality_issues: dataIssues,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
    }
  );

  console.log("\n=== Submission Result ===");
  console.log(JSON.stringify(res.data, null, 2));
}

main().catch(console.error);
