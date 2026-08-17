import type { Profile } from "./profile";

export const Profiles = {
  bedrock: {
    name: "Bedrock",
    description: "Models from AWS Bedrock",
    models: {
      $default: { id: "anthropic/claude-sonnet-5", variant: "medium" },
      $small: { id: "anthropic/claude-sonnet-5", variant: "low" },
      lead: { id: "anthropic/claude-opus-5", variant: "medium" },
      plan: { id: "anthropic/claude-opus-5", variant: "medium" },
      code: { id: "anthropic/claude-opus-5", variant: "low" },
      review: { id: "anthropic/claude-opus-5", variant: "medium" },
      explore: { id: "anthropic/claude-sonnet-5", variant: "low" },
      research: { id: "anthropic/claude-sonnet-5", variant: "medium" },
      lens: { id: "anthropic/claude-sonnet-5", variant: "low" },
    },
  },
  pareto: {
    name: "Pareto",
    description: "Best intelligence for the cost",
    models: {
      $default: { id: "openai/gpt-5.6-luna", variant: "xhigh" },
      $small: { id: "openai/gpt-5.6-luna", variant: "low" },
      lead: { id: "x-ai/grok-4.6", variant: "high" },
      plan: { id: "x-ai/grok-4.6", variant: "high" },
      code: { id: "openai/gpt-5.6-luna", variant: "max" },
      review: { id: "x-ai/grok-4.5", variant: "high" },
      explore: { id: "deepseek/deepseek-v4-flash-0731", variant: "low" },
      research: { id: "openai/gpt-5.6-luna", variant: "high" },
      lens: { id: "openai/gpt-5.6-luna", variant: "low" },
    },
  },
  lite: {
    name: "Lite",
    description: "Fast and low-cost models",
    models: {
      $default: { id: "openai/gpt-5.6-luna", variant: "high" },
      $small: { id: "deepseek/deepseek-v4-flash-0731", variant: "low" },
      lead: { id: "openai/gpt-5.6-luna", variant: "xhigh" },
      plan: { id: "openai/gpt-5.6-luna", variant: "high" },
      code: { id: "openai/gpt-5.6-luna", variant: "xhigh" },
      review: { id: "openai/gpt-5.6-luna", variant: "high" },
      explore: { id: "deepseek/deepseek-v4-flash-0731", variant: "low" },
      research: { id: "openai/gpt-5.6-luna", variant: "medium" },
      lens: { id: "openai/gpt-5.6-luna", variant: "low" },
    },
  },
} satisfies Record<string, Profile>;
