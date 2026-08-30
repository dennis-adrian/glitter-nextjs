-- Shared preview/staging DBs may already have this label from an earlier deploy
-- when this change shipped as 0243_aromatic_terrax before the merge renumber.
ALTER TYPE "public"."invoice_status" ADD VALUE IF NOT EXISTS 'verification_payment' BEFORE 'paid';
