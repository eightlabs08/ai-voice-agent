// ---------------------------------------------------------------------------
// Tests: src/services/pinecone.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FaqEntry } from "../utils/types.js";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("../config/env.js", () => ({
  env: {
    PINECONE_API_KEY: "pc-test-key",
    PINECONE_INDEX_NAME: "test-index",
    OPENAI_API_KEY: "sk-openai-test",
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Mock Pinecone client
const mockListIndexes = vi.fn();
const mockCreateIndex = vi.fn();
const mockUpsert = vi.fn();
const mockQuery = vi.fn();
const mockIndexFn = vi.fn().mockReturnValue({
  upsert: mockUpsert,
  query: mockQuery,
});

vi.mock("@pinecone-database/pinecone", () => {
  const Pinecone = vi.fn(function (this: unknown) {
    Object.assign(this as object, {
      listIndexes: mockListIndexes,
      createIndex: mockCreateIndex,
      index: mockIndexFn,
    });
  });
  return { Pinecone };
});

// Mock OpenAI client
const mockEmbeddingsCreate = vi.fn();
vi.mock("openai", () => {
  const OpenAI = vi.fn(function (this: unknown) {
    Object.assign(this as object, {
      embeddings: { create: mockEmbeddingsCreate },
    });
  });
  return { default: OpenAI };
});

// Import after mocks
const { ensureIndex, embed, upsertFaqs, queryKnowledgeBase, getIndex } = await import(
  "./pinecone.js"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getIndex", () => {
  it("returns the Pinecone index handle for the configured index name", () => {
    const index = getIndex();
    expect(mockIndexFn).toHaveBeenCalledWith("test-index");
    expect(index).toBeDefined();
  });
});

describe("ensureIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexFn.mockReturnValue({ upsert: mockUpsert, query: mockQuery });
  });

  it("does not create a new index when it already exists", async () => {
    mockListIndexes.mockResolvedValue({
      indexes: [{ name: "test-index" }],
    });

    await ensureIndex();

    expect(mockCreateIndex).not.toHaveBeenCalled();
  });

  it("creates the index when it does not exist", async () => {
    mockListIndexes.mockResolvedValue({ indexes: [] });
    mockCreateIndex.mockResolvedValue(undefined);

    await ensureIndex();

    expect(mockCreateIndex).toHaveBeenCalledOnce();
    const createArgs = mockCreateIndex.mock.calls[0][0];
    expect(createArgs.name).toBe("test-index");
  });

  it("creates the index with cosine metric", async () => {
    mockListIndexes.mockResolvedValue({ indexes: [] });
    mockCreateIndex.mockResolvedValue(undefined);

    await ensureIndex();

    const createArgs = mockCreateIndex.mock.calls[0][0];
    expect(createArgs.metric).toBe("cosine");
  });

  it("creates the index with 1536 dimensions", async () => {
    mockListIndexes.mockResolvedValue({ indexes: [] });
    mockCreateIndex.mockResolvedValue(undefined);

    await ensureIndex();

    const createArgs = mockCreateIndex.mock.calls[0][0];
    expect(createArgs.dimension).toBe(1536);
  });

  it("creates the index on AWS serverless in us-east-1", async () => {
    mockListIndexes.mockResolvedValue({ indexes: [] });
    mockCreateIndex.mockResolvedValue(undefined);

    await ensureIndex();

    const createArgs = mockCreateIndex.mock.calls[0][0];
    expect(createArgs.spec.serverless.cloud).toBe("aws");
    expect(createArgs.spec.serverless.region).toBe("us-east-1");
  });

  it("handles a null indexes list gracefully", async () => {
    mockListIndexes.mockResolvedValue({ indexes: null });
    mockCreateIndex.mockResolvedValue(undefined);

    await ensureIndex();

    // indexes?.some with null should not throw; should create
    expect(mockCreateIndex).toHaveBeenCalled();
  });
});

describe("embed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexFn.mockReturnValue({ upsert: mockUpsert, query: mockQuery });
  });

  it("returns the embedding vector from OpenAI", async () => {
    const fakeVector = Array.from({ length: 1536 }, (_, i) => i * 0.001);
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: fakeVector }],
    });

    const result = await embed("What are your hours?");

    expect(result).toEqual(fakeVector);
    expect(result).toHaveLength(1536);
  });

  it("calls OpenAI with the text-embedding-3-small model", async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    await embed("Test input");

    const createArgs = mockEmbeddingsCreate.mock.calls[0][0];
    expect(createArgs.model).toBe("text-embedding-3-small");
  });

  it("passes the input text to the embeddings API", async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
    });

    await embed("Do you accept Medicare?");

    const createArgs = mockEmbeddingsCreate.mock.calls[0][0];
    expect(createArgs.input).toBe("Do you accept Medicare?");
  });

  it("propagates errors from the OpenAI API", async () => {
    mockEmbeddingsCreate.mockRejectedValue(new Error("OpenAI quota exceeded"));

    await expect(embed("any text")).rejects.toThrow("OpenAI quota exceeded");
  });
});

describe("upsertFaqs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexFn.mockReturnValue({ upsert: mockUpsert, query: mockQuery });
  });

  const makeFaq = (i: number): FaqEntry => ({
    question: `Question ${i}`,
    answer: `Answer ${i}`,
    category: `category-${i % 3}`,
  });

  it("embeds each FAQ and upserts vectors to Pinecone", async () => {
    const fakeVector = [0.1, 0.2, 0.3];
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: fakeVector }] });
    mockUpsert.mockResolvedValue(undefined);

    const faqs: FaqEntry[] = [makeFaq(0), makeFaq(1)];
    await upsertFaqs(faqs);

    expect(mockUpsert).toHaveBeenCalledOnce();
    const vectors = mockUpsert.mock.calls[0][0];
    expect(vectors).toHaveLength(2);
  });

  it("assigns sequential IDs starting from faq-0", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockUpsert.mockResolvedValue(undefined);

    const faqs = [makeFaq(0), makeFaq(1), makeFaq(2)];
    await upsertFaqs(faqs);

    const vectors = mockUpsert.mock.calls[0][0];
    expect(vectors[0].id).toBe("faq-0");
    expect(vectors[1].id).toBe("faq-1");
    expect(vectors[2].id).toBe("faq-2");
  });

  it("stores question, answer, and category as metadata", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.5] }] });
    mockUpsert.mockResolvedValue(undefined);

    const faqs: FaqEntry[] = [
      { question: "Do you accept Medicaid?", answer: "Yes, we do.", category: "insurance" },
    ];
    await upsertFaqs(faqs);

    const vectors = mockUpsert.mock.calls[0][0];
    expect(vectors[0].metadata.question).toBe("Do you accept Medicaid?");
    expect(vectors[0].metadata.answer).toBe("Yes, we do.");
    expect(vectors[0].metadata.category).toBe("insurance");
  });

  it("embeds using combined question + answer text", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockUpsert.mockResolvedValue(undefined);

    const faq: FaqEntry = {
      question: "What is your address?",
      answer: "742 Evergreen Terrace.",
      category: "location",
    };
    await upsertFaqs([faq]);

    const embedCall = mockEmbeddingsCreate.mock.calls[0][0];
    expect(embedCall.input).toBe("What is your address? 742 Evergreen Terrace.");
  });

  it("processes FAQs in batches of 10", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockUpsert.mockResolvedValue(undefined);

    const faqs = Array.from({ length: 25 }, (_, i) => makeFaq(i));
    await upsertFaqs(faqs);

    // Should call upsert 3 times: batches of 10, 10, 5
    expect(mockUpsert).toHaveBeenCalledTimes(3);
  });

  it("handles an empty FAQ array without errors", async () => {
    await upsertFaqs([]);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("queryKnowledgeBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexFn.mockReturnValue({ upsert: mockUpsert, query: mockQuery });
  });

  it("returns mapped results with answer, score, and category", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
    mockQuery.mockResolvedValue({
      matches: [
        {
          id: "faq-0",
          score: 0.9,
          metadata: { answer: "We accept Delta Dental.", category: "insurance", question: "Q" },
        },
        {
          id: "faq-1",
          score: 0.7,
          metadata: { answer: "PPO plans accepted.", category: "insurance", question: "Q2" },
        },
      ],
    });

    const results = await queryKnowledgeBase("What insurance?", 2);

    expect(results).toHaveLength(2);
    expect(results[0].answer).toBe("We accept Delta Dental.");
    expect(results[0].score).toBe(0.9);
    expect(results[0].category).toBe("insurance");
  });

  it("uses topK parameter in the Pinecone query", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockQuery.mockResolvedValue({ matches: [] });

    await queryKnowledgeBase("Question?", 5);

    const queryArgs = mockQuery.mock.calls[0][0];
    expect(queryArgs.topK).toBe(5);
  });

  it("includes metadata in the Pinecone query", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockQuery.mockResolvedValue({ matches: [] });

    await queryKnowledgeBase("Any question?", 3);

    const queryArgs = mockQuery.mock.calls[0][0];
    expect(queryArgs.includeMetadata).toBe(true);
  });

  it("returns an empty array when Pinecone returns no matches", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockQuery.mockResolvedValue({ matches: [] });

    const results = await queryKnowledgeBase("No match question?", 3);

    expect(results).toHaveLength(0);
  });

  it("returns an empty array when Pinecone returns null matches", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockQuery.mockResolvedValue({ matches: null });

    const results = await queryKnowledgeBase("Null test?", 3);

    expect(results).toHaveLength(0);
  });

  it("uses a default score of 0 when match.score is absent", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockQuery.mockResolvedValue({
      matches: [
        {
          id: "faq-no-score",
          score: undefined,
          metadata: { answer: "Some answer.", category: "misc", question: "Q" },
        },
      ],
    });

    const results = await queryKnowledgeBase("Question?", 3);

    expect(results[0].score).toBe(0);
  });

  it("uses 'general' category when metadata.category is absent", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockQuery.mockResolvedValue({
      matches: [
        {
          id: "faq-no-cat",
          score: 0.8,
          metadata: { answer: "Answer without category.", question: "Q" },
        },
      ],
    });

    const results = await queryKnowledgeBase("Question?", 3);

    expect(results[0].category).toBe("general");
  });

  it("uses 'No answer available.' when metadata.answer is absent", async () => {
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1] }] });
    mockQuery.mockResolvedValue({
      matches: [
        {
          id: "faq-no-answer",
          score: 0.6,
          metadata: { question: "Q", category: "misc" },
        },
      ],
    });

    const results = await queryKnowledgeBase("Question?", 3);

    expect(results[0].answer).toBe("No answer available.");
  });

  it("propagates errors from embed or Pinecone query", async () => {
    mockEmbeddingsCreate.mockRejectedValue(new Error("Embedding API error"));

    await expect(queryKnowledgeBase("Error test?", 3)).rejects.toThrow("Embedding API error");
  });
});
