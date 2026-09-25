import type { DBTrainingCandidateBox } from '../types.js';
import type { Migration } from './types.js';

interface LegacyTrainingBox extends Omit<DBTrainingCandidateBox, 'source'> {
  confidence?: number;
  source?: DBTrainingCandidateBox['source'];
}

function withSource(box: LegacyTrainingBox): DBTrainingCandidateBox {
  if (box.source) return box as DBTrainingCandidateBox;
  const { confidence, ...rest } = box;
  if (confidence === undefined || confidence >= 1) return { ...rest, source: 'drawn' };
  const source = box.label === 'face' ? 'face' : box.label === 'license_plate' ? 'plate' : 'object';
  return { ...rest, source, score: confidence };
}

const migration: Migration = {
  version: '2.2.9',
  description: 'training candidate boxes record where they came from instead of a confidence',
  async up(ctx) {
    await ctx.db.trainingCandidatesDB.transaction(() => {
      let converted = 0;
      for (const { key, value: candidate } of ctx.db.trainingCandidatesDB.getRange()) {
        const boxes = candidate.boxes as LegacyTrainingBox[];
        if (boxes.every((box) => box.source)) continue;
        ctx.db.trainingCandidatesDB.put(key, { ...candidate, boxes: boxes.map(withSource) });
        converted++;
      }
      ctx.logger.log(`Training candidates converted to box sources: ${converted}`);
    });
  },
};

export default migration;
