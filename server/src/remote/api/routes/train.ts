import { assertResponseOk, cloudFetch } from '../instance.js';

import type { TrainingBoxSource, TrainingSelection } from '../../../api/database/types.js';
import type { CloudCredentialStore } from '../credentialStore.js';

interface TrainSubmissionCreateResponse {
  id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  max_image_bytes: number;
}

export type TrainBoxEdit = 'moved' | 'resized' | 'relabeled';

export interface TrainSubmissionBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  source: TrainingBoxSource;
  score?: number;
  edited?: TrainBoxEdit[];
}

export interface TrainSubmissionDocument {
  v: 2;
  captured_at: number;
  meta: {
    camera_key: string;
    frame: { width: number; height: number };
    detector?: { plugin: string; plugin_version?: string };
    app_version: string;
    taxonomy: number;
    review_ms?: number;
    selection?: TrainingSelection;
    selection_score?: number;
  };
  boxes: TrainSubmissionBox[];
  rejected: TrainSubmissionBox[] | null;
  dismissed: TrainSubmissionBox[] | null;
}

export interface CloudTrainSubmission {
  id: string;
  status: string;
  labels: { label: string; x: number; y: number; width: number; height: number }[];
  image_bytes: number;
  created_at: string;
  used_in_wave?: string;
  image_url?: string;
}

export interface CloudTrainSubmissionPage {
  items: CloudTrainSubmission[];
  next_cursor?: string;
  total?: number;
}

const LIST_PAGE_SIZE = 30;

export class TrainRoute {
  constructor(private credentialStore: CloudCredentialStore) {}

  public async submit(document: TrainSubmissionDocument, image: Buffer): Promise<string> {
    const createRes = await this.fetchCloud()('/api/v1/train/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document),
    });
    await assertResponseOk(createRes);
    const created = (await createRes.json()) as TrainSubmissionCreateResponse;

    if (image.byteLength > created.max_image_bytes) {
      throw new Error('Image exceeds the submission size limit');
    }

    const uploadRes = await fetch(created.upload_url, {
      method: 'PUT',
      headers: created.upload_headers,
      body: new Uint8Array(image),
    });
    if (!uploadRes.ok) {
      throw new Error(`Image upload failed (${uploadRes.status})`);
    }

    const completeRes = await this.fetchCloud()(`/api/v1/train/submissions/${created.id}/complete`, { method: 'POST' });
    await assertResponseOk(completeRes);
    return created.id;
  }

  public async list(cursor?: string): Promise<CloudTrainSubmissionPage> {
    const params = new URLSearchParams({ limit: String(LIST_PAGE_SIZE) });
    if (cursor) params.set('cursor', cursor);
    const res = await this.fetchCloud()(`/api/v1/train/submissions?${params.toString()}`, { method: 'GET' });
    await assertResponseOk(res);
    return (await res.json()) as CloudTrainSubmissionPage;
  }

  public async remove(id: string): Promise<void> {
    const res = await this.fetchCloud()(`/api/v1/train/submissions/${id}`, { method: 'DELETE' });
    await assertResponseOk(res);
  }

  private fetchCloud() {
    return cloudFetch({
      target: 'cloud',
      credentialStore: this.credentialStore,
      requiredScopes: ['train:submit'],
    });
  }
}
