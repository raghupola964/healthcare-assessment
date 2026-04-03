import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const API_KEY = "ak_f76386b1b822bdebe3174e9f3a6c4b27a0e6cd9ff538ef99";
const BASE_URL = "https://assessment.ksensetech.com/api";

// reuse scoring logic from index.ts (copy-pasted for now, would refactor later)
function getBPScore(bp: string) {
  if (!bp || typeof bp !== "string") return { score: 0, invalid: true };
  const match = bp.trim().match(/^(\d+)\/(\d+)$/);
  if (!match) return { score: 0, invalid: true };
  const sys = parseInt(match[1]);
  const dia = parseInt(match[2]);
  if (sys >= 140 || dia >= 90) return { score: 4, invalid: false };
  if (sys >= 130 || dia >= 80) return { score: 3, invalid: false };
  if (sys >= 120 && dia < 80)  return { score: 2, invalid: false };
  return { score: 1, invalid: false };
}

function getTempScore(temp: any) {
  if (temp === null || temp === undefined || temp === "") return { score: 0, invalid: true, fever: false };
  const t = parseFloat(temp);
  if (isNaN(t)) return { score: 0, invalid: true, fever: false };
  if (t >= 101.0) return { score: 2, invalid: false, fever: true };
  if (t >= 99.6)  return { score: 1, invalid: false, fever: true };
  return { score: 0, invalid: false, fever: false };
}

function getAgeScore(age: any) {
  if (age === null || age === undefined || age === "") return { score: 0, invalid: true };
  const a = parseInt(age);
  if (isNaN(a)) return { score: 0, invalid: true };
  if (a > 65) return { score: 2, invalid: false };
  return { score: 1, invalid: false };
}

// simple in-memory store
let cachedResults: any = null;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// run the full assessment and cache results
app.post("/run", async (req, res) => {
  try {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const patients: any[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const data: any = await axios.get(`${BASE_URL}/patients`, {
        headers: { "x-api-key": API_KEY },
        params: { page, limit: 20 },
      }).then(r => r.data);

      patients.push(...data.data);
      totalPages = data.pagination.totalPages;
      page++;
      await sleep(300);
    }

    const highRisk: string[] = [];
    const feverPatients: string[] = [];
    const dataIssues: string[] = [];

    for (const p of patients) {
      const bp   = getBPScore(p.blood_pressure);
      const temp = getTempScore(p.temperature);
      const age  = getAgeScore(p.age);
      const total = bp.score + temp.score + age.score;

      if (total >= 4) highRisk.push(p.patient_id);
      if (temp.fever) feverPatients.push(p.patient_id);
      if (bp.invalid || temp.invalid || age.invalid) dataIssues.push(p.patient_id);
    }

    cachedResults = {
      total: patients.length,
      high_risk_patients: highRisk,
      fever_patients: feverPatients,
      data_quality_issues: dataIssues,
    };

    res.json(cachedResults);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// get cached results
app.get("/results", (req, res) => {
  if (!cachedResults) return res.status(400).json({ error: "run POST /run first" });
  res.json(cachedResults);
});

// submit to assessment API
app.post("/submit", async (req, res) => {
  if (!cachedResults) return res.status(400).json({ error: "run POST /run first" });

  try {
    const result = await axios.post(
      `${BASE_URL}/submit-assessment`,
      {
        high_risk_patients: cachedResults.high_risk_patients,
        fever_patients: cachedResults.fever_patients,
        data_quality_issues: cachedResults.data_quality_issues,
      },
      { headers: { "Content-Type": "application/json", "x-api-key": API_KEY } }
    );
    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("server running on http://localhost:3000");
});
