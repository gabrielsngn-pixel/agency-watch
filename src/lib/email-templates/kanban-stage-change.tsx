import React from 'react'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  agency_name?: string
  agency_city?: string
  agency_state?: string
  previous_status?: string
  new_status?: string
  moved_by?: string
}

const KanbanStageChange = ({
  agency_name = 'Imobiliária',
  agency_city,
  agency_state,
  previous_status = '—',
  new_status = '—',
  moved_by = 'sistema',
}: Props) => {
  const location = [agency_city, agency_state].filter(Boolean).join(' / ')
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{`${agency_name} mudou para ${new_status}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Movimentação no Kanban</Heading>
          <Text style={text}>
            A imobiliária <strong>{agency_name}</strong>{location ? ` (${location})` : ''} foi movida no funil.
          </Text>
          <Section style={card}>
            <Text style={label}>De</Text>
            <Text style={value}>{previous_status}</Text>
            <Hr style={hr} />
            <Text style={label}>Para</Text>
            <Text style={valueHighlight}>{new_status}</Text>
          </Section>
          <Text style={text}>Movido por: <strong>{moved_by}</strong></Text>
          <Text style={footer}>Agency Watch — notificação automática</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: KanbanStageChange,
  subject: (d: Record<string, any>) =>
    `[Kanban] ${d.agency_name ?? 'Imobiliária'} → ${d.new_status ?? 'nova etapa'}`,
  displayName: 'Mudança de etapa no Kanban',
  previewData: {
    agency_name: 'Imobiliária Exemplo',
    agency_city: 'São Paulo',
    agency_state: 'SP',
    previous_status: 'Pipeline de Prospecção',
    new_status: 'Em Negociação',
    moved_by: 'João da Silva',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '580px', margin: '0 auto' }
const heading = { fontSize: '22px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }
const text = { fontSize: '14px', lineHeight: '1.6', color: '#334155', marginBottom: '12px' }
const card = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const label = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#64748b', margin: '0 0 4px' }
const value = { fontSize: '15px', color: '#475569', margin: '0 0 12px' }
const valueHighlight = { fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }
const hr = { borderColor: '#e2e8f0', margin: '8px 0' }
const footer = { fontSize: '12px', color: '#64748b', marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }
