// ---------------------------------------------------------------------------
// Pinecone Service
// ---------------------------------------------------------------------------
// Manages the Pinecone vector database client and provides helpers for
// upserting FAQ embeddings and querying them during calls.
// ---------------------------------------------------------------------------

import { Pinecone, type Index } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { FaqEntry, KnowledgeResult } from "../utils/types.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

let pineconeClient: Pinecone | null = null;
let openaiClient: OpenAI | null = null;

/** Get the singleton Pinecone client. */
function getPinecone(): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: env.PINECONE_API_KEY });
    logger.info("Pinecone client initialized");
  }
  return pineconeClient;
}

/** Get the singleton OpenAI client (used only for embeddings). */
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/** Get the Pinecone index handle. */
export function getIndex(): Index {
  return getPinecone().index(env.PINECONE_INDEX_NAME);
}

/**
 * Create the Pinecone index if it does not already exist.
 * Uses cosine similarity and the standard embedding dimensions.
 */
export async function ensureIndex(): Promise<void> {
  const pc = getPinecone();
  const indexes = await pc.listIndexes();
  const exists = indexes.indexes?.some((idx) => idx.name === env.PINECONE_INDEX_NAME);

  if (exists) {
    logger.info(`Pinecone index "${env.PINECONE_INDEX_NAME}" already exists`);
    return;
  }

  logger.info(`Creating Pinecone index "${env.PINECONE_INDEX_NAME}"...`);
  await pc.createIndex({
    name: env.PINECONE_INDEX_NAME,
    dimension: EMBEDDING_DIMENSIONS,
    metric: "cosine",
    spec: {
      serverless: {
        cloud: "aws",
        region: "us-east-1",
      },
    },
  });
  logger.info("Pinecone index created successfully");
}

/**
 * Generate an embedding vector for the given text.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Upsert a batch of FAQ entries into Pinecone.
 * Each entry is embedded and stored with its metadata.
 *
 * @param namespace - Optional namespace to isolate entries (e.g. "agno-docs")
 */
export async function upsertFaqs(faqs: FaqEntry[], namespace?: string): Promise<void> {
  const index = namespace ? getIndex().namespace(namespace) : getIndex();

  // Embed all questions in parallel (batches of 10)
  const batchSize = 10;
  for (let i = 0; i < faqs.length; i += batchSize) {
    const batch = faqs.slice(i, i + batchSize);
    const embeddings = await Promise.all(
      batch.map((faq) => embed(`${faq.question} ${faq.answer}`)),
    );

    const vectors = batch.map((faq, idx) => ({
      id: `faq-${i + idx}`,
      values: embeddings[idx],
      metadata: {
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
      },
    }));

    await index.upsert(vectors);
    logger.info(`Upserted batch ${i / batchSize + 1} (${vectors.length} entries)${namespace ? ` [${namespace}]` : ""}`);
  }

  logger.info(`Total entries upserted: ${faqs.length}${namespace ? ` in namespace "${namespace}"` : ""}`);
}

/**
 * Query the knowledge base with a natural language question.
 * Returns the top matches with their answers and relevance scores.
 *
 * @param namespace - Optional namespace to search within (e.g. "agno-docs")
 */
export async function queryKnowledgeBase(
  question: string,
  topK: number = 3,
  namespace?: string,
): Promise<KnowledgeResult[]> {
  const queryVector = await embed(question);
  const index = namespace ? getIndex().namespace(namespace) : getIndex();

  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  return (results.matches ?? []).map((match) => ({
    answer: (match.metadata?.answer as string) ?? "No answer available.",
    score: match.score ?? 0,
    category: (match.metadata?.category as string) ?? "general",
  }));
}
