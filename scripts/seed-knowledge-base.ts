// ---------------------------------------------------------------------------
// Seed Script: Populate Pinecone Knowledge Base
// ---------------------------------------------------------------------------
// Reads the sample business FAQ from knowledge/bright-smile-dental.md,
// parses it into Q&A entries, embeds them, and upserts into Pinecone.
// Usage: npm run seed
// ---------------------------------------------------------------------------

import "dotenv/config";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ensureIndex, upsertFaqs } from "../src/services/pinecone.js";
import type { FaqEntry } from "../src/utils/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Parse the markdown FAQ file into structured entries.
 *
 * Expected format:
 * ## Category Name
 * **Q: Question text?**
 * Answer text that may span multiple lines.
 */
function parseFaqMarkdown(markdown: string): FaqEntry[] {
  const entries: FaqEntry[] = [];
  let currentCategory = "General";

  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Detect category headers
    if (line.startsWith("## ")) {
      currentCategory = line.replace("## ", "").trim();
      i++;
      continue;
    }

    // Detect question lines
    if (line.startsWith("**Q:") || line.startsWith("**Q.")) {
      const question = line.replace(/^\*\*Q[.:]\s*/, "").replace(/\*\*$/, "").trim();

      // Collect answer lines until the next question or category
      const answerLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (
          nextLine.startsWith("**Q:") ||
          nextLine.startsWith("**Q.") ||
          nextLine.startsWith("## ")
        ) {
          break;
        }
        if (nextLine.length > 0) {
          answerLines.push(nextLine);
        }
        i++;
      }

      const answer = answerLines.join(" ").trim();
      if (question && answer) {
        entries.push({ question, answer, category: currentCategory });
      }
      continue;
    }

    i++;
  }

  return entries;
}

async function main() {
  console.log("Seeding knowledge base...\n");

  // Read the FAQ file
  const faqPath = resolve(__dirname, "../knowledge/bright-smile-dental.md");
  const markdown = readFileSync(faqPath, "utf-8");

  // Parse into structured entries
  const faqs = parseFaqMarkdown(markdown);
  console.log(`Parsed ${faqs.length} FAQ entries from ${faqPath}\n`);

  if (faqs.length === 0) {
    console.error("No FAQ entries found. Check the markdown format.");
    process.exit(1);
  }

  // Log parsed entries for verification
  for (const faq of faqs) {
    console.log(`  [${faq.category}] ${faq.question}`);
  }

  // Ensure the Pinecone index exists
  console.log("\nEnsuring Pinecone index exists...");
  await ensureIndex();

  // Wait a moment for index readiness (new indexes may take a few seconds)
  console.log("Waiting for index to be ready...");
  await new Promise((r) => setTimeout(r, 5000));

  // Upsert FAQ entries
  console.log("\nEmbedding and upserting FAQ entries...");
  await upsertFaqs(faqs);

  console.log("\n--- Seed Complete ---");
  console.log(`${faqs.length} FAQ entries embedded and stored in Pinecone.`);
  console.log("The AI receptionist can now answer questions about your business.");
}

main().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
