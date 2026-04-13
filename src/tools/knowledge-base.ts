// ---------------------------------------------------------------------------
// Knowledge Base Tool (RAG)
// ---------------------------------------------------------------------------
// Queries the Pinecone vector database to answer caller questions about the
// business (insurance, pricing, policies, procedures, etc.).
// ---------------------------------------------------------------------------

import { queryKnowledgeBase } from "../services/pinecone.js";
import { logger } from "../utils/logger.js";

/**
 * Look up an answer to the caller's question from the knowledge base.
 *
 * Returns a synthesised answer from the top matching FAQ entries, along with
 * context about the match quality so the LLM can decide how confident to be.
 */
export async function lookupFaq(
  question: string,
): Promise<{ found: boolean; answer: string; sources: string[] }> {
  try {
    const results = await queryKnowledgeBase(question, 3);

    if (results.length === 0 || results[0].score < 0.3) {
      logger.info("No relevant FAQ found for question", { question });
      return {
        found: false,
        answer:
          "I don't have specific information about that in our system. " +
          "I can have someone from the office call you back with the details. " +
          "Would that work for you?",
        sources: [],
      };
    }

    // Use the best match as the primary answer
    const bestMatch = results[0];

    // Collect all relevant answers for context
    const relevantResults = results.filter((r) => r.score >= 0.5);
    const combinedAnswer =
      relevantResults.length > 1
        ? relevantResults.map((r) => r.answer).join(" Additionally, ")
        : bestMatch.answer;

    logger.info("FAQ lookup successful", {
      question,
      topScore: bestMatch.score,
      category: bestMatch.category,
      matchCount: relevantResults.length,
    });

    return {
      found: true,
      answer: combinedAnswer,
      sources: relevantResults.map((r) => r.category),
    };
  } catch (error) {
    logger.error("Knowledge base query failed", {
      error: error instanceof Error ? error.message : String(error),
      question,
    });

    return {
      found: false,
      answer:
        "I'm having trouble looking that up right now. " +
        "Let me have someone from the office get back to you with that information.",
      sources: [],
    };
  }
}
