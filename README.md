# Healthcare API Assessment

TypeScript + Express solution for the DemoMed API assessment.

## Setup

```bash
npm install
```

## Run

**Option 1 - CLI (fetches, scores and submits automatically):**
```bash
npx ts-node src/index.ts
```

**Option 2 - Express server:**
```bash
npx ts-node src/server.ts
```

Then use these endpoints:
- `GET /health` - health check
- `POST /run` - fetch all patients and score them
- `GET /results` - see the scored results
- `POST /submit` - submit to assessment API

## How scoring works

- **Blood Pressure**: Normal=1, Elevated=2, Stage1=3, Stage2=4, Invalid=0
- **Temperature**: Normal=0, Low Fever (99.6-100.9)=1, High Fever (>=101)=2, Invalid=0  
- **Age**: Under/equal 65=1, Over 65=2, Invalid=0
- **High Risk** = total score >= 4
- **Fever** = temp >= 99.6
- **Data Quality Issue** = any field is missing or invalid
