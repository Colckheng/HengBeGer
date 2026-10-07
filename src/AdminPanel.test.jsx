import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import AdminPanel from './AdminPanel.jsx';
import {
  ADMIN_IMAGE_TOO_LARGE_MESSAGE,
  INVALID_ADMIN_IMAGE_TYPE_MESSAGE,
} from './utils/imageUpload.js';

vi.mock('./DataContext.jsx', () => ({
  useData: () => ({
    data: {
      agents: [],
      soundEngines: [],
      bumbos: [],
      driveDisks: [],
    },
    baseData: {
      factions: [{ id: 1, name: 'Faction' }],
      roles: [{ id: 1, name: 'Attack' }],
      rarities: [{ id: 1, name: 'S' }],
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
    handleAddAgent: vi.fn(),
    handleUpdateAgent: vi.fn(),
    handleDeleteAgent: vi.fn(),
    handleAddSoundEngine: vi.fn(),
    handleUpdateSoundEngine: vi.fn(),
    handleDeleteSoundEngine: vi.fn(),
    handleAddBumbo: vi.fn(),
    handleUpdateBumbo: vi.fn(),
    handleDeleteBumbo: vi.fn(),
    handleAddDriveDisk: vi.fn(),
    handleUpdateDriveDisk: vi.fn(),
    handleDeleteDriveDisk: vi.fn(),
  }),
}));

const IMAGE_LABEL = '\u56fe\u7247';
const PREVIEW_ALT = '\u9884\u89c8';

describe('AdminPanel image validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects oversized images before reading them', async () => {
    const fileReaderSpy = vi.spyOn(globalThis, 'FileReader');

    render(
      <MemoryRouter>
        <AdminPanel />
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

  it('rejects non-image files before reading them', async () => {
    const fileReaderSpy = vi.spyOn(globalThis, 'FileReader');

    render(
      <MemoryRouter>
        <AdminPanel />
      </MemoryRouter>,
    );

    const fileInput = screen.getByLabelText(IMAGE_LABEL);
    const invalidFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(await screen.findByText(INVALID_ADMIN_IMAGE_TYPE_MESSAGE)).toBeTruthy();
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
        <AdminPanel />
      </MemoryRouter>,
    );

    const fileInput = screen.getByLabelText(IMAGE_LABEL);
    const validFile = new File(['image'], 'valid.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByAltText(PREVIEW_ALT).getAttribute('src')).toBe(result);
    });
    expect(screen.queryByText(ADMIN_IMAGE_TOO_LARGE_MESSAGE)).toBeNull();
    expect(screen.queryByText(INVALID_ADMIN_IMAGE_TYPE_MESSAGE)).toBeNull();
  });
});
