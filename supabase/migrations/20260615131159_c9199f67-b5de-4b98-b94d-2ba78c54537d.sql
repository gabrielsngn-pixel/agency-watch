CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Recreate cron job referencing the extensions schema (some installs alias net -> extensions)
SELECT cron.unschedule('sync-google-forms-responses-every-1-second');

SELECT cron.schedule(
  'sync-google-forms-responses-every-1-second',
  '1 seconds',
  $$
  SELECT net.http_post(
    url:='https://project--d11cb06d-335d-4537-a5a5-ab92c2b041f2.lovable.app/api/public/google-forms/sync',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcGJiYnlveWNoc2t4Ymd0dHJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzU2NDgsImV4cCI6MjA5NTMxMTY0OH0.pczSbdnNvJvJ9XteYxYSHsktVDcwTBcIqPWWens3NNA"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);