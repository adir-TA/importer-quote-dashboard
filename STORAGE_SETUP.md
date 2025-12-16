# Supabase Storage Setup Guide

This guide will walk you through setting up Supabase Storage for document uploads (Proforma Invoices, quotes, specs).

## Prerequisites

- Supabase project set up
- Database migrations completed
- `.env` file configured

## Step 1: Update Database Schema

Run this migration in Supabase SQL Editor to update the documents table:

```sql
-- Migrate from base64 storage to Supabase Storage
ALTER TABLE documents DROP COLUMN IF EXISTS file_url;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN documents.file_path IS 'Path to file in Supabase Storage (e.g., suppliers/{id}/document.pdf)';
COMMENT ON COLUMN documents.file_name IS 'Original filename';
COMMENT ON COLUMN documents.file_type IS 'MIME type (e.g., application/pdf, image/png)';
```

Or run the migration file:
```bash
# Copy contents of migration_documents_storage.sql and run in Supabase SQL Editor
```

## Step 2: Create Storage Bucket

Run this in Supabase SQL Editor to create the private storage bucket:

```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false, -- Private bucket
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

Or run the setup file:
```bash
# Copy contents of setup_storage_bucket.sql and run in Supabase SQL Editor
```

## Step 3: Add Service Role Key to .env

1. Go to Supabase Dashboard
2. Navigate to **Settings** > **API**
3. Copy the `service_role` key (keep this secret!)
4. Add to your `.env` file:

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**IMPORTANT:** Never commit this key to git. It has full access to your database.

## Step 4: Start Backend Server

The backend server handles file uploads and generates signed URLs:

```bash
# Terminal 1 - Start backend
npm run server

# Terminal 2 - Start frontend
npm run dev
```

The backend runs on http://localhost:3001 and provides:
- `POST /api/documents/upload` - Upload files to Storage
- `POST /api/documents/signed-url` - Get signed URLs for preview/download

## Step 5: Verify Setup

1. Navigate to any Buying Intent detail page
2. Click the "Documents" tab
3. Click "Upload Document"
4. Select a file (PDF or image) and supplier
5. Upload should complete successfully
6. Preview and download should work

## Architecture

### File Upload Flow:
1. User selects file in `UploadDocumentModal`
2. File is sent to backend via `FormData`
3. Backend uploads to Supabase Storage (private bucket)
4. Backend returns file path
5. Frontend saves metadata to `documents` table with file_path

### File Preview/Download Flow:
1. User clicks preview or download
2. Frontend requests signed URL from backend
3. Backend generates time-limited signed URL (1 hour)
4. Frontend displays file using signed URL
5. Signed URL expires after 1 hour

### Folder Structure:
```
documents/
  {user_id}/
    buying-intents/
      {buying_intent_id}/
        {timestamp}.pdf
        {timestamp}.png
```

## Security

- **Private bucket**: Files are not publicly accessible
- **RLS policies**: Users can only access their own files
- **Signed URLs**: Time-limited access (1 hour expiry)
- **Service role key**: Only used on backend, never exposed to frontend
- **File validation**: Type and size limits enforced

## Troubleshooting

### "Missing Supabase credentials" error
- Check that `SUPABASE_SERVICE_ROLE_KEY` is in your `.env` file
- Restart the backend server after adding the key

### Upload fails with "Bucket not found"
- Run the storage bucket setup SQL (Step 2)
- Verify bucket exists in Supabase Dashboard > Storage

### Preview shows broken image
- Check that signed URL is being generated correctly
- Verify file was uploaded to Storage (check Supabase Dashboard > Storage)
- Check backend console logs for errors

### "File size must be less than 10MB"
- This is enforced at both frontend and backend
- Large files should be compressed before upload

## Notes

- Old documents with base64 `file_url` are **not migrated**
- This is a fresh start with Supabase Storage
- If you have existing documents, you'll need to re-upload them
- Maximum file size: 10MB
- Allowed types: PDF, PNG, JPG, JPEG
- Signed URLs expire after 1 hour (automatically refreshed on each preview/download)
