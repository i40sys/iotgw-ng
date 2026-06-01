---
description: Configure authentication providers and policies in Supabase
---

# Setup Authentication Skill

You are helping set up or configure Supabase authentication. Follow these steps:

1. **Identify auth requirements**:
   - Auth method: email/password, magic link, phone, OAuth providers?
   - Email confirmation required?
   - Password requirements?
   - Redirect URLs?
   - Custom email templates?

2. **Configure auth in .env**:

   **Email/Password Authentication**:
   ```bash
   ENABLE_EMAIL_SIGNUP=true
   ENABLE_EMAIL_AUTOCONFIRM=false  # Set true to skip email verification
   DISABLE_SIGNUP=false  # Set true to disable new signups

   # SMTP Configuration
   SMTP_ADMIN_EMAIL=admin@example.com
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_SENDER_NAME=Your App Name

   # Email templates paths
   MAILER_URLPATHS_CONFIRMATION="/auth/v1/verify"
   MAILER_URLPATHS_INVITE="/auth/v1/verify"
   MAILER_URLPATHS_RECOVERY="/auth/v1/verify"
   MAILER_URLPATHS_EMAIL_CHANGE="/auth/v1/verify"
   ```

   **Phone Authentication**:
   ```bash
   ENABLE_PHONE_SIGNUP=true
   ENABLE_PHONE_AUTOCONFIRM=true  # For development only
   ```

   **General Settings**:
   ```bash
   SITE_URL=http://localhost:3000
   ADDITIONAL_REDIRECT_URLS=http://localhost:3001,https://myapp.com
   JWT_EXPIRY=3600  # 1 hour in seconds
   ```

3. **Restart auth service** after .env changes:
   ```bash
   docker compose restart auth
   ```

4. **Create edge function for signup**:

   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   serve(async (req: Request) => {
     if (req.method === 'OPTIONS') {
       return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } })
     }

     try {
       const { email, password, metadata } = await req.json()

       const supabase = createClient(
         Deno.env.get('SUPABASE_URL') ?? '',
         Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
       )

       // Sign up user
       const { data, error } = await supabase.auth.signUp({
         email,
         password,
         options: {
           data: metadata,  // Custom user metadata
           emailRedirectTo: `${Deno.env.get('SITE_URL')}/auth/callback`
         }
       })

       if (error) throw error

       return new Response(
         JSON.stringify({ success: true, user: data.user }),
         { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
       )
     } catch (error) {
       return new Response(
         JSON.stringify({ success: false, error: error.message }),
         { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
       )
     }
   })
   ```

5. **Create edge function for login**:

   ```typescript
   import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

   serve(async (req: Request) => {
     try {
       const { email, password } = await req.json()

       const supabase = createClient(
         Deno.env.get('SUPABASE_URL') ?? '',
         Deno.env.get('SUPABASE_ANON_KEY') ?? ''
       )

       const { data, error } = await supabase.auth.signInWithPassword({
         email,
         password
       })

       if (error) throw error

       return new Response(
         JSON.stringify({
           success: true,
           user: data.user,
           session: data.session
         }),
         { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
       )
     } catch (error) {
       return new Response(
         JSON.stringify({ success: false, error: error.message }),
         { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
       )
     }
   })
   ```

6. **Setup OAuth providers** (Google, GitHub, etc.):

   This requires configuration in docker-compose.yml:
   ```yaml
   auth:
     environment:
       # ... existing config ...
       # Google OAuth
       GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
       GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: "your-google-client-id"
       GOTRUE_EXTERNAL_GOOGLE_SECRET: "your-google-secret"
       GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: "http://localhost:8000/auth/v1/callback"

       # GitHub OAuth
       GOTRUE_EXTERNAL_GITHUB_ENABLED: "true"
       GOTRUE_EXTERNAL_GITHUB_CLIENT_ID: "your-github-client-id"
       GOTRUE_EXTERNAL_GITHUB_SECRET: "your-github-secret"
       GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI: "http://localhost:8000/auth/v1/callback"
   ```

7. **Create user profile table**:

   ```sql
   -- Create profiles table
   CREATE TABLE public.profiles (
     id UUID REFERENCES auth.users(id) PRIMARY KEY,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     email TEXT,
     full_name TEXT,
     avatar_url TEXT,
     bio TEXT
   );

   -- Enable RLS
   ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

   -- Policies
   CREATE POLICY "Users can view all profiles"
   ON public.profiles FOR SELECT
   TO authenticated
   USING (true);

   CREATE POLICY "Users can update their own profile"
   ON public.profiles FOR UPDATE
   TO authenticated
   USING (auth.uid() = id)
   WITH CHECK (auth.uid() = id);

   -- Create profile automatically on signup
   CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS TRIGGER AS $$
   BEGIN
     INSERT INTO public.profiles (id, email, full_name)
     VALUES (
       NEW.id,
       NEW.email,
       NEW.raw_user_meta_data->>'full_name'
     );
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;

   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ```

8. **Setup custom access token hook** (optional):

   In docker-compose.yml:
   ```yaml
   auth:
     environment:
       GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: "true"
       GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI: "pg-functions://postgres/public/custom_access_token_hook"
   ```

   Create the function:
   ```sql
   CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
   RETURNS jsonb AS $$
   DECLARE
     claims jsonb;
     user_role text;
   BEGIN
     -- Get user role from profiles table
     SELECT role INTO user_role
     FROM public.profiles
     WHERE id = (event->>'user_id')::uuid;

     -- Add custom claims
     claims := event->'claims';
     claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));

     RETURN jsonb_set(event, '{claims}', claims);
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

9. **Test authentication**:

   **Sign up**:
   ```bash
   curl -X POST http://localhost:8000/auth/v1/signup \
     -H "apikey: ${ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "password": "SecurePassword123!"
     }'
   ```

   **Sign in**:
   ```bash
   curl -X POST http://localhost:8000/auth/v1/token?grant_type=password \
     -H "apikey: ${ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "password": "SecurePassword123!"
     }'
   ```

   **Get user**:
   ```bash
   curl http://localhost:8000/auth/v1/user \
     -H "apikey: ${ANON_KEY}" \
     -H "Authorization: Bearer ${ACCESS_TOKEN}"
   ```

10. **Common auth queries**:

    ```sql
    -- List all users
    SELECT id, email, created_at, confirmed_at
    FROM auth.users
    ORDER BY created_at DESC;

    -- Get user metadata
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    WHERE email = 'user@example.com';

    -- Delete user
    DELETE FROM auth.users WHERE id = 'user-uuid';

    -- Update user email
    UPDATE auth.users
    SET email = 'newemail@example.com'
    WHERE id = 'user-uuid';

    -- Check user sessions
    SELECT user_id, created_at, NOT_AFTER
    FROM auth.sessions
    WHERE user_id = 'user-uuid';
    ```

11. **Password reset flow**:

    Request reset:
    ```bash
    curl -X POST http://localhost:8000/auth/v1/recover \
      -H "apikey: ${ANON_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"email": "user@example.com"}'
    ```

    Update password:
    ```bash
    curl -X PUT http://localhost:8000/auth/v1/user \
      -H "apikey: ${ANON_KEY}" \
      -H "Authorization: Bearer ${RESET_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"password": "NewSecurePassword123!"}'
    ```

12. **Security best practices**:
    - Use strong password requirements
    - Enable email confirmation in production
    - Set appropriate JWT expiry times
    - Use HTTPS in production
    - Validate redirect URLs
    - Implement rate limiting
    - Monitor failed login attempts
    - Use RLS on all tables
    - Never expose service role key to clients
    - Rotate JWT secret regularly

## Auth Checklist

- [ ] Auth method configured in .env
- [ ] SMTP configured for email auth
- [ ] Redirect URLs set correctly
- [ ] JWT expiry appropriate for use case
- [ ] RLS enabled on user-related tables
- [ ] Profile table created with trigger
- [ ] Auth service restarted after config changes
- [ ] Sign up/sign in tested
- [ ] Password reset tested
- [ ] Custom claims added (if needed)
- [ ] OAuth providers configured (if needed)

## Quick Reference

```bash
# Test signup
curl -X POST http://localhost:8000/auth/v1/signup \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass123"}'

# Test login
curl -X POST http://localhost:8000/auth/v1/token?grant_type=password \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass123"}'

# Get current user
curl http://localhost:8000/auth/v1/user \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${TOKEN}"
```
