import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { allOrders, molds, stockModels } from '../../schema';
import { eq, ne, isNull, and, sql, count } from 'drizzle-orm';

const router = Router();

interface ModelDepartmentData {
  modelId: string;
  modelName: string;
  department: string;
  count: number;
  onSchedule: number;
  deptOverdue: number;
  cannotMeetDue: number;
  critical: number;
}

interface ModelAnalytics {
  modelId: string;
  modelName: string;
  displayName: string;
  isAdjustable: boolean;
  totalInPipeline: number;
  moldCapacity: number;
  queueToCapacityRatio: number;
  healthGrade: 'excellent' | 'good' | 'warning' | 'critical';
  departmentBreakdown: Record<string, {
    count: number;
    onSchedule: number;
    deptOverdue: number;
    cannotMeetDue: number;
    critical: number;
  }>;
  latePercentage: number;
  avgDaysInPipeline: number | null;
}

interface HistoricalDataPoint {
  modelId: string;
  orderDate: Date;
  dueDate: Date;
  fulfilledDate: Date;
}

const ADJUSTABLE_KEYWORDS = ['adjustable', 'adj', 'ferrata'];

function isAdjustableModel(modelName: string): boolean {
  const lowerName = modelName.toLowerCase();
  return ADJUSTABLE_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

function calculateHealthGrade(
  latePercentage: number,
  queueToCapacityRatio: number
): 'excellent' | 'good' | 'warning' | 'critical' {
  if (latePercentage >= 30 || queueToCapacityRatio >= 3) return 'critical';
  if (latePercentage >= 15 || queueToCapacityRatio >= 2) return 'warning';
  if (latePercentage >= 5 || queueToCapacityRatio >= 1.5) return 'good';
  return 'excellent';
}

function normalizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/stock$/, '')
    .replace(/model$/, '');
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const pipelineDetails = await storage.getPipelineDetails();
    const allMolds = await storage.getAllMolds();
    const stockModelsList = await storage.getAllStockModels();

    const stockModelMap: Record<string, any> = {};
    stockModelsList.forEach((sm: any) => {
      stockModelMap[sm.id] = sm;
      stockModelMap[normalizeModelName(sm.id)] = sm;
      if (sm.name) stockModelMap[normalizeModelName(sm.name)] = sm;
      if (sm.displayName) stockModelMap[normalizeModelName(sm.displayName)] = sm;
    });

    const moldCapacityByNormalizedName: Record<string, number> = {};
    const moldCapacityByModelId: Record<string, number> = {};
    
    allMolds.forEach(mold => {
      if (mold.enabled) {
        const multiplier = mold.multiplier || 1;
        const normalizedMoldName = normalizeModelName(mold.modelName);
        
        moldCapacityByNormalizedName[normalizedMoldName] = 
          (moldCapacityByNormalizedName[normalizedMoldName] || 0) + multiplier;
        
        if (mold.stockModels && Array.isArray(mold.stockModels)) {
          mold.stockModels.forEach((stockModelId: string) => {
            moldCapacityByModelId[stockModelId] = 
              (moldCapacityByModelId[stockModelId] || 0) + multiplier;
            
            const normalizedStockId = normalizeModelName(stockModelId);
            moldCapacityByNormalizedName[normalizedStockId] = 
              (moldCapacityByNormalizedName[normalizedStockId] || 0) + multiplier;
          });
        }
        
        const matchedStockModel = stockModelMap[normalizedMoldName];
        if (matchedStockModel) {
          moldCapacityByModelId[matchedStockModel.id] = 
            (moldCapacityByModelId[matchedStockModel.id] || 0) + multiplier;
        }
      }
    });

    const getMoldCapacity = (modelId: string, displayName: string): number => {
      if (moldCapacityByModelId[modelId]) {
        return moldCapacityByModelId[modelId];
      }
      
      const normalizedId = normalizeModelName(modelId);
      if (moldCapacityByNormalizedName[normalizedId]) {
        return moldCapacityByNormalizedName[normalizedId];
      }
      
      const normalizedDisplay = normalizeModelName(displayName);
      if (moldCapacityByNormalizedName[normalizedDisplay]) {
        return moldCapacityByNormalizedName[normalizedDisplay];
      }
      
      return 1;
    };

    const modelDataMap: Record<string, ModelAnalytics> = {};

    const getCanonicalModelId = (rawModelId: string): { canonicalId: string; stockModel: any } => {
      const stockModel = stockModelMap[rawModelId] || stockModelMap[normalizeModelName(rawModelId)];
      if (stockModel) {
        return { canonicalId: stockModel.id, stockModel };
      }
      return { canonicalId: normalizeModelName(rawModelId), stockModel: null };
    };

    Object.entries(pipelineDetails).forEach(([department, orders]) => {
      orders.forEach((order: any) => {
        const rawModelId = order.modelId || 'unknown';
        const { canonicalId, stockModel } = getCanonicalModelId(rawModelId);
        
        if (!modelDataMap[canonicalId]) {
          const displayName = stockModel?.displayName || stockModel?.name || rawModelId;
          const moldCapacity = getMoldCapacity(canonicalId, displayName);
          
          modelDataMap[canonicalId] = {
            modelId: canonicalId,
            modelName: stockModel?.name || rawModelId,
            displayName,
            isAdjustable: isAdjustableModel(displayName),
            totalInPipeline: 0,
            moldCapacity,
            queueToCapacityRatio: 0,
            healthGrade: 'excellent',
            departmentBreakdown: {},
            latePercentage: 0,
            avgDaysInPipeline: null,
          };
        }

        const model = modelDataMap[canonicalId];
        model.totalInPipeline++;

        if (!model.departmentBreakdown[department]) {
          model.departmentBreakdown[department] = {
            count: 0,
            onSchedule: 0,
            deptOverdue: 0,
            cannotMeetDue: 0,
            critical: 0,
          };
        }

        const deptData = model.departmentBreakdown[department];
        deptData.count++;

        switch (order.scheduleStatus) {
          case 'on-schedule':
            deptData.onSchedule++;
            break;
          case 'dept-overdue':
            deptData.deptOverdue++;
            break;
          case 'cannot-meet-due':
            deptData.cannotMeetDue++;
            break;
          case 'critical':
            deptData.critical++;
            break;
        }
      });
    });

    Object.values(modelDataMap).forEach(model => {
      let totalLate = 0;
      let totalOrders = 0;

      Object.values(model.departmentBreakdown).forEach(dept => {
        totalOrders += dept.count;
        totalLate += dept.deptOverdue + dept.cannotMeetDue + dept.critical;
      });

      model.latePercentage = totalOrders > 0 ? (totalLate / totalOrders) * 100 : 0;
      model.queueToCapacityRatio = model.moldCapacity > 0 
        ? model.totalInPipeline / model.moldCapacity 
        : model.totalInPipeline;
      model.healthGrade = calculateHealthGrade(model.latePercentage, model.queueToCapacityRatio);
    });

    const analyticsArray = Object.values(modelDataMap).sort((a, b) => {
      const gradeOrder = { critical: 0, warning: 1, good: 2, excellent: 3 };
      if (gradeOrder[a.healthGrade] !== gradeOrder[b.healthGrade]) {
        return gradeOrder[a.healthGrade] - gradeOrder[b.healthGrade];
      }
      return b.totalInPipeline - a.totalInPipeline;
    });

    res.json({
      models: analyticsArray,
      summary: {
        totalModels: analyticsArray.length,
        totalInPipeline: analyticsArray.reduce((sum, m) => sum + m.totalInPipeline, 0),
        criticalModels: analyticsArray.filter(m => m.healthGrade === 'critical').length,
        warningModels: analyticsArray.filter(m => m.healthGrade === 'warning').length,
      },
      moldCapacity: moldCapacityByModelId,
    });
  } catch (error) {
    console.error('Model analytics fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch model analytics' });
  }
});

router.get('/department-breakdown', async (req: Request, res: Response) => {
  try {
    const pipelineDetails = await storage.getPipelineDetails();
    const stockModelsList = await storage.getAllStockModels();

    const stockModelMap: Record<string, any> = {};
    stockModelsList.forEach((sm: any) => {
      stockModelMap[sm.id] = sm;
      stockModelMap[normalizeModelName(sm.id)] = sm;
      if (sm.name) stockModelMap[normalizeModelName(sm.name)] = sm;
      if (sm.displayName) stockModelMap[normalizeModelName(sm.displayName)] = sm;
    });

    const getCanonicalDisplay = (rawModelId: string): string => {
      const stockModel = stockModelMap[rawModelId] || stockModelMap[normalizeModelName(rawModelId)];
      return stockModel?.displayName || stockModel?.name || rawModelId;
    };

    const departments = [
      'P1 Production Queue',
      'Layup/Plugging',
      'Barcode',
      'CNC',
      'Gunsmith',
      'Finish',
      'Finish QC',
      'Paint',
      'Shipping QC',
      'Shipping',
    ];

    const breakdown: Record<string, Record<string, number>> = {};

    departments.forEach(dept => {
      breakdown[dept] = {};
      const orders = pipelineDetails[dept] || [];
      
      orders.forEach((order: any) => {
        const rawModelId = order.modelId || 'unknown';
        const displayName = getCanonicalDisplay(rawModelId);
        
        breakdown[dept][displayName] = (breakdown[dept][displayName] || 0) + 1;
      });
    });

    res.json({ breakdown, departments });
  } catch (error) {
    console.error('Department breakdown fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch department breakdown' });
  }
});

router.get('/mold-capacity', async (req: Request, res: Response) => {
  try {
    const allMolds = await storage.getAllMolds();
    const stockModelsList = await storage.getAllStockModels();

    const moldsByModel: Record<string, {
      modelName: string;
      displayName: string;
      molds: Array<{
        moldId: string;
        instanceNumber: number;
        enabled: boolean;
        multiplier: number;
      }>;
      totalCapacity: number;
      enabledCapacity: number;
    }> = {};

    allMolds.forEach(mold => {
      const modelName = mold.modelName;
      
      if (!moldsByModel[modelName]) {
        const stockModel = stockModelsList.find((m: any) => 
          m.name === modelName || m.displayName === modelName ||
          normalizeModelName(m.name || '') === normalizeModelName(modelName) ||
          normalizeModelName(m.displayName || '') === normalizeModelName(modelName)
        );
        
        moldsByModel[modelName] = {
          modelName,
          displayName: stockModel?.displayName || modelName,
          molds: [],
          totalCapacity: 0,
          enabledCapacity: 0,
        };
      }

      moldsByModel[modelName].molds.push({
        moldId: mold.moldId,
        instanceNumber: mold.instanceNumber,
        enabled: mold.enabled || false,
        multiplier: mold.multiplier || 1,
      });

      moldsByModel[modelName].totalCapacity += mold.multiplier || 1;
      if (mold.enabled) {
        moldsByModel[modelName].enabledCapacity += mold.multiplier || 1;
      }
    });

    res.json(Object.values(moldsByModel));
  } catch (error) {
    console.error('Mold capacity fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch mold capacity' });
  }
});

router.post('/historical-data', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Data must be an array' });
    }

    res.json({ 
      success: true, 
      message: `Received ${data.length} historical records`,
      recordsProcessed: data.length,
    });
  } catch (error) {
    console.error('Historical data upload error:', error);
    res.status(500).json({ error: 'Failed to process historical data' });
  }
});

export default router;
