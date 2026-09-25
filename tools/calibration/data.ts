/** The base data a calibration run needs, read from data-raw (the 2026 schedule, climate, and name lists). */
import { readFileSync } from 'node:fs';
import { parseClimate } from '../../src/data/climate';
import { parseSchedule } from '../../src/data/schedule';
import type { CalibrationData } from '../../src/engine/calibration/replay';
import { nameData } from '../../tests/helpers/base-data';

export function loadData(): CalibrationData {
  return {
    names: nameData(),
    schedule: parseSchedule(readFileSync('data-raw/schedule-2026.csv', 'utf8'), 2026),
    climate: parseClimate(readFileSync('data-raw/climate.csv', 'utf8'))
  };
}
