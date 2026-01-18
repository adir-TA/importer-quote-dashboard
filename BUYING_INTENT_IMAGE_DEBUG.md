# Buying Intent Image Upload - Debug Guide

## Problem Statement

**Error:** `StorageApiError: new row violates row-level security policy`

**When it occurs:** When editing a Buying Intent (created without image) and uploading an image, then clicking Save.

**Current bucket:** `business-cards` (shared with other features, but path is `/products/` for Buying Intents)

---

## Debugging Steps

### Step 1: Enhanced Logging Deployed

The code now includes detailed console logging at every step. When you attempt to save a Buying Intent with an image upload, you'll see:

```
🔵 Starting image upload process...
Selected image: [filename] [type] [size]
✅ User authenticated for image upload: [user_id]
🔵 Upload path: [user_id]/products/[uuid].[ext]
🔵 Bucket: business-cards
🔵 Attempting storage.upload()...
```

**If upload succeeds:**
```
✅ Image uploaded successfully: [data]
🔵 Getting public URL...
✅ Public URL generated: [url]
🔵 Product data to save: {...}
🔵 Calling updateProduct for ID: [id]
```

**If upload fails (THIS IS THE BUG):**
```
❌ Storage upload error: [error]
Error details: {
  message: "new row violates row-level security policy",
  statusCode: 403,
  path: "[user_id]/products/[uuid].[ext]",
  bucket: "business-cards",
  userId: "[user_id]"
}
```

**If save fails AFTER upload succeeds:**
```
✅ Image uploaded successfully: [data]
✅ Public URL generated: [url]
🔵 Product data to save: {...}
🔵 Calling updateProduct for ID: [id]
[ERROR thrown here]
```

### Step 2: Identify Failure Point

Open browser console and attempt the failing operation. **Look for the LAST successful ✅ log before the error.**

**Scenario A: Upload fails immediately**
```
🔵 Attempting storage.upload()...
❌ Storage upload error: StorageApiError: new row violates row-level security policy
```
**Root cause:** Missing INSERT policy on `storage.objects` for bucket `business-cards`

**Scenario B: Upload succeeds, save fails**
```
✅ Image uploaded successfully
✅ Public URL generated
🔵 Calling updateProduct for ID: xxx
[Error here]
```
**Root cause:** Database update issue (NOT storage), or second storage operation triggered by updateProduct

---

## Required SQL Fix

**File:** `COMPLETE_STORAGE_FIX.sql`

**Execute in Supabase SQL Editor** to create the INSERT policy.

### Critical Policy

```sql
CREATE POLICY "business-cards: authenticated users can insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-cards'
    AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

**How it works:**
- Upload path: `{user_id}/products/{uuid}.jpg`
- Policy extracts first folder: `{user_id}`
- Checks it matches logged-in user's ID: `auth.uid()`
- Allows INSERT if match

### Verification Query

After executing the SQL, run this to verify:

```sql
SELECT
  policyname,
  cmd,
  roles,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname = 'business-cards: authenticated users can insert';
```

**Expected result:** 1 row showing the policy with:
- `cmd`: `INSERT`
- `roles`: `{authenticated}`
- `with_check`: Contains bucket and path checks

---

## Test Procedure

### Test Case: Edit Buying Intent + Upload Image

1. **Open a Buying Intent that has NO image**
2. **Click Edit**
3. **Open browser console (F12)**
4. **Select an image file**
5. **Click Save**
6. **Watch console logs**

**Expected (after SQL fix):**
```
🔵 Starting image upload process...
✅ User authenticated for image upload: [id]
🔵 Upload path: [path]
🔵 Attempting storage.upload()...
✅ Image uploaded successfully
✅ Public URL generated
🔵 Calling updateProduct for ID: [id]
✅ Product updated successfully
✅ Save complete
```

**Current (before SQL fix):**
```
🔵 Starting image upload process...
✅ User authenticated for image upload: [id]
🔵 Upload path: [path]
🔵 Attempting storage.upload()...
❌ Storage upload error: StorageApiError: new row violates row-level security policy
```

---

## What Logs Tell Us

### Operation Failed: storage.upload()

**Bucket:** `business-cards`
**Path format:** `{user_id}/products/{uuid}.{ext}`
**Operation:** INSERT into `storage.objects`
**Blocker:** No INSERT policy exists or policy doesn't match

### Fix Required

Execute `COMPLETE_STORAGE_FIX.sql` to create INSERT policy on `storage.objects` for `business-cards` bucket.

---

## Summary

**Storage Bucket for Buying Intents:** `business-cards`
**Path:** `{user_id}/products/`
**Operation:** INSERT (new file upload)
**Required Policy:** INSERT on `storage.objects` for bucket `business-cards`, checking first folder = `auth.uid()`
**SQL File:** `COMPLETE_STORAGE_FIX.sql`
**RLS:** Remains enabled, secure user-scoped access

**Files Changed:**
- `src/pages/Products.jsx` - Added debug logging only (no logic changes)

**No Changes:**
- Backend APIs
- Database schema
- Buying Intent update logic
- Storage upload logic (works correctly, just blocked by RLS)
