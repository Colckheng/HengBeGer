import {
  replaceAllRecords,
  replaceMultipleRecordSets,
  syncDatabaseToStorage,
} from '../db/api.js';
import storageManager, { STORAGE_TYPES } from '../db/storageManager.js';
import { logAdminAudit } from '../utils/adminAudit.js';
import { logger } from '../utils/logger.js';

const REQUIRED_FIELDS = {
  agents: ['name', 'element'],
  soundEngines: ['name'],
  bumbos: ['name'],
  driveDisks: ['name'],
  hsrCharacters: ['name'],
  hsrCones: ['name'],
  hsrRelics: ['name'],
};

const TYPE_SPECIFIC_VALIDATORS = {
  agents: (item, errors, index) => {
    if (!item.factionId && !item.faction) {
      errors.push(`agents[${index}] is missing faction or factionId.`);
    }
    if (!item.roleId && !item.role && !item.profession) {
      errors.push(`agents[${index}] is missing role or roleId.`);
    }
    if (!item.rarityId && !item.rarity) {
      errors.push(`agents[${index}] is missing rarity or rarityId.`);
    }
  },
  soundEngines: (item, errors, index) => {
    if (!item.roleId && !item.role) {
      errors.push(`soundEngines[${index}] is missing role or roleId.`);
    }
    if (!item.rarityId && !item.rarity) {
      errors.push(`soundEngines[${index}] is missing rarity or rarityId.`);
    }
  },
  bumbos: (item, errors, index) => {
    if (!item.rarityId && !item.rarity) {
      errors.push(`bumbos[${index}] is missing rarity or rarityId.`);
    }
  },
  hsrCharacters: (item, errors, index) => {
    if (!item.elementId && !item.element) {
      errors.push(`hsrCharacters[${index}] is missing element or elementId.`);
    }
    if (!item.pathId && !item.path) {
      errors.push(`hsrCharacters[${index}] is missing path or pathId.`);
    }
    if (!item.rarityId && !item.rarity) {
      errors.push(`hsrCharacters[${index}] is missing rarity or rarityId.`);
    }
  },
  hsrCones: (item, errors, index) => {
    if (!item.pathId && !item.path) {
      errors.push(`hsrCones[${index}] is missing path or pathId.`);
    }
    if (!item.rarityId && !item.rarity) {
      errors.push(`hsrCones[${index}] is missing rarity or rarityId.`);
    }
  },
  hsrRelics: (item, errors, index) => {
    if (!item.typeId && !item.type) {
      errors.push(`hsrRelics[${index}] is missing type or typeId.`);
    }
  },
};

const validateType = (type) => {
  if (!STORAGE_TYPES.includes(type)) {
    throw new Error(`Unsupported data type: ${type}`);
  }
};

const validateItems = (type, items) => {
  if (!Array.isArray(items)) {
    return [`${type} payload must be an array.`];
  }

  const errors = [];
  const requiredFields = REQUIRED_FIELDS[type] || [];
  const typeValidator = TYPE_SPECIFIC_VALIDATORS[type];

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${type}[${index}] must be an object.`);
      return;
    }

    for (const field of requiredFields) {
      if (!item[field]) {
        errors.push(`${type}[${index}] is missing ${field}.`);
      }
    }

    typeValidator?.(item, errors, index);
  });

  return errors;
};

class DataSyncController {
  static async getAllData(req, res) {
    try {
      const data = await storageManager.getAllStorageData();
      res.json({
        success: true,
        message: 'Storage data loaded successfully.',
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to load storage data', {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to load storage data.',
        error: error.message,
      });
    }
  }

  static async getDataByType(req, res) {
    try {
      validateType(req.params.type);
      const data = await storageManager.readFromStorage(req.params.type);
      res.json({
        success: true,
        message: `${req.params.type} data loaded successfully.`,
        data,
        count: data.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to load storage data by type', {
        type: req.params.type,
        message: error.message,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to load storage data.',
        error: error.message,
      });
    }
  }

  static async updateDataByType(req, res) {
    try {
      const { type } = req.params;
      const { data } = req.body;

      validateType(type);
      const validationErrors = validateItems(type, data);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors: validationErrors,
        });
      }

      const snapshot = await replaceAllRecords(type, data);
      logAdminAudit(req, 'storage.replaceByType', {
        storageType: type,
        count: snapshot[type]?.length || 0,
      });
      res.json({
        success: true,
        message: `${type} data replaced successfully.`,
        count: snapshot[type]?.length || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to replace data by type', {
        type: req.params.type,
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to replace data.',
        error: error.message,
      });
    }
  }

  static async updateAllData(req, res) {
    try {
      const payload = req.body?.data;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({
          success: false,
          message: 'Payload data must be an object keyed by storage type.',
        });
      }

      const touchedTypes = STORAGE_TYPES.filter((type) =>
        Object.prototype.hasOwnProperty.call(payload, type),
      );

      for (const type of touchedTypes) {
        const validationErrors = validateItems(type, payload[type]);
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Validation failed for ${type}.`,
            errors: validationErrors,
          });
        }
      }

      const snapshot = await replaceMultipleRecordSets(
        touchedTypes.reduce((result, type) => {
          result[type] = payload[type];
          return result;
        }, {}),
      );
      const results = touchedTypes.reduce((result, type) => {
        result[type] = {
          success: true,
          count: snapshot[type]?.length || 0,
        };
        return result;
      }, {});
      logAdminAudit(req, 'storage.replaceBatch', {
        results: Object.fromEntries(
          touchedTypes.map((type) => [type, snapshot[type]?.length || 0]),
        ),
      });

      res.json({
        success: true,
        message: 'All provided data sets were replaced successfully.',
        results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to replace all storage data', {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to replace all storage data.',
        error: error.message,
      });
    }
  }

  static async getStorageStatus(req, res) {
    try {
      const status = await storageManager.getStorageStatus();
      res.json({
        success: true,
        message: 'Storage status loaded successfully.',
        status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to load storage status', {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to load storage status.',
        error: error.message,
      });
    }
  }

  static async resetStorage(req, res) {
    try {
      const snapshot = await syncDatabaseToStorage();
      logAdminAudit(req, 'storage.rebuildFromDatabase', {
        counts: Object.fromEntries(
          Object.entries(snapshot).map(([type, items]) => [type, items.length]),
        ),
      });
      res.json({
        success: true,
        message: 'Storage rebuilt from the database.',
        counts: Object.fromEntries(
          Object.entries(snapshot).map(([type, items]) => [type, items.length]),
        ),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to rebuild storage from database', {
        message: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to rebuild storage from database.',
        error: error.message,
      });
    }
  }
}

export default DataSyncController;
