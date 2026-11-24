import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))

import { redirectSystemPath } from '../../app/+native-intent'
import { passwordProblem, safeInternalPath, systemFromParam } from './links'

describe('post-sign-in destinations', () => {
  it('accepts in-app paths only', () => {
    expect(safeInternalPath('/qr/ABCD1234')).toBe('/qr/ABCD1234')
    expect(safeInternalPath(['/profile/abc', '/other'])).toBe('/profile/abc')
    for (const bad of ['//evil.example/x', 'https://evil.example', 'profile/abc', String.raw`/\evil.example`, '', null, undefined]) {
      expect(safeInternalPath(bad)).toBeNull()
    }
  })

  it('falls back when the system parameter is not one of the three systems', () => {
    expect(systemFromParam('seq', 'app')).toBe('seq')
    expect(systemFromParam(['bms'], 'app')).toBe('bms')
    expect(systemFromParam('admin', 'app')).toBe('app')
    expect(systemFromParam(undefined, 'seq')).toBe('seq')
  })
})

describe('password rules per system', () => {
  it('Genealogiq needs eight characters; the staff systems also need mixed character classes', () => {
    expect(passwordProblem('app', 'abcdefg')).toBe('short')
    expect(passwordProblem('app', 'abcdefgh')).toBeNull()
    expect(passwordProblem('seq', 'abcdefgh')).toBe('weak')
    expect(passwordProblem('bms', 'Abcdefg1')).toBe('weak')
    expect(passwordProblem('bms', 'Abcdef1!')).toBeNull()
    expect(passwordProblem('seq', 'Ab1!')).toBe('short')
  })
})

describe('links from email and QR plaques', () => {
  const route = (path: string) => redirectSystemPath({ path, initial: true })

  it('keeps consumer links on their own path', () => {
    expect(route('https://genealogiq.com.br/qr/ABCD1234')).toBe('/qr/ABCD1234')
    expect(route('https://www.genealogiq.com.br/profile/abc123')).toBe('/profile/abc123')
  })

  it('carries the host as the system for account links', () => {
    expect(route('https://sequoia.genealogiq.com.br/reset-password?token=t1')).toBe('/reset-password?token=t1&system=seq')
    expect(route('https://bms.genealogiq.com.br/reset-password?token=t2')).toBe('/reset-password?token=t2&system=bms')
    expect(route('https://genealogiq.com.br/reset-password?token=t3&callbackUrl=%2Fqr%2FABCD1234')).toBe(
      '/reset-password?token=t3&callbackUrl=%2Fqr%2FABCD1234&system=app',
    )
  })

  it('sends the web email-verification API link to the in-app screen', () => {
    expect(route('https://genealogiq.com.br/api/verify-email?token=v1')).toBe('/verify-email?token=v1&system=app')
  })

  it('leaves in-app and unknown-host paths untouched', () => {
    expect(route('/seq/dashboard')).toBe('/seq/dashboard')
    expect(route('https://example.org/reset-password?token=x')).toBe('https://example.org/reset-password?token=x')
  })
})
