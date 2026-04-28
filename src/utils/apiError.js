export const getApiErrorMessage = (error, fallbackMessage = '\u64cd\u4f5c\u5931\u8d25\u3002') => {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  const responseMessage = error?.response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage.trim();
  }

  const responseError = error?.response?.data?.error;
  if (typeof responseError === 'string' && responseError.trim()) {
    return responseError.trim();
  }

  const errorMessage = error?.message;
  if (typeof errorMessage === 'string' && errorMessage.trim()) {
    return errorMessage.trim();
  }

  return fallbackMessage;
};

export default getApiErrorMessage;
