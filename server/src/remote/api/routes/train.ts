import { assertResponseOk, cloudFetch } from '../instance.js';

import type { DBTrainingCandidateBox } from '../../../api/database/types.js';
import type { CloudCredentialStore } from '../credentialStore.js';

interface TrainSubmissionCreateResponse {
  id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  max_image_bytes: number;
}

export interface CloudTrainSubmission {
  id: string;
  status: string;
  labels: DBTrainingCandidateBox[];
  image_bytes: number;
  created_at: string;
  used_in_wave?: string;
  image_url?: string;
}

export class TrainRoute {
  constructor(private credentialStore: CloudCredentialStore) {}

  public async submit(boxes: DBTrainingCandidateBox[], capturedAt: number, image: Buffer): Promise<string> {
    const createRes = await this.fetchCloud()('/api/v1/train/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxes, captured_at: capturedAt }),
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

  public async list(): Promise<CloudTrainSubmission[]> {
    const res = await this.fetchCloud()('/api/v1/train/submissions', { method: 'GET' });
    await assertResponseOk(res);
    return (await res.json()) as CloudTrainSubmission[];
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
