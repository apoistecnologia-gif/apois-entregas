-- APOIS ENTREGAS — constraints required by storage upserts and provider webhook retries.

-- A courier may keep one current record for each required document type.
-- Existing duplicates are impossible in the current production dataset, but if this
-- migration is replayed against a populated environment they must be resolved first.
CREATE UNIQUE INDEX IF NOT EXISTS courier_documents_courier_type_unique_idx
  ON public.courier_documents(courier_id, document_type);

-- PostgREST upsert(onConflict: payment_id,provider_transaction_id,transaction_type)
-- requires a non-partial unique key over the same columns. NULLS NOT DISTINCT also
-- protects service-side retries whose provider transaction id is temporarily absent.
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_provider_idempotency_unique
  UNIQUE NULLS NOT DISTINCT (payment_id, provider_transaction_id, transaction_type);
