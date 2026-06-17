import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  message?: string
}

const TestEmail = ({ name, message }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Teste de e-mail do Agency Watch</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Agency Watch</Heading>
        <Text style={text}>
          {name ? `Olá ${name},` : 'Olá,'}
        </Text>
        <Text style={text}>
          {message || 'Este é um e-mail de teste do sistema Agency Watch.'}
        </Text>
        <Text style={text}>
          Se você recebeu esta mensagem, a infraestrutura de e-mails está funcionando corretamente.
        </Text>
        <Text style={footer}>
          Equipe Agency Watch
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TestEmail,
  subject: 'Teste de e-mail - Agency Watch',
  displayName: 'E-mail de teste',
  previewData: { name: 'Usuário', message: 'Mensagem de teste personalizada' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '580px', margin: '0 auto' }
const heading = { fontSize: '22px', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }
const text = { fontSize: '14px', lineHeight: '1.6', color: '#334155', marginBottom: '12px' }
const footer = { fontSize: '12px', color: '#64748b', marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }
