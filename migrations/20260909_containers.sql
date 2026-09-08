-- ============================================
-- CONTAINERS (HA Containers) MIGRATION
-- ============================================
-- Adds the container load planner: a per-user branch list and the
-- containers themselves.
--
-- The grid is stored as JSONB rather than normalised into a cell table.
-- It is always loaded and saved whole, is never queried by cell, and is
-- sparse in practice (~40% of cells filled, ~3KB per container), so a
-- cell table would mean hundreds of mostly-empty rows per container for
-- no benefit.
--
-- Idempotent; safe to re-run.
-- ============================================

-- --------------------------------------------
-- 1. Branch list (master, per user)
-- --------------------------------------------
-- Branches are stable real-world entities reused across every container.
-- Keeping one list avoids the typos that retyping them per container
-- invites, and lets group colours be defined once.
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- owner_id rather than user_id: when this grows to shared workspaces the
  -- column becomes workspace_id in a purely additive migration.
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  group_index integer NOT NULL DEFAULT 0, -- drives the colour, see PALETTE
  sort_order integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_user_name ON branches(user_id, name);
CREATE INDEX IF NOT EXISTS idx_branches_user_order ON branches(user_id, group_index, sort_order);

-- --------------------------------------------
-- 2. Containers
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS containers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Scalar so the list screen and its search never touch the payload
  name text NOT NULL DEFAULT '',
  container_no text NOT NULL DEFAULT '',

  -- { products[], stores[], storeGroups[], qty[][], caps[], limits[],
  --   docExclude[], draftProducts, draftStores }
  -- `stores` holds branch NAMES, snapshotted at the time the container was
  -- built, so renaming or archiving a branch never rewrites history.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Optimistic concurrency. localStorage had no concurrent writers; a shared
  -- database does, and last-write-wins would silently destroy work.
  version integer NOT NULL DEFAULT 1,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_containers_user_updated ON containers(user_id, updated_at DESC);

-- --------------------------------------------
-- 3. Bump version + updated_at on every write
-- --------------------------------------------
CREATE OR REPLACE FUNCTION containers_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_containers_touch ON containers;
CREATE TRIGGER trg_containers_touch
  BEFORE UPDATE ON containers
  FOR EACH ROW EXECUTE FUNCTION containers_touch();

-- --------------------------------------------
-- 4. Row level security
-- --------------------------------------------
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own branches" ON branches;
CREATE POLICY "Users can view own branches" ON branches FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own branches" ON branches;
CREATE POLICY "Users can insert own branches" ON branches FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own branches" ON branches;
CREATE POLICY "Users can update own branches" ON branches FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own branches" ON branches;
CREATE POLICY "Users can delete own branches" ON branches FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own containers" ON containers;
CREATE POLICY "Users can view own containers" ON containers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own containers" ON containers;
CREATE POLICY "Users can insert own containers" ON containers FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own containers" ON containers;
CREATE POLICY "Users can update own containers" ON containers FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own containers" ON containers;
CREATE POLICY "Users can delete own containers" ON containers FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
