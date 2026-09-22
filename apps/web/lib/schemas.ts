import { z } from "zod";

export const PolicyFormSchema = z.object({
  name: z.string().min(1).max(64),
  targetTool: z.string().min(1).max(64),
  actionOnMatch: z.enum(["ALLOW", "BLOCK", "REQUIRE_APPROVAL"]),
  fieldPath: z.string().min(1),
  operator: z.enum([
    "EQUALS",
    "NOT_EQUALS",
    "GREATER_THAN",
    "LESS_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN_OR_EQUAL",
    "CONTAINS",
    "REGEX",
    "IN"
  ]),
  targetValue: z.string().min(1)
});

export type PolicyFormValues = z.infer<typeof PolicyFormSchema>;

