import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import HsrAdminPanel from '../../hsr/HsrAdminPanel.jsx'

describe('HsrAdminPanel', () => {
  it('renders header title', () => {
    const { getByText } = render(<HsrAdminPanel />)
    expect(getByText('HSR 管理员面板')).toBeTruthy()
  })
})
