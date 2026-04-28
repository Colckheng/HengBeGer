export const MAX_ADMIN_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
export const INVALID_ADMIN_IMAGE_TYPE_MESSAGE = '\u53ea\u80fd\u4e0a\u4f20\u56fe\u7247\u6587\u4ef6\u3002';
export const ADMIN_IMAGE_TOO_LARGE_MESSAGE = '\u56fe\u7247\u4e0d\u80fd\u8d85\u8fc7 2MB\u3002';

export const validateAdminImageFile = (file) => {
  if (!file) {
    return { valid: true, error: '', file: null };
  }

  if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    return {
      valid: false,
      error: INVALID_ADMIN_IMAGE_TYPE_MESSAGE,
      file: null,
    };
  }

  if (typeof file.size === 'number' && file.size > MAX_ADMIN_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: ADMIN_IMAGE_TOO_LARGE_MESSAGE,
      file: null,
    };
  }

  return { valid: true, error: '', file };
};

export default validateAdminImageFile;
