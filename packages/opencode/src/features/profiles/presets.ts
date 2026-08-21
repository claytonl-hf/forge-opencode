import type { Profile } from "./profile";

export const Profiles = {
  bedrock: {
    name: "Bedrock",
    description: "Models from AWS Bedrock",
    models: {
      $default: { id: "anthropic/claude-opus-5", variant: "low" },
      $small: { id: "anthropic/claude-sonnet-5", variant: "low" },
      compaction: { id: "anthropic/claude-sonnet-5", variant: "low" },
      lead: { id: "anthropic/claude-opus-5", variant: "high" },
      plan: { id: "anthropic/claude-opus-5", variant: "high" },
      code: { id: "anthropic/claude-opus-5", variant: "medium" },
      review: { id: "anthropic/claude-opus-5", variant: "medium" },
      explore: { id: "anthropic/claude-sonnet-5", variant: "low" },
      research: { id: "anthropic/claude-opus-5", variant: "low" },
      lens: { id: "anthropic/claude-sonnet-5", variant: "low" },
    },
  },
  pareto: {
    name: "Pareto",
    description: "Best intelligence for the cost",
    models: {
      $default: { id: "x-ai/grok-4.6", variant: "high" },
      $small: { id: "openai/gpt-5.6-luna", variant: "low" },
      compaction: { id: "openai/gpt-5.6-luna", variant: "high" },
      lead: { id: "x-ai/grok-4.6", variant: "xhigh" },
      plan: { id: "x-ai/grok-4.6", variant: "xhigh" },
      code: { id: "openai/gpt-5.6-luna", variant: "max" },
      review: { id: "x-ai/grok-4.5", variant: "high" },
      explore: { id: "openai/gpt-5.6-luna", variant: "high" },
      research: { id: "openai/gpt-5.6-luna", variant: "high" },
      lens: { id: "openai/gpt-5.6-luna", variant: "medium" },
    },
  },
  lite: {
    name: "Lite",
    description: "Fast and low-cost models",
    models: {
      $default: { id: "openai/gpt-5.6-luna", variant: "high" },
      $small: { id: "openai/gpt-5.6-luna", variant: "low" },
      compaction: { id: "openai/gpt-5.6-luna", variant: "medium" },
      lead: { id: "google/gemini-3.7-flash", variant: "high" },
      plan: { id: "google/gemini-3.7-flash", variant: "high" },
      code: { id: "openai/gpt-5.6-luna", variant: "xhigh" },
      scaffolder: { id: "openai/gpt-5.6-luna", variant: "high" },
      review: { id: "google/gemini-3.7-flash", variant: "high" },
      explore: { id: "openai/gpt-5.6-luna", variant: "medium" },
      research: { id: "google/gemini-3.7-flash", variant: "medium" },
      lens: { id: "google/gemini-3.7-flash", variant: "low" },
    },
  },
} satisfies Record<string, Profile>;
