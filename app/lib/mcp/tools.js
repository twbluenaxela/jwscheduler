import { countData, refreshLines, validateMonth, nonnegative } from '../inventoryServer';
import { quantity, note, status, id } from '../literatureApi';
import { scheduleTools } from './scheduleTools.mjs';
import { createTools } from './toolsCore.mjs';

export const tools = [...createTools({ countData, refreshLines, validateMonth, nonnegative, quantity, note, status, id }), ...scheduleTools];
