// ---------------------------------------------------------------------------
// Tests: src/tools/knowledge-base.ts
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KnowledgeResult } from "../utils/types.js";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockQueryKnowledgeBase = vi.fn<() => Promise<KnowledgeResult[]>>();

vi.mock("../services/pinecone.js", () => ({
  queryKnowledgeBase: mockQueryKnowledgeBase,
}));

// Import after mocks
const { lookupFaq } = await import("./knowledge-base.js");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("lookupFaq", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path - high confidence match
  // -------------------------------------------------------------------------

  it("returns found:true and the answer when a strong match exists", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "We accept Delta Dental and Aetna.", score: 0.9, category: "insurance" },
      { answer: "Most PPO plans are accepted.", score: 0.8, category: "insurance" },
      { answer: "We verify benefits before your visit.", score: 0.7, category: "insurance" },
    ]);

    const result = await lookupFaq("What insurance do you accept?");

    expect(result.found).toBe(true);
    expect(result.answer).toContain("Delta Dental");
    expect(result.sources).toContain("insurance");
  });

  it("combines multiple high-score results with 'Additionally'", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "First answer.", score: 0.9, category: "pricing" },
      { answer: "Second answer.", score: 0.75, category: "pricing" },
    ]);

    const result = await lookupFaq("How much does a cleaning cost?");

    expect(result.found).toBe(true);
    expect(result.answer).toContain("Additionally");
    expect(result.answer).toContain("First answer");
    expect(result.answer).toContain("Second answer");
  });

  it("uses only the best match when only one result passes the 0.5 threshold", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "Best match answer.", score: 0.85, category: "hours" },
      { answer: "Weaker match.", score: 0.45, category: "hours" },
    ]);

    const result = await lookupFaq("What are your hours?");

    expect(result.found).toBe(true);
    expect(result.answer).toBe("Best match answer.");
    expect(result.answer).not.toContain("Additionally");
  });

  it("returns all categories from high-score results as sources", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "Insurance answer.", score: 0.9, category: "insurance" },
      { answer: "Payment answer.", score: 0.6, category: "payments" },
    ]);

    const result = await lookupFaq("Insurance and payment?");

    expect(result.sources).toContain("insurance");
    expect(result.sources).toContain("payments");
  });

  // -------------------------------------------------------------------------
  // Low / no match cases
  // -------------------------------------------------------------------------

  it("returns found:false when results array is empty", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([]);

    const result = await lookupFaq("Something completely unrelated");

    expect(result.found).toBe(false);
    expect(result.sources).toHaveLength(0);
    expect(result.answer).toContain("don't have specific information");
  });

  it("returns found:false when best score is below 0.3", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "Low confidence answer.", score: 0.1, category: "misc" },
      { answer: "Another low confidence.", score: 0.05, category: "misc" },
    ]);

    const result = await lookupFaq("Random unrelated question");

    expect(result.found).toBe(false);
    expect(result.answer).toContain("don't have specific information");
  });

  it("returns found:true when best score is exactly 0.3", async () => {
    // score of 0.3 is NOT below 0.3, so it should still return the answer
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "Borderline answer.", score: 0.3, category: "misc" },
    ]);

    const result = await lookupFaq("Borderline question");

    // score 0.3 passes the < 0.3 check, so found should be true
    expect(result.found).toBe(true);
    expect(result.answer).toBe("Borderline answer.");
  });

  it("offers callback when no answer is found", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([]);

    const result = await lookupFaq("Unknown topic");

    expect(result.answer).toMatch(/call you back/i);
  });

  // -------------------------------------------------------------------------
  // Score boundary edge cases
  // -------------------------------------------------------------------------

  it("includes results at exactly 0.5 score in combined answer", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "Primary answer.", score: 0.9, category: "cat1" },
      { answer: "At threshold.", score: 0.5, category: "cat2" },
    ]);

    const result = await lookupFaq("Test question");

    expect(result.answer).toContain("Additionally");
    expect(result.answer).toContain("At threshold");
  });

  it("excludes results just below 0.5 from combined sources", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "Primary answer.", score: 0.9, category: "cat1" },
      { answer: "Just below threshold.", score: 0.49, category: "cat2" },
    ]);

    const result = await lookupFaq("Test question");

    expect(result.sources).not.toContain("cat2");
    expect(result.answer).not.toContain("Additionally");
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("returns found:false with fallback answer when queryKnowledgeBase throws", async () => {
    mockQueryKnowledgeBase.mockRejectedValue(new Error("Pinecone network error"));

    const result = await lookupFaq("What are your hours?");

    expect(result.found).toBe(false);
    expect(result.answer).toContain("having trouble");
    expect(result.sources).toHaveLength(0);
  });

  it("returns empty sources array on error", async () => {
    mockQueryKnowledgeBase.mockRejectedValue(new Error("Timeout"));

    const result = await lookupFaq("Any question");

    expect(result.sources).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Query forwarding
  // -------------------------------------------------------------------------

  it("forwards the question to queryKnowledgeBase", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([
      { answer: "Answer here.", score: 0.8, category: "test" },
    ]);

    await lookupFaq("Do you offer pediatric dentistry?");

    expect(mockQueryKnowledgeBase).toHaveBeenCalledWith(
      "Do you offer pediatric dentistry?",
      3,
    );
  });

  it("requests top 3 results from the knowledge base", async () => {
    mockQueryKnowledgeBase.mockResolvedValue([]);
    await lookupFaq("Any question");
    expect(mockQueryKnowledgeBase).toHaveBeenCalledWith(expect.any(String), 3);
  });
});
