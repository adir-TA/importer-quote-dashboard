-- ============================================
-- DOCUMENTS MIGRATION
-- ============================================
-- Add document storage for PIs, quotes, specs
-- Always linked to BuyingIntent + Supplier
-- Optionally linked to specific Quote
-- ============================================

-- Create documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Document type
  type TEXT NOT NULL CHECK (type IN ('PI', 'QUOTE', 'SPEC', 'OTHER')),

  -- Required links
  buying_intent_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  supplier_quote_id UUID REFERENCES supplier_quotes(id) ON DELETE CASCADE,

  -- Optional link to specific line item
  quote_line_item_id UUID REFERENCES quote_line_items(id) ON DELETE SET NULL,

  -- File metadata
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- mime type
  file_size INTEGER, -- bytes

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_buying_intent_id ON documents(buying_intent_id);
CREATE INDEX idx_documents_supplier_quote_id ON documents(supplier_quote_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- What this adds:
-- ✅ Documents table with required BuyingIntent + Supplier links
-- ✅ Optional Quote line item link
-- ✅ File metadata storage
-- ✅ RLS policies for user isolation
-- ✅ Indexes for performance
-- ============================================
