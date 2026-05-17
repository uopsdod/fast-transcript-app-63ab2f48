-- M2: Stripe credits system
--
-- Adds:
--   1. profiles table (M0 didn't create it; M2 needs it for credits_balance + role)
--   2. credit_transactions ledger (purchase / deduction / signup_bonus / admin_grant)
--      + UNIQUE INDEX on stripe_payment_intent_id for webhook idempotency
--   3. credit_products catalog, seeded with the three Stripe sandbox price IDs
--      created in Step 3 (1TXuDo / 1TXuDr / 1TXuDu).
--   4. handle_new_user trigger on auth.users (30-credit welcome bonus + ledger row)
--   5. Extends jobs.status CHECK to include 'insufficient_credits'
--   6. Backfills profiles + signup_bonus for the user(s) that existed before M2
--
-- The unique index on (stripe_payment_intent_id) WHERE NOT NULL is what protects
-- the webhook from double-crediting on Stripe retries — INSERT ... ON CONFLICT
-- in the handler relies on it.

-- ---- 1. profiles table -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  credits_balance numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Backfill: every existing auth.users row gets a profile with the 30-credit bonus.
INSERT INTO public.profiles (id, role, credits_balance)
SELECT u.id, 'user', 30
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- ---- 2. credit_transactions ledger ----------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase', 'deduction', 'signup_bonus', 'admin_grant')),
  description text,
  job_id uuid REFERENCES public.jobs(id),
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id
  ON public.credit_transactions (user_id, created_at DESC);

-- Idempotency guard: at most one purchase row per Stripe payment_intent.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_tx_payment_intent
  ON public.credit_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own transactions"
  ON public.credit_transactions
  FOR SELECT
  USING (user_id = auth.uid());

-- ---- 3. credit_products catalog -------------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits numeric NOT NULL,
  price_usd numeric NOT NULL,
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users view active products"
  ON public.credit_products
  FOR SELECT
  TO authenticated
  USING (active = true);

INSERT INTO public.credit_products (name, credits, price_usd, stripe_price_id) VALUES
  ('10 Credits', 10, 10.00, 'price_1TXuDoA8nsYOcwmD0wzWnxhJ'),
  ('45 Credits', 45, 30.00, 'price_1TXuDrA8nsYOcwmDFDTwAZ3s'),
  ('90 Credits', 90, 60.00, 'price_1TXuDuA8nsYOcwmDoxzsEUAB');

-- ---- 4. handle_new_user trigger -------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, credits_balance)
    VALUES (NEW.id, 'user', 30)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (NEW.id, 30, 'signup_bonus', 'Welcome bonus — 30 free credits');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---- 5. Extend jobs.status CHECK ------------------------------------------
-- M1's migration constrains status to pending/downloading/transcribe/done.
-- M2 adds the insufficient_credits terminal state for jobs the worker
-- rejects before calling Whisper (video minutes > user's balance).

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('pending', 'downloading', 'transcribe', 'done', 'insufficient_credits'));

-- ---- 6. Backfill signup_bonus rows ----------------------------------------

INSERT INTO public.credit_transactions (user_id, amount, type, description)
SELECT u.id, 30, 'signup_bonus', 'Welcome bonus — 30 free credits (backfilled)'
FROM auth.users u
LEFT JOIN public.credit_transactions ct
  ON ct.user_id = u.id AND ct.type = 'signup_bonus'
WHERE ct.id IS NULL;
