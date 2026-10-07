import { jest } from '@jest/globals';
import validationModule from '../middleware/validation.cjs';

const {
  validateAgentData,
  validateBody,
  validateHsrCharacterData,
  validateId,
} = validationModule;

describe('validation middleware', () => {
  it('normalizes a valid numeric id parameter', () => {
    const req = { params: { id: '12' } };
    const next = jest.fn();

    validateId(req, {}, next);

    expect(req.params.id).toBe(12);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an invalid id parameter', () => {
    const req = { params: { id: 'abc' } };
    const next = jest.fn();

    validateId(req, {}, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(400);
  });

  it('rejects an empty request body', () => {
    const req = { body: {} };
    const next = jest.fn();
    const middleware = validateBody(validateAgentData);

    middleware(req, {}, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(400);
  });

  it('rejects invalid numeric ids in agent payloads', () => {
    expect(() => validateAgentData({
      name: 'Agent',
      element: 'Fire',
      factionId: 'bad-id',
      roleId: 1,
      rarityId: 1,
    })).toThrow();
  });

  it('rejects invalid numeric ids in HSR character payloads', () => {
    expect(() => validateHsrCharacterData({
      name: 'March 7th',
      elementId: 'bad-id',
      pathId: 1,
      rarityId: 1,
    })).toThrow();
  });

  it('keeps drive disk image payloads instead of dropping them', () => {
    const { validateDriveDiskData } = validationModule;
    const cleaned = validateDriveDiskData({
      name: 'Rotor 4',
      description: 'Balance',
      image: 'data:image/png;base64,abc',
    });

    expect(cleaned.image).toBe('data:image/png;base64,abc');
    expect(cleaned.description).toBe('Balance');
  });

  it('keeps empty HSR character descriptions so clears are not ignored', () => {
    const cleaned = validateHsrCharacterData({
      name: 'March 7th',
      elementId: 1,
      pathId: 1,
      rarityId: 1,
      description: '',
    });

    expect(cleaned.description).toBe('');
  });
});
