import { extractFunctionError } from './functionError';

describe('extractFunctionError', () => {
  test('extracts error string from FunctionsHttpError JSON response context', async () => {
    const fakeError = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        clone() {
          return this;
        },
        async json() {
          return { error: 'Already booked or in waiting list' };
        },
      },
    };

    await expect(extractFunctionError(fakeError, 'Booking failed')).resolves.toBe(
      'Already booked or in waiting list',
    );
  });

  test('falls back to text body when JSON parsing fails', async () => {
    const fakeError = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        async json() {
          throw new Error('Invalid JSON');
        },
        async text() {
          return 'Upstream gateway timeout';
        },
      },
    };

    await expect(extractFunctionError(fakeError, 'Fallback')).resolves.toBe(
      'Upstream gateway timeout',
    );
  });

  test('uses fallbackMessage when error only carries generic non-2xx message', async () => {
    const genericError = new Error('Edge Function returned a non-2xx status code');
    await expect(extractFunctionError(genericError, 'Unable to cancel')).resolves.toBe(
      'Unable to cancel',
    );
  });

  test('preserves informative error messages when no response context is attached', async () => {
    const specificError = new Error('Missing auth session');
    await expect(extractFunctionError(specificError, 'Fallback')).resolves.toBe(
      'Missing auth session',
    );
  });
});
