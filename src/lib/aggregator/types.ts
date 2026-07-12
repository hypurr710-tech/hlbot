import { z } from "zod";

export const HlAssetCtxSchema = z.object({
  markPx: z.number(),
  midPx: z.number(),
  fundingHourly: z.number(),
  premium: z.number(),
  openInterest: z.number(),
  dayNtlVlm: z.number(),
});

export const KrQuoteSchema = z.object({
  close: z.number(),
  prevClose: z.number(),
  nxtPrice: z.number().nullable(),
  nxtSession: z.enum(["PRE", "AFTER_MARKET"]).nullable(),
  marketOpen: z.boolean(),
});

export const LiveSnapshotSchema = z.object({
  ts: z.number(),
  fx: z.object({
    usdKrwHana: z.number().nullable(),
    usdtKrwUpbit: z.number().nullable(),
  }),
  hl: z.record(z.string(), HlAssetCtxSchema),
  kr: z.record(z.string(), KrQuoteSchema),
  warnings: z.array(z.string()),
});

export type HlAssetCtx = z.infer<typeof HlAssetCtxSchema>;
export type KrQuote = z.infer<typeof KrQuoteSchema>;
export type LiveSnapshot = z.infer<typeof LiveSnapshotSchema>;
