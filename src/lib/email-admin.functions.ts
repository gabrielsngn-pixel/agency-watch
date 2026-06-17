import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
import { render } from '@react-email/render'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { TEMPLATES } from '@/lib/email-templates/registry'

async function getAdminClient(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (error || !isAdmin) throw new Error('Forbidden')
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  return supabaseAdmin
}

export const getEmailSendLog = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    sinceIso?: string
    untilIso?: string
    template?: string | null
    status?: string | null
    limit?: number
  }) => input)
  .handler(async ({ data, context }) => {
    const admin = await getAdminClient(context)
    let q = admin
      .from('email_send_log')
      .select('id, message_id, template_name, recipient_email, status, error_message, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(Math.min(data.limit ?? 500, 1000))
    if (data.sinceIso) q = q.gte('created_at', data.sinceIso)
    if (data.untilIso) q = q.lte('created_at', data.untilIso)
    if (data.template) q = q.eq('template_name', data.template)
    if (data.status) q = q.eq('status', data.status)
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)

    // Deduplicate by message_id (keep latest = first since ordered desc)
    const seen = new Set<string>()
    const deduped: typeof rows = []
    for (const r of rows ?? []) {
      const key = r.message_id ?? r.id
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(r)
    }

    // Summary counts
    const summary = { total: 0, sent: 0, failed: 0, suppressed: 0, pending: 0 }
    for (const r of deduped) {
      summary.total++
      if (r.status === 'sent') summary.sent++
      else if (r.status === 'dlq' || r.status === 'failed' || r.status === 'bounced' || r.status === 'complained') summary.failed++
      else if (r.status === 'suppressed') summary.suppressed++
      else if (r.status === 'pending') summary.pending++
    }
    return { rows: deduped, summary }
  })

export const getSuppressedEmails = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdminClient(context)
    const { data, error } = await admin
      .from('suppressed_emails')
      .select('id, email, reason, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    return data
  })

export const getEmailSendState = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdminClient(context)
    const { data, error } = await admin
      .from('email_send_state')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) throw new Error(error.message)
    return data
  })

export const updateEmailSendState = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    batch_size: number
    send_delay_ms: number
    auth_email_ttl_minutes: number
    transactional_email_ttl_minutes: number
  }) => input)
  .handler(async ({ data, context }) => {
    const admin = await getAdminClient(context)
    const { error } = await admin
      .from('email_send_state')
      .update({
        batch_size: data.batch_size,
        send_delay_ms: data.send_delay_ms,
        auth_email_ttl_minutes: data.auth_email_ttl_minutes,
        transactional_email_ttl_minutes: data.transactional_email_ttl_minutes,
      })
      .eq('id', 1)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
