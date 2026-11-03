import cron from "node-cron";
import { runWorkerCycle } from "./tasks";

const SCHEDULE = process.env.WORKER_CRON || "*/10 * * * *";

console.log(`Starting Squad Launch background worker with schedule: ${SCHEDULE}`);

// Run once immediately on startup
runWorkerCycle().catch((err) => {
  console.error("Initial worker run failed:", err);
});

// Schedule recurring cron
cron.schedule(SCHEDULE, () => {
  runWorkerCycle().catch((err) => {
    console.error("Scheduled worker cycle failed:", err);
  });
});
