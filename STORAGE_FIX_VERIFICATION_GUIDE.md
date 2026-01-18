# Storage Fix Verification & Testing Guide

## Root Cause Identified

**Error:** `StorageApiError: new row violates row-level security policy`

**Root Cause:** The `storage.objects` table is missing an INSERT policy for the `business-cards` bucket, OR the existing policy has incorrect conditions that don't match the actual upload path/context.

**Why it happens:**
1. User edits a Buying Intent created without an image
2. User uploads a new image
3. Frontend calls `supabase.storage.from('business-cards').upload(path, file)`
4. This attempts to INSERT a row into `storage.objects` table
5. Supabase RLS checks for an INSERT policy
6. **No valid policy exists or policy conditions don't match**
7. RLS blocks the operation → error thrown

---

## Complete Verification Checklist

### ✅ VERIFIED: Frontend Code is Correct

**Bucket Name:** `'business-cards'` ✅
**Upload Path:** `${user.id}/products/${fileName}` ✅
**Upload Method:** `.upload()` (INSERT operation) ✅
**Auth Context:** `supabase.auth.getUser()` verified before upload ✅
**Session Persistence:** `persistSession: true` in client config ✅
**Error Handling:** Enhanced logging added ✅

**Files:**
- `src/lib/supabase.js` - Client configured correctly
- `src/pages/Products.jsx` - Upload logic correct, auth verified

### ⚠️ TO BE VERIFIED: Supabase Storage Policies

**Required Policies on `storage.objects`:**

1. **INSERT** (CRITICAL - this is what's missing)
   - Role: `authenticated`
   - Bucket: `business-cards`
   - Condition: `(storage.foldername(name))[1] = auth.uid()::text`

2. **SELECT** (for viewing images)
   - Role: `authenticated`
   - Bucket: `business-cards`
   - Condition: `(storage.foldername(name))[1] = auth.uid()::text`

3. **UPDATE** (for replacing images)
   - Role: `authenticated`
   - Bucket: `business-cards`
   - Condition: `(storage.foldername(name))[1] = auth.uid()::text`

4. **DELETE** (for removing images)
   - Role: `authenticated`
   - Bucket: `business-cards`
   - Condition: `(storage.foldername(name))[1] = auth.uid()::text`

---

## How to Apply the Fix

### Step 1: Execute SQL in Supabase

1. Go to Supabase Dashboard → SQL Editor
2. Open `COMPLETE_STORAGE_FIX.sql`
3. **Execute the entire script**
4. Verify output shows 4 policies created

### Step 2: Verify Policies Exist

Run this query in Supabase SQL Editor:

```sql
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%business-cards%'
ORDER BY cmd;
```

**Expected Output:**

| policyname | cmd | roles | qual | with_check |
|------------|-----|-------|------|------------|
| business-cards: authenticated users can delete | DELETE | {authenticated} | (bucket_id = 'business-cards'...) | NULL |
| business-cards: authenticated users can insert | INSERT | {authenticated} | NULL | (bucket_id = 'business-cards'...) |
| business-cards: authenticated users can select | SELECT | {authenticated} | (bucket_id = 'business-cards'...) | NULL |
| business-cards: authenticated users can update | UPDATE | {authenticated} | (bucket_id = 'business-cards'...) | (bucket_id = 'business-cards'...) |

**Critical Check:** Ensure **INSERT** policy exists with role `{authenticated}`.

### Step 3: Verify Bucket Configuration

```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'business-cards';
```

**Expected:**
- `id`: `business-cards`
- `name`: `business-cards`
- `public`: `false` (PRIVATE)
- `file_size_limit`: `10485760` (10MB)
- `allowed_mime_types`: `{image/png, image/jpeg, image/jpg, image/webp, image/gif}`

---

## Testing Procedure

### Test Case 1: Edit + Upload Image (No Previous Image)

**Steps:**
1. Create a Buying Intent WITHOUT an image
2. Save it
3. Edit the Buying Intent
4. Upload an image
5. Click Save

**Expected Result:**
- ✅ Image uploads successfully
- ✅ Buying Intent saves with new image
- ✅ Page reloads and image is visible
- ✅ No console errors

**Check Console Logs:**
```
✅ User authenticated for image upload: <user_id>
✅ Image uploaded successfully: {...}
```

**If it fails, check console for:**
```
❌ Storage upload error: StorageApiError: new row violates row-level security policy
Error details: {
  message: "new row violates row-level security policy",
  statusCode: 403,
  path: "<user_id>/products/<uuid>.<ext>",
  bucket: "business-cards",
  userId: "<user_id>"
}
```

### Test Case 2: Edit + Replace Existing Image

**Steps:**
1. Edit a Buying Intent that already has an image
2. Upload a different image
3. Click Save

**Expected Result:**
- ✅ Old image remains until save completes
- ✅ New image uploads successfully
- ✅ Buying Intent updates with new image
- ✅ Old image may remain in storage (not deleted) or can be manually cleaned up

### Test Case 3: Edit Without Changing Image

**Steps:**
1. Edit a Buying Intent
2. Change only the name or description (don't touch image)
3. Click Save

**Expected Result:**
- ✅ Buying Intent saves successfully
- ✅ Image remains unchanged
- ✅ No storage operations occur

### Test Case 4: Create with Image (Regression Test)

**Steps:**
1. Create NEW Buying Intent
2. Upload an image during creation
3. Click Save

**Expected Result:**
- ✅ Image uploads successfully
- ✅ Buying Intent creates with image
- ✅ No regression in create flow

---

## What Was Changed

### Frontend Changes (Minimal)

**File:** `src/pages/Products.jsx`

**Change:** Enhanced error logging for storage uploads

```javascript
// BEFORE
const { error: uploadError } = await supabase.storage
  .from('business-cards')
  .upload(storagePath, selectedImage);

if (uploadError) throw uploadError;

// AFTER
const { data: uploadData, error: uploadError } = await supabase.storage
  .from('business-cards')
  .upload(storagePath, selectedImage);

if (uploadError) {
  console.error('❌ Storage upload error:', uploadError);
  console.error('Error details:', {
    message: uploadError.message,
    statusCode: uploadError.statusCode,
    error: uploadError.error,
    path: storagePath,
    bucket: 'business-cards',
    userId: user.id
  });
  throw new Error(`Image upload failed: ${uploadError.message}`);
}

console.log('✅ Image uploaded successfully:', uploadData);
```

**Purpose:** Better debugging visibility when storage errors occur.

### Infrastructure Changes (Required)

**File:** `COMPLETE_STORAGE_FIX.sql`

**What it does:**
1. Ensures `business-cards` bucket exists
2. Drops any conflicting/broken policies
3. Creates 4 correct policies (INSERT, SELECT, UPDATE, DELETE)
4. All policies scoped to `authenticated` role
5. All policies verify first folder in path matches user ID

**Security:**
- ✅ RLS remains enabled
- ✅ Bucket remains private
- ✅ Users can only access their own files
- ✅ No public access
- ✅ No cross-user access

---

## Files Modified/Created

### Application Code
- `src/pages/Products.jsx` - Enhanced error logging (1 change)

### SQL Scripts
- `COMPLETE_STORAGE_FIX.sql` - Complete storage policy setup (NEW)
- `STORAGE_FIX_VERIFICATION_GUIDE.md` - This guide (NEW)

### No Changes To
- ✅ Backend APIs unchanged
- ✅ Database schema unchanged
- ✅ Business logic unchanged
- ✅ Create flow unchanged
- ✅ Supabase client config unchanged

---

## Expected Final State

After applying `COMPLETE_STORAGE_FIX.sql`:

✅ 4 storage policies exist on `storage.objects` for `business-cards` bucket
✅ INSERT policy allows authenticated users to upload to `{user_id}/*` paths
✅ SELECT policy allows authenticated users to view their own images
✅ UPDATE policy allows authenticated users to replace their own images
✅ DELETE policy allows authenticated users to delete their own images
✅ RLS enabled and secure
✅ No frontend code changes required (except enhanced logging)
✅ Edit + upload image works
✅ Edit + replace image works
✅ Create flow unchanged

---

## Troubleshooting

### If INSERT still fails after applying SQL:

1. **Check user is authenticated:**
   ```javascript
   const { data: { user } } = await supabase.auth.getUser();
   console.log('Current user:', user); // Should NOT be null
   ```

2. **Check policy was created:**
   ```sql
   SELECT * FROM pg_policies
   WHERE policyname = 'business-cards: authenticated users can insert';
   ```

3. **Check path format matches:**
   - Frontend path: `{user_id}/products/{filename}`
   - Policy checks: `(storage.foldername(name))[1] = auth.uid()::text`
   - First folder MUST be user's ID

4. **Check bucket name matches:**
   - Frontend: `'business-cards'`
   - Policy: `bucket_id = 'business-cards'`
   - Case-sensitive!

5. **Check role:**
   - User must be `authenticated` (logged in)
   - Policy applies to `TO authenticated`

### Common Mistakes

❌ Policy checks `owner` or `user_id` field on `storage.objects` (doesn't exist)
✅ Policy checks path: `(storage.foldername(name))[1]`

❌ Policy missing `TO authenticated` clause
✅ Policy has `FOR INSERT TO authenticated`

❌ Bucket is public (security issue)
✅ Bucket is private, policies control access

❌ Path doesn't start with user ID
✅ Path is `{user_id}/products/{filename}`

---

## Summary

**Root Cause:** Missing INSERT policy on `storage.objects` for `business-cards` bucket.

**Solution:** Execute `COMPLETE_STORAGE_FIX.sql` to create proper RLS policies.

**Impact:** Minimal (no app code changes except logging, no schema changes).

**Security:** Maintained (RLS enabled, private bucket, user-scoped access).
