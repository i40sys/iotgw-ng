---
description: Set up and configure a Supabase storage bucket with policies
---

# Setup Storage Bucket Skill

You are helping set up a Supabase storage bucket. Follow these steps:

1. **Gather requirements**:
   - Bucket name (lowercase, hyphenated)
   - Is it public or private?
   - What file types are allowed?
   - What's the max file size?
   - Who can upload/download?
   - Any file name restrictions?

2. **Create bucket via SQL**:

   Connect to database:
   ```bash
   docker exec -it supabase-db psql -U postgres -d postgres
   ```

   Create bucket:
   ```sql
   -- Insert into storage.buckets table
   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   VALUES (
     'bucket-name',
     'bucket-name',
     false,  -- true for public, false for private
     52428800,  -- 50MB in bytes (or NULL for no limit)
     ARRAY['image/png', 'image/jpeg', 'application/pdf']  -- or NULL for all types
   )
   ON CONFLICT (id) DO NOTHING;
   ```

3. **Common bucket configurations**:

   **Public image bucket**:
   ```sql
   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   VALUES (
     'images',
     'images',
     true,
     10485760,  -- 10MB
     ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
   );
   ```

   **Private document bucket**:
   ```sql
   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   VALUES (
     'documents',
     'documents',
     false,
     104857600,  -- 100MB
     ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
   );
   ```

   **Avatar/profile pictures**:
   ```sql
   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   VALUES (
     'avatars',
     'avatars',
     true,
     5242880,  -- 5MB
     ARRAY['image/png', 'image/jpeg']
   );
   ```

4. **Create storage policies**:

   **Allow authenticated users to upload their own files**:
   ```sql
   CREATE POLICY "Users can upload their own files"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (
     bucket_id = 'bucket-name' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

   **Allow users to view their own files**:
   ```sql
   CREATE POLICY "Users can view their own files"
   ON storage.objects FOR SELECT
   TO authenticated
   USING (
     bucket_id = 'bucket-name' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

   **Allow users to delete their own files**:
   ```sql
   CREATE POLICY "Users can delete their own files"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (
     bucket_id = 'bucket-name' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

   **Public read access**:
   ```sql
   CREATE POLICY "Public read access"
   ON storage.objects FOR SELECT
   TO public
   USING (bucket_id = 'bucket-name');
   ```

   **Service role full access**:
   ```sql
   CREATE POLICY "Service role full access"
   ON storage.objects FOR ALL
   TO service_role
   USING (bucket_id = 'bucket-name')
   WITH CHECK (bucket_id = 'bucket-name');
   ```

5. **Edge function for file upload**:

   Create `volumes/functions/upload-file/index.ts`:
   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   serve(async (req: Request) => {
     if (req.method === 'OPTIONS') {
       return new Response(null, {
         status: 200,
         headers: {
           'Access-Control-Allow-Origin': '*',
           'Access-Control-Allow-Methods': 'POST, OPTIONS',
           'Access-Control-Allow-Headers': 'Content-Type, Authorization',
         },
       })
     }

     try {
       // Get auth token
       const authHeader = req.headers.get('Authorization')
       if (!authHeader) {
         throw new Error('Missing authorization header')
       }

       const supabase = createClient(
         Deno.env.get('SUPABASE_URL') ?? '',
         Deno.env.get('SUPABASE_ANON_KEY') ?? '',
         { global: { headers: { Authorization: authHeader } } }
       )

       // Get user
       const { data: { user }, error: userError } = await supabase.auth.getUser()
       if (userError || !user) throw new Error('Unauthorized')

       // Parse multipart form data
       const formData = await req.formData()
       const file = formData.get('file') as File
       if (!file) throw new Error('No file provided')

       const bucket = formData.get('bucket') as string || 'default'
       const fileName = formData.get('fileName') as string || file.name

       // Upload to storage
       // Files organized by user: {userId}/filename
       const filePath = `${user.id}/${fileName}`

       const { data, error } = await supabase.storage
         .from(bucket)
         .upload(filePath, file, {
           cacheControl: '3600',
           upsert: false
         })

       if (error) throw error

       // Get public URL (if bucket is public)
       const { data: { publicUrl } } = supabase.storage
         .from(bucket)
         .getPublicUrl(filePath)

       return new Response(
         JSON.stringify({
           success: true,
           path: data.path,
           publicUrl: publicUrl
         }),
         {
           status: 200,
           headers: {
             'Content-Type': 'application/json',
             'Access-Control-Allow-Origin': '*',
           },
         }
       )
     } catch (error) {
       return new Response(
         JSON.stringify({
           success: false,
           error: error instanceof Error ? error.message : 'Upload failed'
         }),
         { status: 500 }
       )
     }
   })
   ```

6. **Edge function for file download**:

   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   serve(async (req: Request) => {
     const url = new URL(req.url)
     const bucket = url.searchParams.get('bucket')
     const path = url.searchParams.get('path')

     if (!bucket || !path) {
       return new Response('Missing bucket or path', { status: 400 })
     }

     const supabase = createClient(
       Deno.env.get('SUPABASE_URL') ?? '',
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
     )

     const { data, error } = await supabase.storage
       .from(bucket)
       .download(path)

     if (error) {
       return new Response(error.message, { status: 404 })
     }

     return new Response(data, {
       headers: {
         'Content-Type': data.type,
         'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
       },
     })
   })
   ```

7. **Test storage operations**:

   **Upload file**:
   ```bash
   curl -X POST http://localhost:8000/functions/v1/upload-file \
     -H "Authorization: Bearer ${USER_TOKEN}" \
     -F "file=@/path/to/file.jpg" \
     -F "bucket=images" \
     -F "fileName=my-image.jpg"
   ```

   **Download file via REST API**:
   ```bash
   curl "http://localhost:8000/storage/v1/object/bucket-name/user-id/file.jpg" \
     -H "Authorization: Bearer ${USER_TOKEN}" \
     -o downloaded-file.jpg
   ```

   **Delete file**:
   ```bash
   curl -X DELETE "http://localhost:8000/storage/v1/object/bucket-name/user-id/file.jpg" \
     -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
   ```

8. **Image transformations** (if using imgproxy):

   ```bash
   # Get resized image
   curl "http://localhost:8000/storage/v1/render/image/bucket-name/path/to/image.jpg?width=300&height=300"
   ```

9. **Check bucket configuration**:
   ```sql
   -- View all buckets
   SELECT * FROM storage.buckets;

   -- View bucket policies
   SELECT * FROM pg_policies WHERE tablename = 'objects';

   -- View files in bucket
   SELECT * FROM storage.objects WHERE bucket_id = 'bucket-name';
   ```

10. **Cleanup/delete bucket**:
    ```sql
    -- Delete all files in bucket first
    DELETE FROM storage.objects WHERE bucket_id = 'bucket-name';

    -- Then delete bucket
    DELETE FROM storage.buckets WHERE id = 'bucket-name';
    ```

## Storage Best Practices

- Organize files by user ID: `{userId}/filename`
- Use descriptive bucket names
- Set appropriate file size limits
- Restrict MIME types for security
- Use RLS policies to control access
- Enable public access only when needed
- Use signed URLs for temporary access
- Implement file validation in edge functions
- Clean up orphaned files regularly
- Use imgproxy for image optimization

## Common MIME Types

**Images**: image/jpeg, image/png, image/gif, image/webp, image/svg+xml

**Documents**: application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document

**Spreadsheets**: application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

**Archives**: application/zip, application/x-tar, application/gzip

**Videos**: video/mp4, video/webm, video/ogg

**Audio**: audio/mpeg, audio/wav, audio/ogg
