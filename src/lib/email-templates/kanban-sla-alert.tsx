import React from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScvK9KeJ_Ftv2fGiEa4lGBkVuuDqM-_xrqtt0SSG2X6fEw66w/viewform?usp=dialog'

interface Props {
  agency_name?: string
  agency_city?: string
  agency_state?: string
  stage?: string
  alert_type?: 'stage_idle' | 'no_interaction' | string
  days_idle?: number
  threshold_days?: number
  form_url?: string
}

const labelByType: Record<string, string> = {
  stage_idle: 'parada na mesma etapa do funil',
  no_interaction: 'sem registrar nenhuma interação',
}

const KanbanSlaAlert = ({
  agency_name = 'Imobiliária',
  agency_city,
  agency_state,
  stage = '—',
  alert_type = 'stage_idle',
  days_idle = 0,
  threshold_days = 0,
  form_url = FORM_URL,
}: Props) => {
  const location = [agency_city, agency_state].filter(Boolean).join(' / ')
  const reason = labelByType[alert_type] ?? 'sem atualizações recentes'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{`SLA estourado: ${agency_name} há ${days_idle} dias ${reason}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>⏰ Alerta de SLA do Kanban</Heading>
          <Text style={text}>
            A imobiliária <strong>{agency_name}</strong>{location ? ` (${location})` : ''} está há{' '}
            <strong>{days_idle} dias</strong> {reason}.
          </Text>
          <Section style={card}>
            <Text style={label}>Etapa atual</Text>
            <Text style={valueHighlight}>{stage}</Text>
            <Hr style={hr} />
            <Text style={label}>Limite configurado</Text>
            <Text style={value}>{threshold_days} dias</Text>
            <Hr style={hr} />
            <Text style={label}>Tempo decorrido</Text>
            <Text style={value}>{days_idle} dias</Text>
          </Section>
          <Text style={text}>
            Sugerimos revisar essa imobiliária e registrar uma nova interação ou movê-la para a próxima etapa.
          </Text>
          <Section style={ctaWrap}>
            <Button href={form_url} style={ctaButton}>
              Atualizar status no formulário
            </Button>
            <Text style={ctaHint}>
              Clique acima para registrar a nova interação e zerar o contador de SLA.
            </Text>
          </Section>
          <Text style={footer}>Agency Watch — alerta automático de SLA</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: KanbanSlaAlert,
  subject: (d: Record<string, any>) =>
    `[SLA Kanban] ${d.agency_name ?? 'Imobiliária'} há ${d.days_idle ?? '?'} dias sem evolução`,
  displayName: 'Alerta de SLA do Kanban',
  previewData: {
    agency_name: 'Imobiliária Exemplo',
    agency_city: 'São Paulo',
    agency_state: 'SP',
    stage: 'Em Negociação',
    alert_type: 'stage_idle',
    days_idle: 14,
    threshold_days: 7,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '580px', margin: '0 auto' }
const heading = { fontSize: '22px', fontWeight: 600, color: '#b45309', marginBottom: '16px' }
const text = { fontSize: '14px', lineHeight: '1.6', color: '#334155', marginBottom: '12px' }
const card = { backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const label = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#92400e', margin: '0 0 4px' }
const value = { fontSize: '15px', color: '#475569', margin: '0 0 12px' }
const valueHighlight = { fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }
const hr = { borderColor: '#fde68a', margin: '8px 0' }
const footer = { fontSize: '12px', color: '#64748b', marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }
