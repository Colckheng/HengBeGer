const { AppError } = require('./errorHandler.cjs');

// 输入验证工具函数
const validators = {
  // 验证字符串
  isString: (value, fieldName) => {
    if (typeof value !== 'string') {
      throw new AppError(`${fieldName} 必须是字符串`, 400);
    }
    return value.trim();
  },

  // 验证非空字符串
  isNonEmptyString: (value, fieldName) => {
    const trimmed = validators.isString(value, fieldName);
    if (!trimmed) {
      throw new AppError(`${fieldName} 不能为空`, 400);
    }
    return trimmed;
  },

  // 验证数字
  isNumber: (value, fieldName) => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new AppError(`${fieldName} 必须是有效数字`, 400);
    }
    return num;
  },

  // 验证正整数
  isPositiveInteger: (value, fieldName) => {
    const num = validators.isNumber(value, fieldName);
    if (!Number.isInteger(num) || num <= 0) {
      throw new AppError(`${fieldName} 必须是正整数`, 400);
    }
    return num;
  },

  // 验证数组
  isArray: (value, fieldName) => {
    if (!Array.isArray(value)) {
      throw new AppError(`${fieldName} 必须是数组`, 400);
    }
    return value;
  },

  // 验证对象
  isObject: (value, fieldName) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AppError(`${fieldName} 必须是对象`, 400);
    }
    return value;
  },

  // 验证枚举值
  isEnum: (value, allowedValues, fieldName) => {
    if (!allowedValues.includes(value)) {
      throw new AppError(`${fieldName} 必须是以下值之一: ${allowedValues.join(', ')}`, 400);
    }
    return value;
  },

  // 验证字符串长度
  hasLength: (value, min, max, fieldName) => {
    const str = validators.isString(value, fieldName);
    if (str.length < min || str.length > max) {
      throw new AppError(`${fieldName} 长度必须在 ${min} 到 ${max} 之间`, 400);
    }
    return str;
  },

  // 清理HTML标签
  sanitizeHtml: (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/<[^>]*>/g, '').trim();
  },

  // 清理SQL注入字符
  sanitizeSql: (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/[';"\\]/g, '').trim();
  }
};

// 代理人数据验证
const validateAgentData = (data) => {
  const cleaned = {};
  
  // 必填字段
  cleaned.name = validators.hasLength(data.name, 1, 50, '代理人名称');
  cleaned.element = validators.hasLength(data.element, 1, 20, '属性');
  if (data.rarityId !== undefined) {
    cleaned.rarityId = validators.isPositiveInteger(data.rarityId, '稀有度ID');
  } else {
    cleaned.rarity = validators.isEnum(data.rarity, ['S', 'A', 'B'], '稀有度');
  }
  if (data.factionId !== undefined) {
    cleaned.factionId = validators.isPositiveInteger(data.factionId, '阵营ID');
  } else {
    cleaned.faction = validators.hasLength(data.faction, 1, 30, '阵营');
  }
  if (data.roleId !== undefined) {
    cleaned.roleId = validators.isPositiveInteger(data.roleId, '职业ID');
  } else if (data.role || data.profession) {
    cleaned.role = validators.hasLength(data.role || data.profession, 1, 30, '职业');
  }
  
  // 可选字段
  if (data.description) {
    cleaned.description = validators.hasLength(data.description, 0, 500, '描述');
    cleaned.description = validators.sanitizeHtml(cleaned.description);
  }
  
  if (data.image) {
    cleaned.image = validators.hasLength(data.image, 0, 5000000, '图片数据');
  }
  
  if (data.skills && Array.isArray(data.skills)) {
    cleaned.skills = data.skills.map(skill => {
      if (typeof skill === 'string') {
        return validators.sanitizeHtml(skill.trim());
      }
      return skill;
    });
  }
  
  return cleaned;
};

// 阵营数据验证
const validateFactionData = (data) => {
  const cleaned = {};
  
  cleaned.name = validators.hasLength(data.name, 1, 50, '阵营名称');
  
  if (data.description) {
    cleaned.description = validators.hasLength(data.description, 0, 500, '描述');
    cleaned.description = validators.sanitizeHtml(cleaned.description);
  }
  
  if (data.logo) {
    cleaned.logo = validators.hasLength(data.logo, 0, 200, 'Logo路径');
  }
  
  return cleaned;
};

// 音擎数据验证
const validateSoundEngineData = (data) => {
  const cleaned = {};
  
  cleaned.name = validators.hasLength(data.name, 1, 50, '音擎名称');
  if (data.rarityId !== undefined) {
    cleaned.rarityId = validators.isPositiveInteger(data.rarityId, '稀有度ID');
  } else {
    cleaned.rarity = validators.isEnum(data.rarity, ['S', 'A', 'B'], '稀有度');
  }
  if (data.roleId !== undefined) {
    cleaned.roleId = validators.isPositiveInteger(data.roleId, '职业ID');
  } else {
    cleaned.role = validators.hasLength(data.role, 1, 30, '职业');
  }
  
  if (data.description) {
    cleaned.description = validators.hasLength(data.description, 0, 500, '描述');
    cleaned.description = validators.sanitizeHtml(cleaned.description);
  }
  
  if (data.image) {
    cleaned.image = validators.hasLength(data.image, 0, 5000000, '图片数据');
  }
  
  // 可选数值字段留空，由业务层决定
  
  return cleaned;
};

// 邦布数据验证
const validateBumboData = (data) => {
  const cleaned = {};
  
  cleaned.name = validators.hasLength(data.name, 1, 50, '邦布名称');
  if (data.rarityId !== undefined) {
    cleaned.rarityId = validators.isPositiveInteger(data.rarityId, '稀有度ID');
  } else {
    cleaned.rarity = validators.isEnum(data.rarity, ['S', 'A'], '稀有度');
  }
  
  if (data.description) {
    cleaned.description = validators.hasLength(data.description, 0, 500, '描述');
    cleaned.description = validators.sanitizeHtml(cleaned.description);
  }
  
  if (data.image) {
    cleaned.image = validators.hasLength(data.image, 0, 5000000, '图片数据');
  }
  
  if (data.skills && Array.isArray(data.skills)) {
    cleaned.skills = data.skills.map(skill => {
      if (typeof skill === 'string') {
        return validators.sanitizeHtml(skill.trim());
      }
      return skill;
    });
  }
  
  return cleaned;
};

// 驱动盘数据验证
const validateDriveDiskData = (data) => {
  const cleaned = {};
  
  cleaned.name = validators.hasLength(data.name, 1, 50, '驱动盘名称');
  
  if (data.description) {
    cleaned.description = validators.hasLength(data.description, 0, 500, '描述');
    cleaned.description = validators.sanitizeHtml(cleaned.description);
  }
  
  return cleaned;
};

// ID参数验证中间件
const validateId = (req, res, next) => {
  try {
    const id = validators.isPositiveInteger(req.params.id, 'ID');
    req.params.id = id;
    next();
  } catch (error) {
    next(error);
  }
};

// 数据类型验证中间件
const validateDataType = (req, res, next) => {
  try {
    const allowedTypes = ['agents', 'factions', 'soundEngines', 'bumbos', 'driveDisks', 'hsrCharacters', 'hsrCones', 'hsrRelics'];
    const type = validators.isEnum(req.params.type, allowedTypes, '数据类型');
    req.params.type = type;
    next();
  } catch (error) {
    next(error);
  }
};

// HSR 验证
const validateHsrCharacterData = (data) => {
  const cleaned = {}
  cleaned.name = validators.hasLength(data.name, 1, 50, '角色名称')
  if (data.elementId !== undefined) cleaned.elementId = validators.isPositiveInteger(data.elementId, '元素ID')
  else cleaned.element = validators.hasLength(data.element || '', 1, 10, '角色元素')
  if (data.pathId !== undefined) cleaned.pathId = validators.isPositiveInteger(data.pathId, '命途ID')
  else cleaned.path = validators.hasLength(data.path || '', 1, 10, '角色命途')
  if (data.rarityId !== undefined) cleaned.rarityId = validators.isPositiveInteger(data.rarityId, '稀有度ID')
  else cleaned.rarity = validators.hasLength(data.rarity || '', 1, 5, '稀有度')
  if (data.image) cleaned.image = validators.hasLength(data.image, 0, 5000000, '图片数据')
  return cleaned
}

const validateHsrConeData = (data) => {
  const cleaned = {}
  cleaned.name = validators.hasLength(data.name, 1, 50, '光锥名称')
  if (data.pathId !== undefined) cleaned.pathId = validators.isPositiveInteger(data.pathId, '命途ID')
  else cleaned.path = validators.hasLength(data.path || '', 1, 10, '命途')
  if (data.rarityId !== undefined) cleaned.rarityId = validators.isPositiveInteger(data.rarityId, '稀有度ID')
  else cleaned.rarity = validators.hasLength(data.rarity || '', 1, 5, '稀有度')
  if (data.image) cleaned.image = validators.hasLength(data.image, 0, 5000000, '图片数据')
  return cleaned
}

const validateHsrRelicData = (data) => {
  const cleaned = {}
  cleaned.name = validators.hasLength(data.name, 1, 50, '遗器名称')
  if (data.typeId !== undefined) cleaned.typeId = validators.isPositiveInteger(data.typeId, '遗器类型ID')
  else cleaned.type = validators.isEnum(data.type, ['隧洞遗器','位面饰品'], '遗器类型')
  if (data.setName) cleaned.setName = validators.hasLength(data.setName, 1, 50, '套装名')
  if (data.part) cleaned.part = validators.isEnum(data.part, ['头','手','身','脚','位面球','连结绳'], '部位')
  if (data.image) cleaned.image = validators.hasLength(data.image, 0, 5000000, '图片数据')
  return cleaned
}

// 请求体验证中间件工厂
const validateBody = (validatorFn) => {
  return (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new AppError('请求体不能为空', 400);
      }
      
      req.body = validatorFn(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  validators,
  validateAgentData,
  validateFactionData,
  validateSoundEngineData,
  validateBumboData,
  validateDriveDiskData,
  validateHsrCharacterData,
  validateHsrConeData,
  validateHsrRelicData,
  validateId,
  validateDataType,
  validateBody
};