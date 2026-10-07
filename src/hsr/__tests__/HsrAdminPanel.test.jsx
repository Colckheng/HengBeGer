import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import HsrAdminPanel from '../HsrAdminPanel.jsx';
import { ADMIN_IMAGE_TOO_LARGE_MESSAGE } from '../../utils/imageUpload.js';

vi.mock('../../DataContext.jsx', () => ({
  useData: () => ({
    data: {
      hsrCharacters: [],
      hsrCones: [],
      hsrRelics: [],
    },
    baseData: {
      hsr: {
        elements: [],
        paths: [],
        rarities: [],
        relicTypes: [],
        relicParts: [],
      },
    },
    loading: false,
    error: null,
    refreshData: vi.fn(),
    handleAddHsrCharacter: vi.fn(),
    handleUpdateHsrCharacter: vi.fn(),
    handleDeleteHsrCharacter: vi.fn(),
    handleAddHsrCone: vi.fn(),
    handleUpdateHsrCone: vi.fn(),
    handleDeleteHsrCone: vi.fn(),
    handleAddHsrRelic: vi.fn(),
    handleUpdateHsrRelic: vi.fn(),
    handleDeleteHsrRelic: vi.fn(),
  }),
}));

const IMAGE_LABEL = '\u56fe\u7247';
const PREVIEW_ALT = '\u9884\u89c8';
const HEADER_TITLE = 'HSR \u7ba1\u7406\u9762\u677f';

describe('HsrAdminPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders header title', () => {
    const { getByText } = render(
      <MemoryRouter>
        <HsrAdminPanel />
      </MemoryRouter>,
    );

    expect(getByText(HEADER_TITLE)).toBeTruthy();
  });

  it('rejects oversized images before reading them', async () => {
    const fileReaderSpy = vi.spyOn(globalThis, 'FileReader');

    render(
      <MemoryRouter>
        <HsrAdminPanel />
      </MemoryRouter>,
    );

    const fileInput = screen.getByLabelText(IMAGE_LABEL);
    const oversizedFile = new File(['oversized'], 'oversized.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', { value: 2 * 1024 * 1024 + 1 });

    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    expect(await screen.findByText(ADMIN_IMAGE_TOO_LARGE_MESSAGE)).toBeTruthy();
    expect(screen.queryByAltText(PREVIEW_ALT)).toBeNull();
    expect(fileReaderSpy).not.toHaveBeenCalled();
  });

  it('reads valid image files and shows preview', async () => {
    const result = 'data:image/png;base64,valid-image';
    const mockReadAsDataURL = vi.fn(function readAsDataURL() {
      this.result = result;
      this.onloadend();
    });

    vi.stubGlobal('FileReader', vi.fn(function FileReaderMock() {
      return {
        result: null,
        onloadend: null,
        readAsDataURL: mockReadAsDataURL,
      };
    }));

    render(
      <MemoryRouter>
        <HsrAdminPanel />
      </MemoryRouter>,
    );

    const fileInput = screen.getByLabelText(IMAGE_LABEL);
    const validFile = new File(['image'], 'valid.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByAltText(PREVIEW_ALT).getAttribute('src')).toBe(result);
    });
  });
});
