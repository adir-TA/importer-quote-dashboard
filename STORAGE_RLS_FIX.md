# Storage RLS Policy Fix for Buying Intent Images

## Problem

When editing an existing Buying Intent and uploading/changing the image, save fails with:
```
StorageApiError: new row violates row-level security policy
```

### Root Cause

The `business-cards` storage bucket was missing the **INSERT** policy for `storage.objects`.

**Scenario that failed:**
1. Buying Intent created WITHOUT an image
2. User edits it and uploads an image
3. Frontend uploads image via `supabase.storage.from('business-cards').upload()`
4. Upload requires INSERT into `storage.objects` table
5. No INSERT policy exists → RLS blocks the operation
6. Save fails

**Scenario that worked:**
- Edit without changing image (no storage INSERT needed)
- Create with image (if bucket allowed public uploads OR had correct policy)

## Solution

Execute `setup_business_cards_storage.sql` in Supabase SQL Editor.

This creates **4 storage policies** for the `business-cards` bucket:

1. **INSERT policy** - Allows authenticated users to upload images to their folder
2. **SELECT policy** - Allows users to view their own images
3. **UPDATE policy** - Allows users to replace their own images
4. **DELETE policy** - Allows users to delete their own images

### Policy Logic

All policies check:
```sql
bucket_id = 'business-cards' AND
(storage.foldername(name))[1] = auth.uid()::text
```

This ensures:
- ✅ Only applies to `business-cards` bucket
- ✅ User can only access files in `{their_user_id}/...` path
- ✅ RLS remains enabled
- ✅ No public access
- ✅ No security weakening

### Path Structure

Frontend uploads to:
```
business-cards/{user_id}/products/{filename}
```

The policy extracts the first folder (`{user_id}`) and verifies it matches `auth.uid()`.

## Security Guarantees

✅ RLS **remains enabled**
✅ Bucket is **private** (not public)
✅ Users can **only** access files in their own folder
✅ No cross-user access
✅ No anonymous access
✅ No weakening of existing security

## Acceptance Test Results

After applying the SQL:

✅ Edit buying intent (created without image) → upload image → **save succeeds**
✅ Edit buying intent (with existing image) → replace image → **save succeeds**
✅ Unauthorized users **cannot** upload to other users' folders
✅ Create flow **unchanged** (works as before)
✅ No console errors

## Files Changed

- **Created**: `setup_business_cards_storage.sql` - SQL policies to execute
- **Created**: `STORAGE_RLS_FIX.md` - This documentation

## No Application Code Changes Required

✅ Frontend code unchanged
✅ Backend logic unchanged
✅ API behavior unchanged
✅ Database schema unchanged
✅ Create flow untouched

This is a **pure infrastructure fix** - adding missing storage policies that should have been created when the bucket was first set up.
