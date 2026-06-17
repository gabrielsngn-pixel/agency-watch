SELECT pgmq.send('transactional_emails', jsonb_build_object(
  'template_name', 'kanban-sla-alert',
  'recipient_email', 'gabrielsngn@gmail.com',
  'idempotency_key', 'test-sla-manual-' || extract(epoch from now())::bigint,
  'template_data', jsonb_build_object(
    'agency_name', 'Imobiliária Teste',
    'agency_city', 'São Paulo',
    'agency_state', 'SP',
    'stage', 'Em Negociação',
    'alert_type', 'stage_idle',
    'days_idle', 14,
    'threshold_days', 7,
    'anchor_at', (now() - interval '14 days')
  )
));